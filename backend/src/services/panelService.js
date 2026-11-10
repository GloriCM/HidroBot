import { randomToken, sha256 } from '../lib/crypto.js'
import { AppError } from '../lib/errors.js'
import { listGardensByUser } from '../repos/gardens.js'
import { getDeviceForUser, getZoneForUser } from '../repos/ownership.js'
import {
  expireOpenPending,
  expirePendingCommands,
  insertCommand,
  latestAckedIrrigation,
} from '../repos/commands.js'
import { insertDevice, listDevicesByZone, listStaleDevices } from '../repos/devices.js'
import { listAlertsForUser, markAlertRead } from '../repos/alerts.js'
import { listIrrigations, openIrrigation } from '../repos/irrigations.js'
import { deleteOldReadings, latestReading, listReadings } from '../repos/readings.js'
import {
  getPrimaryZoneForUser,
  getZoneSettings,
  listZonesByGarden,
  updateZoneSettings,
} from '../repos/zones.js'
import { raiseAlert } from './alertService.js'

function num(value) {
  return value == null ? null : Number(value)
}

function rangeToFrom(range) {
  const now = Date.now()
  const hours = range === '1h' ? 1 : range === '6h' ? 6 : range === '12h' ? 12 : 24
  return new Date(now - hours * 60 * 60 * 1000)
}

function formatBogota(iso) {
  return new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota' })
}

function isDeviceOnline(lastSeenAt, offlineMinutes) {
  if (!lastSeenAt) return false
  const ageMs = Date.now() - new Date(lastSeenAt).getTime()
  return ageMs <= offlineMinutes * 60 * 1000
}

function pumpActive(openEvent, lastAcked) {
  if (openEvent) return true
  if (!lastAcked?.acked_at || !lastAcked.seconds) return false
  const ends = new Date(lastAcked.acked_at).getTime() + Number(lastAcked.seconds) * 1000
  return Date.now() < ends
}

export async function getPanelSummary(app, userId) {
  const zone = await getPrimaryZoneForUser(app.db, userId)
  if (!zone) {
    return {
      zone: null,
      settings: null,
      device: null,
      latest: null,
      series: [],
      irrigations: [],
      alerts: [],
      online: false,
      pump: false,
    }
  }

  const settings = await getZoneSettings(app.db, zone.id)
  const devices = await listDevicesByZone(app.db, zone.id)
  const device = devices[0] || null
  let latest = null
  let series = []
  let pump = false
  let online = false

  if (device) {
    online = isDeviceOnline(device.last_seen_at, app.config.DEVICE_OFFLINE_MINUTES)
    latest = await latestReading(app.db, device.id)
    const readings = await listReadings(app.db, {
      deviceId: device.id,
      from: rangeToFrom('24h'),
    })
    series = readings.map((row) => ({
      at: row.recorded_at,
      humidity: num(row.humidity_pct),
      label: new Date(row.recorded_at).toLocaleTimeString('es-CO', {
        timeZone: 'America/Bogota',
        hour: '2-digit',
        minute: '2-digit',
      }),
    }))
    const open = await openIrrigation(app.db, zone.id)
    const lastAcked = await latestAckedIrrigation(app.db, device.id)
    pump = pumpActive(open, lastAcked)
  }

  const irrigations = await listIrrigations(app.db, zone.id, 20)
  const alerts = await listAlertsForUser(app.db, userId, 20)

  return {
    zone: {
      id: zone.id,
      name: zone.name,
      gardenId: zone.garden_id,
      gardenName: zone.garden_name,
    },
    settings: settings
      ? {
          thresholdPct: num(settings.threshold_pct),
          watchPct: num(settings.watch_pct),
          maxIrrigationSeconds: settings.max_irrigation_seconds,
          mode: settings.mode,
          updatedAt: settings.updated_at,
        }
      : null,
    device: device
      ? {
          id: device.id,
          name: device.name,
          lastSeenAt: device.last_seen_at,
          lastSeenLabel: device.last_seen_at ? formatBogota(device.last_seen_at) : null,
        }
      : null,
    latest: latest
      ? {
          humidity: num(latest.humidity_pct),
          recordedAt: latest.recorded_at,
          recordedLabel: formatBogota(latest.recorded_at),
        }
      : null,
    series,
    irrigations: irrigations.map((row) => ({
      id: row.id,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      reason: row.reason,
      secondsRequested: row.seconds_requested,
      secondsActual: row.seconds_actual,
      startedLabel: formatBogota(row.started_at),
    })),
    alerts: alerts.map((row) => ({
      id: row.id,
      type: row.type,
      severity: row.severity,
      message: row.message,
      readAt: row.read_at,
      createdAt: row.created_at,
      createdLabel: formatBogota(row.created_at),
    })),
    online,
    pump,
  }
}

export async function getReadingsSeries(app, userId, deviceId, range = '24h') {
  const device = await getDeviceForUser(app.db, deviceId, userId)
  if (!device) throw new AppError(404, 'Dispositivo no encontrado')
  const readings = await listReadings(app.db, {
    deviceId,
    from: rangeToFrom(range),
  })
  return readings.map((row) => ({
    at: row.recorded_at,
    humidity: num(row.humidity_pct),
    label: new Date(row.recorded_at).toLocaleTimeString('es-CO', {
      timeZone: 'America/Bogota',
      hour: '2-digit',
      minute: '2-digit',
    }),
  }))
}

export async function patchSettings(app, userId, zoneId, patch) {
  const zone = await getZoneForUser(app.db, zoneId, userId)
  if (!zone) throw new AppError(404, 'Zona no encontrada')
  const updated = await updateZoneSettings(app.db, zoneId, patch)
  return {
    thresholdPct: num(updated.threshold_pct),
    watchPct: num(updated.watch_pct),
    maxIrrigationSeconds: updated.max_irrigation_seconds,
    mode: updated.mode,
    updatedAt: updated.updated_at,
  }
}

export async function createDevice(app, userId, zoneId, name) {
  const zone = await getZoneForUser(app.db, zoneId, userId)
  if (!zone) throw new AppError(404, 'Zona no encontrada')
  const existing = await listDevicesByZone(app.db, zoneId)
  if (existing.length > 0) {
    throw new AppError(409, 'Esta zona ya tiene un dispositivo. Por ahora solo se admite uno.')
  }
  const apiKey = randomToken(24)
  const device = await insertDevice(app.db, {
    zoneId,
    name: name.trim() || 'ESP32',
    apiKeyHash: sha256(apiKey),
  })
  return {
    device: {
      id: device.id,
      name: device.name,
      zoneId: device.zone_id,
      createdAt: device.created_at,
    },
    apiKey,
  }
}

export async function queueIrrigate(app, userId, zoneId, seconds) {
  const zone = await getZoneForUser(app.db, zoneId, userId)
  if (!zone) throw new AppError(404, 'Zona no encontrada')
  const devices = await listDevicesByZone(app.db, zoneId)
  const device = devices[0]
  if (!device) throw new AppError(400, 'No hay dispositivo en esta zona')
  if (!isDeviceOnline(device.last_seen_at, app.config.DEVICE_OFFLINE_MINUTES)) {
    throw new AppError(409, 'El dispositivo está desconectado')
  }

  const settings = await getZoneSettings(app.db, zoneId)
  const maxSeconds = Number(settings?.max_irrigation_seconds ?? 60)
  const requested = Math.min(Math.max(Number(seconds || maxSeconds), 1), maxSeconds)
  const expiresAt = new Date(Date.now() + app.config.COMMAND_TTL_MINUTES * 60 * 1000)

  await expirePendingCommands(app.db, device.id)
  await expireOpenPending(app.db, device.id)
  const command = await insertCommand(app.db, {
    deviceId: device.id,
    type: 'irrigate',
    seconds: requested,
    expiresAt,
  })

  return {
    id: command.id,
    type: command.type,
    seconds: command.seconds,
    status: command.status,
    expiresAt: command.expires_at,
  }
}

export async function queueStop(app, userId, zoneId) {
  const zone = await getZoneForUser(app.db, zoneId, userId)
  if (!zone) throw new AppError(404, 'Zona no encontrada')
  const devices = await listDevicesByZone(app.db, zoneId)
  const device = devices[0]
  if (!device) throw new AppError(400, 'No hay dispositivo en esta zona')

  const expiresAt = new Date(Date.now() + app.config.COMMAND_TTL_MINUTES * 60 * 1000)
  await expireOpenPending(app.db, device.id)
  const command = await insertCommand(app.db, {
    deviceId: device.id,
    type: 'stop',
    seconds: null,
    expiresAt,
  })
  return {
    id: command.id,
    type: command.type,
    status: command.status,
    expiresAt: command.expires_at,
  }
}

export async function listUserAlerts(app, userId) {
  const alerts = await listAlertsForUser(app.db, userId, 50)
  return alerts.map((row) => ({
    id: row.id,
    type: row.type,
    severity: row.severity,
    message: row.message,
    readAt: row.read_at,
    createdAt: row.created_at,
    createdLabel: formatBogota(row.created_at),
  }))
}

export async function readAlert(app, userId, alertId) {
  const row = await markAlertRead(app.db, alertId, userId)
  if (!row) throw new AppError(404, 'Alerta no encontrada')
  return row
}

export async function listUserGardens(app, userId) {
  const gardens = await listGardensByUser(app.db, userId)
  const detailed = []
  for (const garden of gardens) {
    const zones = await listZonesByGarden(app.db, garden.id)
    detailed.push({
      id: garden.id,
      name: garden.name,
      createdAt: garden.created_at,
      zones: zones.map((z) => ({ id: z.id, name: z.name, createdAt: z.created_at })),
    })
  }
  return detailed
}

export async function runOfflineWatcher(app) {
  const stale = await listStaleDevices(app.db, app.config.DEVICE_OFFLINE_MINUTES)
  for (const device of stale) {
    await raiseAlert(app, {
      userId: device.user_id,
      zoneId: device.zone_id,
      deviceId: device.id,
      type: 'device_offline',
      severity: 'warning',
      message: `El dispositivo ${device.name} no envía lecturas.`,
    })
  }
  return stale.length
}

export async function runRetentionJob(app) {
  return deleteOldReadings(app.db, app.config.READINGS_RETENTION_DAYS)
}

export { isDeviceOnline }
