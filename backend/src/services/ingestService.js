import {
  batteryPctFromVoltage,
  humidityPctFromRaw,
  roundPct,
  tankPctFromDistance,
} from '../lib/calibration.js'
import { sha256Equal } from '../lib/crypto.js'
import { AppError } from '../lib/errors.js'
import { ensureCalibration, getCalibration } from '../repos/calibration.js'
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

async function resolveDevice(app, { deviceId, mqttId, deviceKey }) {
  let device = null
  if (deviceId) device = await findDeviceById(app.db, deviceId)
  else if (mqttId) device = await findDeviceByMqttId(app.db, mqttId)
  if (!device) throw new AppError(404, 'Dispositivo no encontrado')
  if (!sha256Equal(deviceKey, device.api_key_hash)) {
    throw new AppError(401, 'Clave de dispositivo inválida')
  }
  return device
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
  const prevSource = device.last_source
  const calibration = (await getCalibration(app.db, device.id)) || (await ensureCalibration(app.db, device.id))

  const humidityRaw = Number(input.humedad_raw)
  const distanceCm = Number(input.distancia_cm)
  const vRed = Number(input.v_red)
  const vBat = Number(input.v_bat)
  const source = input.fuente === 'bateria' ? 'bateria' : 'red'
  const pump = Boolean(input.bomba)
  const rssi = input.rssi == null ? null : Number(input.rssi)

  const humidityPct = roundPct(humidityPctFromRaw(humidityRaw, calibration))
  const tankPct = roundPct(tankPctFromDistance(distanceCm, calibration))
  const batteryPct = roundPct(batteryPctFromVoltage(vBat, calibration))

  let recordedAt = null
  if (input.recordedAt) {
    const parsed = new Date(input.recordedAt)
    if (Number.isNaN(parsed.getTime())) throw new AppError(400, 'recordedAt inválido')
    recordedAt = parsed
  }

  const row = await insertTelemetry(app.db, {
    deviceId: device.id,
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

  await updateDeviceRuntime(app.db, device.id, {
    online: true,
    source,
    pump,
    lastSeenAt: row.recorded_at,
  })
  await touchDeviceSeen(app.db, device.id, row.recorded_at)

  const settings = await getZoneSettings(app.db, device.zone_id)
  const tankMin = Number(settings?.tank_min_pct ?? 10)
  const batteryMin = Number(settings?.battery_min_pct ?? 30)
  const threshold = Number(settings?.threshold_pct ?? 35)

  if (prevSource === 'red' && source === 'bateria') {
    await raiseAlert(app, {
      userId: device.user_id,
      zoneId: device.zone_id,
      deviceId: device.id,
      type: 'power_cut',
      severity: 'warning',
      message: `Corte de red: ${device.name} pasó a batería.`,
    })
  }
  if (prevSource === 'bateria' && source === 'red') {
    await raiseAlert(app, {
      userId: device.user_id,
      zoneId: device.zone_id,
      deviceId: device.id,
      type: 'power_restored',
      severity: 'info',
      message: `Red restablecida en ${device.name}.`,
    })
  }
  if (source === 'bateria' && batteryPct < batteryMin) {
    await raiseAlert(app, {
      userId: device.user_id,
      zoneId: device.zone_id,
      deviceId: device.id,
      type: 'battery_low',
      severity: 'warning',
      message: `Batería baja (${batteryPct}%) en ${device.name}.`,
    })
  }
  if (tankPct < tankMin) {
    await raiseAlert(app, {
      userId: device.user_id,
      zoneId: device.zone_id,
      deviceId: device.id,
      type: 'tank_low',
      severity: 'warning',
      message: `Tanque bajo (${tankPct}%) en ${device.name}.`,
    })
  }
  if (humidityPct < threshold) {
    await raiseAlert(app, {
      userId: device.user_id,
      zoneId: device.zone_id,
      deviceId: device.id,
      type: 'dry_persistent',
      severity: 'warning',
      message: `Humedad baja (${humidityPct}%) en ${device.name}.`,
    })
  }

  const decision = await decideIrrigation(app.db, {
    device,
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
  if (!online) {
    await raiseAlert(app, {
      userId: device.user_id,
      zoneId: device.zone_id,
      deviceId: device.id,
      type: 'device_offline',
      severity: 'warning',
      message: `El dispositivo ${device.name} está offline (MQTT).`,
    })
  }
  return { ok: true, online }
}

export async function ingestEvent(app, input) {
  const device = await resolveDevice(app, input)
  const tipo = input.tipo

  if (tipo === 'riego_inicio') {
    const open = await openIrrigation(app.db, device.zone_id)
    if (!open) {
      await insertIrrigationEvent(app.db, {
        zoneId: device.zone_id,
        deviceId: device.id,
        reason: 'manual',
        secondsRequested: input.segundos ?? null,
      })
    }
    await updateDeviceRuntime(app.db, device.id, { pump: true })
  } else if (tipo === 'riego_fin') {
    await closeOpenIrrigation(app.db, device.zone_id, {
      secondsActual: input.segundos ?? null,
    })
    await updateDeviceRuntime(app.db, device.id, { pump: false })
  } else if (tipo === 'bloqueo_tanque_vacio') {
    await raiseAlert(app, {
      userId: device.user_id,
      zoneId: device.zone_id,
      deviceId: device.id,
      type: 'tank_empty',
      severity: 'critical',
      message: `Tanque vacío: riego bloqueado en ${device.name}.`,
    })
    await updateDeviceRuntime(app.db, device.id, { pump: false })
  } else {
    throw new AppError(400, 'tipo de evento inválido')
  }

  return { ok: true }
}

export async function getIngestConfig(app, { deviceId, mqttId, deviceKey }) {
  const device = await resolveDevice(app, { deviceId, mqttId, deviceKey })
  const settings = await getZoneSettings(app.db, device.zone_id)
  const calibration = (await getCalibration(app.db, device.id)) || (await ensureCalibration(app.db, device.id))
  return mapConfig(settings, calibration, device)
}

/** @deprecated usar ingestTelemetry */
export async function ingestReading(app, { deviceId, humidity, recordedAt, deviceKey }) {
  throw new AppError(410, 'Deprecated: usa POST /api/ingest/telemetry', {
    code: 'DEPRECATED',
  })
}
