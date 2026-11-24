import { generateClaimCode, hashClaimCode, normalizeClaimCode } from '../lib/claimCode.js'
import { assertMqttIdMatchesMac, normalizeMac } from '../lib/deviceIdentity.js'
import { AppError } from '../lib/errors.js'
import { ensureCalibration } from '../repos/calibration.js'
import {
  countRecentFailedClaims,
  findActiveClaimCode,
  findValidCodeForClaim,
  insertClaimCode,
  invalidateUnusedCodes,
  markClaimCodeUsed,
  recordClaimAttempt,
} from '../repos/claimCodes.js'
import {
  claimDeviceRow,
  findDeviceRowByMqttId,
  insertUnclaimedDevice,
  unclaimDeviceRow,
  updateDeviceName,
  updateDevicePresent,
} from '../repos/devices.js'
import {
  closeOwnership,
  deleteOwnershipData,
  getActiveOwnership,
  insertOwnership,
} from '../repos/deviceOwnerships.js'
import { getZoneForUser } from '../repos/ownership.js'
import { listDevicesByZone } from '../repos/devices.js'
import { isDeviceOnline } from '../lib/deviceOnline.js'
import { publishDeviceConfig } from './panelService.js'
import { publishToNodeRed } from './nodered.js'

const CLAIM_PORTAL_URL = 'hidrobot.jelabs.net'

export function claimCodeTtlMs(config) {
  const minutes = Number(config.CLAIM_CODE_TTL_MINUTES ?? 10)
  return minutes * 60 * 1000
}

async function ensureClaimCode(app, device, { freshOnPresent = false } = {}) {
  const now = new Date()
  const existing = await findActiveClaimCode(app.db, device.id, now)
  if (existing && !freshOnPresent) {
    return {
      expiresAt: existing.expires_at,
      expiresInSec: Math.max(0, Math.floor((new Date(existing.expires_at).getTime() - now.getTime()) / 1000)),
      codeHash: existing.code_hash,
      regenerated: false,
      plain: null,
    }
  }
  if (existing && freshOnPresent) {
    await invalidateUnusedCodes(app.db, device.id)
  }
  const generated = generateClaimCode()
  const expiresAt = new Date(now.getTime() + claimCodeTtlMs(app.config))
  await insertClaimCode(app.db, {
    deviceId: device.id,
    codeHash: generated.hash,
    expiresAt,
  })
  return {
    plain: generated.plain,
    expiresAt,
    expiresInSec: Math.floor(claimCodeTtlMs(app.config) / 1000),
    regenerated: true,
  }
}

export async function publishVinculacion(app, mqttId, payload) {
  return publishToNodeRed(app.config, {
    mqttId,
    kind: 'vinculacion',
    payload,
    log: app.log,
  })
}

async function publishPendingLink(app, device, codeInfo) {
  if (!codeInfo.plain) return null
  return publishVinculacion(app, device.mqtt_id, {
    estado: 'pendiente',
    codigo: codeInfo.plain,
    expira_en_s: codeInfo.expiresInSec,
    url: CLAIM_PORTAL_URL,
  })
}

export async function ingestHola(app, { mqttId, mac, versionFirmware }) {
  const normalizedMac = normalizeMac(mac)
  const id = assertMqttIdMatchesMac(mqttId, normalizedMac)

  let device = await findDeviceRowByMqttId(app.db, id)
  if (!device) {
    device = await insertUnclaimedDevice(app.db, {
      name: 'HidroBot',
      mqttId: id,
      mac: normalizedMac,
    })
    await ensureCalibration(app.db, device.id)
  }

  await updateDevicePresent(app.db, device.id, {
    mac: normalizedMac,
    firmwareVersion: versionFirmware,
    lastSeenAt: new Date(),
  })
  device = await findDeviceRowByMqttId(app.db, id)

  if (device.ownership_status === 'claimed' && device.zone_id) {
    const ownership = await getActiveOwnership(app.db, device.id)
    await publishVinculacion(app, device.mqtt_id, {
      estado: 'vinculado',
      nombre: device.name,
    })
    await publishDeviceConfig(app, device)
    return {
      ok: true,
      ownership: 'claimed',
      mqttId: device.mqtt_id,
      deviceId: device.id,
    }
  }

  const codeInfo = await ensureClaimCode(app, device)
  if (codeInfo.plain) {
    await publishPendingLink(app, device, codeInfo)
  }

  return {
    ok: true,
    ownership: 'unclaimed',
    mqttId: device.mqtt_id,
    deviceId: device.id,
  }
}

function clientIp(request) {
  return request.ip || request.headers['x-forwarded-for']?.split(',')[0]?.trim() || null
}

export async function claimDevice(app, userId, { code, zoneId, name, ip = null }) {
  const maxAttempts = Number(app.config.CLAIM_MAX_ATTEMPTS ?? 10)
  const windowMinutes = Number(app.config.CLAIM_WINDOW_MINUTES ?? 15)

  const normalized = normalizeClaimCode(code)
  if (normalized.length !== 6) {
    throw new AppError(400, 'Código inválido')
  }

  const zone = await getZoneForUser(app.db, zoneId, userId)
  if (!zone) throw new AppError(404, 'Zona no encontrada')

  const existingZoneDevices = await listDevicesByZone(app.db, zoneId)
  if (existingZoneDevices.length > 0) {
    throw new AppError(409, 'Esta zona ya tiene un dispositivo.')
  }

  const failures = await countRecentFailedClaims(app.db, { userId, ip, windowMinutes })
  if (failures.by_user >= maxAttempts || failures.by_ip >= maxAttempts) {
    throw new AppError(429, 'Demasiados intentos. Espera unos minutos.')
  }

  const codeHash = hashClaimCode(normalized)
  const row = await findValidCodeForClaim(app.db, codeHash)
  if (!row) {
    await recordClaimAttempt(app.db, { userId, ip, success: false })
    throw new AppError(404, 'Código incorrecto o caducado')
  }

  const finalName = String(name || 'HidroBot').trim().slice(0, 80)
  const claimed = await claimDeviceRow(app.db, row.device_id, {
    zoneId,
    name: finalName,
  })
  if (!claimed) {
    await recordClaimAttempt(app.db, { userId, ip, success: false })
    throw new AppError(409, 'El dispositivo ya fue reclamado')
  }

  await markClaimCodeUsed(app.db, row.id)
  const ownership = await insertOwnership(app.db, {
    deviceId: claimed.id,
    userId,
    zoneId,
    deviceName: finalName,
  })

  await recordClaimAttempt(app.db, { userId, ip, success: true })

  await publishVinculacion(app, claimed.mqtt_id, {
    estado: 'vinculado',
    nombre: finalName,
  })
  await publishDeviceConfig(app, claimed)

  return {
    device: {
      id: claimed.id,
      name: claimed.name,
      mqttId: claimed.mqtt_id,
      zoneId,
      ownershipId: ownership.id,
    },
  }
}

export async function unlinkDevice(app, userId, deviceId, { keepHistory = true } = {}) {
  const { getDeviceForUser } = await import('../repos/ownership.js')
  const device = await getDeviceForUser(app.db, deviceId, userId)
  if (!device) throw new AppError(404, 'Dispositivo no encontrado')

  const ownership = await getActiveOwnership(app.db, deviceId)
  if (!ownership) throw new AppError(400, 'El dispositivo no está vinculado')

  const closed = await closeOwnership(app.db, ownership.id)
  if (!closed) throw new AppError(400, 'No se pudo desvincular')

  if (!keepHistory) {
    await deleteOwnershipData(app.db, ownership.id)
  }

  const unclaimed = await unclaimDeviceRow(app.db, deviceId)
  if (!unclaimed) throw new AppError(500, 'Error al desvincular dispositivo')

  await publishVinculacion(app, unclaimed.mqtt_id, { estado: 'desvinculado' })

  const codeInfo = await ensureClaimCode(app, unclaimed, { freshOnPresent: true })
  if (codeInfo.plain) {
    await publishVinculacion(app, unclaimed.mqtt_id, {
      estado: 'pendiente',
      codigo: codeInfo.plain,
      expira_en_s: codeInfo.expiresInSec,
      url: CLAIM_PORTAL_URL,
    })
  }

  return { ok: true, keepHistory: Boolean(keepHistory) }
}

export async function patchDeviceForUser(app, userId, deviceId, { name }) {
  const { getDeviceForUser } = await import('../repos/ownership.js')
  const device = await getDeviceForUser(app.db, deviceId, userId)
  if (!device) throw new AppError(404, 'Dispositivo no encontrado')
  const trimmed = String(name || '').trim()
  if (!trimmed) throw new AppError(400, 'Nombre inválido')
  const updated = await updateDeviceName(app.db, deviceId, trimmed.slice(0, 80))
  const ownership = await getActiveOwnership(app.db, deviceId)
  if (ownership) {
    await app.db.query(`UPDATE device_ownerships SET device_name = $2 WHERE id = $1`, [
      ownership.id,
      updated.name,
    ])
  }
  return { id: deviceId, name: updated.name }
}

function mapDeviceListRow(row, offlineMin) {
  return {
    id: row.id,
    name: row.name,
    mqttId: row.mqtt_id,
    firmwareVersion: row.firmware_version,
    online: isDeviceOnline(row, offlineMin),
    lastSeenAt: row.last_seen_at,
    zoneId: row.zone_id,
    zoneName: row.zone_name,
    gardenId: row.garden_id,
    gardenName: row.garden_name,
    ownershipId: row.ownership_id,
  }
}

export async function listDevices(app, userId) {
  const {
    listActiveDevicesForUser,
    listLegacyClaimedDevicesForUser,
    listPastOwnershipsForUser,
  } = await import('../repos/deviceOwnerships.js')
  const active = await listActiveDevicesForUser(app.db, userId)
  const legacy = await listLegacyClaimedDevicesForUser(app.db, userId)
  const seen = new Set(active.map((row) => row.id))
  const merged = [...active, ...legacy.filter((row) => !seen.has(row.id))]
  const past = await listPastOwnershipsForUser(app.db, userId)
  const offlineMin = Number(app.config.DEVICE_OFFLINE_MINUTES ?? 15)
  return {
    devices: merged.map((row) => mapDeviceListRow(row, offlineMin)),
    previous: past.map((row) => ({
      ownershipId: row.id,
      deviceId: row.device_id,
      name: row.device_name,
      zoneName: row.zone_name,
      gardenName: row.garden_name,
      claimedAt: row.claimed_at,
      unclaimedAt: row.unclaimed_at,
    })),
  }
}