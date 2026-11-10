import { sha256Equal } from '../lib/crypto.js'
import { AppError } from '../lib/errors.js'
import { findDeviceById, touchDeviceSeen } from '../repos/devices.js'
import { insertReading } from '../repos/readings.js'
import { getZoneSettings } from '../repos/zones.js'
import { raiseAlert } from './alertService.js'
import { decideIrrigation } from './irrigationDecision.js'

export async function ingestReading(app, { deviceId, humidity, recordedAt, deviceKey }) {
  const device = await findDeviceById(app.db, deviceId)
  if (!device) throw new AppError(404, 'Dispositivo no encontrado')
  if (!sha256Equal(deviceKey, device.api_key_hash)) {
    throw new AppError(401, 'Clave de dispositivo inválida')
  }

  const humidityPct = Number(humidity)
  if (!Number.isFinite(humidityPct) || humidityPct < 0 || humidityPct > 100) {
    throw new AppError(400, 'humidity debe estar entre 0 y 100')
  }

  let at = null
  if (recordedAt) {
    const parsed = new Date(recordedAt)
    if (Number.isNaN(parsed.getTime())) throw new AppError(400, 'recordedAt inválido')
    at = parsed
  }

  const reading = await insertReading(app.db, {
    deviceId: device.id,
    humidityPct,
    recordedAt: at,
  })
  await touchDeviceSeen(app.db, device.id, reading.recorded_at)

  const decision = await decideIrrigation(app.db, {
    device,
    humidity: humidityPct,
  })

  const settings = await getZoneSettings(app.db, device.zone_id)
  const threshold = Number(settings?.threshold_pct ?? 35)
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

  return {
    regar: decision.regar,
    segundos: decision.segundos,
    motivo: decision.motivo,
    reading: {
      id: reading.id,
      humidity: Number(reading.humidity_pct),
      recordedAt: reading.recorded_at,
    },
  }
}

export async function getIngestConfig(app, { deviceId, deviceKey }) {
  const device = await findDeviceById(app.db, deviceId)
  if (!device) throw new AppError(404, 'Dispositivo no encontrado')
  if (!sha256Equal(deviceKey, device.api_key_hash)) {
    throw new AppError(401, 'Clave de dispositivo inválida')
  }

  const settings = await getZoneSettings(app.db, device.zone_id)
  return {
    deviceId: device.id,
    zoneId: device.zone_id,
    thresholdPct: Number(settings?.threshold_pct ?? 35),
    watchPct: Number(settings?.watch_pct ?? 55),
    maxIrrigationSeconds: Number(settings?.max_irrigation_seconds ?? 60),
    mode: settings?.mode || 'auto',
  }
}
