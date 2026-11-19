import {
  batteryPctFromVoltage,
  humidityPctFromRaw,
  roundPct,
  tankPctFromDistance,
} from '../lib/calibration.js'
import { AppError } from '../lib/errors.js'
import { ensureCalibration, getCalibration } from '../repos/calibration.js'
import { getActiveOwnership } from '../repos/deviceOwnerships.js'
import {
  findDeviceById,
  findDeviceByMqttId,
  touchDeviceSeen,
  updateDeviceRuntime,
} from '../repos/devices.js'
import { closeOpenIrrigation, insertIrrigationEvent, openIrrigation } from '../repos/irrigations.js'
import { insertTelemetry } from '../repos/telemetry.js'
import { getZoneSettings } from '../repos/zones.js'
import { raiseAlert } from './alertService.js'
import { decideIrrigation } from './irrigationDecision.js'
import { publishDeviceConfig } from './panelService.js'

async function resolveDevice(app, { deviceId, mqttId }) {
  let device = null
  if (deviceId) device = await findDeviceById(app.db, deviceId)
  else if (mqttId) device = await findDeviceByMqttId(app.db, mqttId)
  if (!device) throw new AppError(404, 'Dispositivo no encontrado')
  return device
}

async function resolveClaimedContext(app, device) {
  if (device.ownership_status !== 'claimed' || !device.zone_id) {
    return null
  }
  const ownership = await getActiveOwnership(app.db, device.id)
  if (!ownership) return null
  return {
    ...device,
    zone_id: ownership.zone_id,
    user_id: ownership.user_id,
    ownership_id: ownership.id,
  }
}

function mapConfig(settings, calibration, device) {
  return {
    deviceId: device.id,
    mqttId: device.mqtt_id,
    zoneId: device.zone_id,
    umbral_humedad: Number(settings?.threshold_pct ?? 35),
    duracion_max_s: Number(settings?.max_irrigation_seconds ?? 60),
    modo: settings?.mode || 'auto',
    tank_min_pct: Number(settings?.tank_min_pct ?? 10),
    battery_min_pct: Number(settings?.battery_min_pct ?? 30),
    allow_manual_on_battery: Boolean(settings?.allow_manual_on_battery),
    calibracion: {
      humedad_raw_seco: calibration.humidity_raw_dry,
      humedad_raw_mojado: calibration.humidity_raw_wet,
      distancia_lleno_cm: Number(calibration.distance_full_cm),
      distancia_vacio_cm: Number(calibration.distance_empty_cm),
      bateria_v_vacio: Number(calibration.battery_v_empty),
      bateria_v_lleno: Number(calibration.battery_v_full),
    },
  }
}

export async function ingestTelemetry(app, input) {
  const device = await resolveDevice(app, input)
  const ctx = await resolveClaimedContext(app, device)
  if (!ctx) {
    await updateDeviceRuntime(app.db, device.id, {
      online: true,
      lastSeenAt: new Date(),
    })
    await touchDeviceSeen(app.db, device.id, new Date())
    return {
      ok: true,
      discarded: true,
      regar: false,
      segundos: 0,
      motivo: 'sin_dueño',
    }
  }

  const prevSource = ctx.last_source
  const calibration = (await getCalibration(app.db, ctx.id)) || (await ensureCalibration(app.db, ctx.id))

  const humidityRaw = Number(input.humedad_raw)
  const hasDistance =
    input.distancia_cm !== null &&
    input.distancia_cm !== undefined &&
    Number.isFinite(Number(input.distancia_cm))
  const distanceCm = hasDistance ? Number(input.distancia_cm) : null
  const vRed = Number(input.v_red)
  const vBat = Number(input.v_bat)
  const source = input.fuente === 'bateria' ? 'bateria' : 'red'
  const pump = Boolean(input.bomba)
  const rssi = input.rssi == null ? null : Number(input.rssi)

  const humidityPct = roundPct(humidityPctFromRaw(humidityRaw, calibration))
  const tankPct = hasDistance
    ? roundPct(tankPctFromDistance(distanceCm, calibration))
    : null
  const batteryPct = roundPct(batteryPctFromVoltage(vBat, calibration))

  let recordedAt = null
  if (input.recordedAt) {
    const parsed = new Date(input.recordedAt)
    if (Number.isNaN(parsed.getTime())) throw new AppError(400, 'recordedAt inválido')
    recordedAt = parsed
  }

  const row = await insertTelemetry(app.db, {
    deviceId: ctx.id,
    ownershipId: ctx.ownership_id,
    humidityRaw,
    humidityPct,
    distanceCm,
    tankPct,
    vRed,
    vBat,
    batteryPct,
    source,
    pump,
    rssi,
    recordedAt,
  })

  await updateDeviceRuntime(app.db, ctx.id, {
    online: true,
    source,
    pump,
    lastSeenAt: row.recorded_at,
  })
  await touchDeviceSeen(app.db, ctx.id, row.recorded_at)

  const settings = await getZoneSettings(app.db, ctx.zone_id)
  const tankMin = Number(settings?.tank_min_pct ?? 10)
  const batteryMin = Number(settings?.battery_min_pct ?? 30)
  const threshold = Number(settings?.threshold_pct ?? 35)

  if (prevSource === 'red' && source === 'bateria') {
    await raiseAlert(app, {
      userId: ctx.user_id,
      zoneId: ctx.zone_id,
      deviceId: ctx.id,
      ownershipId: ctx.ownership_id,
      type: 'power_cut',
      severity: 'warning',
      message: `Corte de red: ${ctx.name} pasó a batería.`,
    })
  }
  if (prevSource === 'bateria' && source === 'red') {
    await raiseAlert(app, {
      userId: ctx.user_id,
      zoneId: ctx.zone_id,
      deviceId: ctx.id,
      ownershipId: ctx.ownership_id,
      type: 'power_restored',
      severity: 'info',
      message: `Red restablecida en ${ctx.name}.`,
    })
  }
  if (source === 'bateria' && batteryPct < batteryMin) {
    await raiseAlert(app, {
      userId: ctx.user_id,
      zoneId: ctx.zone_id,
      deviceId: ctx.id,
      ownershipId: ctx.ownership_id,
      type: 'battery_low',
      severity: 'warning',
      message: `Batería baja (${batteryPct}%) en ${ctx.name}.`,
    })
  }
  if (!hasDistance) {
    await raiseAlert(app, {
      userId: ctx.user_id,
      zoneId: ctx.zone_id,
      deviceId: ctx.id,
      ownershipId: ctx.ownership_id,
      type: 'sensor_tanque_sin_lectura',
      severity: 'warning',
      message: `Sensor de tanque sin lectura en ${ctx.name}.`,
    })
  } else if (tankPct < tankMin) {
    await raiseAlert(app, {
      userId: ctx.user_id,
      zoneId: ctx.zone_id,
      deviceId: ctx.id,
      ownershipId: ctx.ownership_id,
      type: 'tank_low',
      severity: 'warning',
      message: `Tanque bajo (${tankPct}%) en ${ctx.name}.`,
    })
  }
  if (humidityPct < threshold) {
    await raiseAlert(app, {
      userId: ctx.user_id,
      zoneId: ctx.zone_id,
      deviceId: ctx.id,
      ownershipId: ctx.ownership_id,
      type: 'dry_persistent',
      severity: 'warning',
      message: `Humedad baja (${humidityPct}%) en ${ctx.name}.`,
    })
  }

  const decision = await decideIrrigation(app.db, {
    device: ctx,
    humidityPct,
    tankPct,
    batteryPct,
    source,
  })

  return {
    regar: decision.regar,
    segundos: decision.segundos,
    motivo: decision.motivo,
    telemetry: {
      humidity_pct: humidityPct,
      tank_pct: tankPct,
      battery_pct: batteryPct,
      source,
      recorded_at: row.recorded_at,
    },
  }
}

export async function ingestStatus(app, input) {
  const device = await resolveDevice(app, input)
  const online = input.status === 'online'
  await updateDeviceRuntime(app.db, device.id, {
    online,
    lastSeenAt: online ? new Date() : undefined,
  })
  const ctx = await resolveClaimedContext(app, device)
  if (!online && ctx) {
    await raiseAlert(app, {
      userId: ctx.user_id,
      zoneId: ctx.zone_id,
      deviceId: ctx.id,
      ownershipId: ctx.ownership_id,
      type: 'device_offline',
      severity: 'warning',
      message: `El dispositivo ${ctx.name} está offline (MQTT).`,
    })
  }
  return { ok: true, online }
}

export async function ingestEvent(app, input) {
  const device = await resolveDevice(app, input)
  const ctx = await resolveClaimedContext(app, device)
  if (!ctx) {
    return { ok: true, discarded: true }
  }
  const tipo = input.tipo

  if (tipo === 'riego_inicio') {
    const open = await openIrrigation(app.db, ctx.zone_id)
    if (!open) {
      await insertIrrigationEvent(app.db, {
        zoneId: ctx.zone_id,
        deviceId: ctx.id,
        ownershipId: ctx.ownership_id,
        reason: 'manual',
        secondsRequested: input.segundos ?? null,
      })
    }
    await updateDeviceRuntime(app.db, ctx.id, { pump: true })
  } else if (tipo === 'riego_fin') {
    await closeOpenIrrigation(app.db, ctx.zone_id, {
      secondsActual: input.segundos ?? null,
    })
    await updateDeviceRuntime(app.db, ctx.id, { pump: false })
  } else if (tipo === 'bloqueo_tanque_vacio') {
    await raiseAlert(app, {
      userId: ctx.user_id,
      zoneId: ctx.zone_id,
      deviceId: ctx.id,
      ownershipId: ctx.ownership_id,
      type: 'tank_empty',
      severity: 'critical',
      message: `Tanque vacío: riego bloqueado en ${ctx.name}.`,
    })
    await updateDeviceRuntime(app.db, ctx.id, { pump: false })
  } else {
    throw new AppError(400, 'tipo de evento inválido')
  }

  return { ok: true }
}

export async function getIngestConfig(app, { deviceId, mqttId }) {
  const device = await resolveDevice(app, { deviceId, mqttId })
  const ctx = await resolveClaimedContext(app, device)
  if (!ctx) throw new AppError(403, 'Dispositivo sin dueño')
  const settings = await getZoneSettings(app.db, ctx.zone_id)
  const calibration = (await getCalibration(app.db, ctx.id)) || (await ensureCalibration(app.db, ctx.id))
  return mapConfig(settings, calibration, ctx)
}

/**
 * El ESP32 pide config tras conectar (MQTT config/solicitar → Node-RED → aquí).
 * La API responde publicando hidrobot/<id>/config sin retain.
 */
export async function requestConfigPush(app, { deviceId, mqttId }) {
  const device = await resolveDevice(app, { deviceId, mqttId })
  const ctx = await resolveClaimedContext(app, device)
  if (!ctx) {
    return { ok: false, mqttId: device.mqtt_id, pushed: false, reason: 'unclaimed' }
  }
  const push = await publishDeviceConfig(app, ctx)
  return {
    ok: Boolean(push?.ok),
    mqttId: device.mqtt_id,
    pushed: Boolean(push?.ok),
    reason: push?.reason || null,
  }
}

/** @deprecated usar ingestTelemetry */
export async function ingestReading(app, { deviceId, humidity, recordedAt, deviceKey }) {
  throw new AppError(410, 'Deprecated: usa POST /api/ingest/telemetry', {
    code: 'DEPRECATED',
  })
}
