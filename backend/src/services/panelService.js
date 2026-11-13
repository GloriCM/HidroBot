import { randomToken, sha256 } from '../lib/crypto.js'
import { AppError } from '../lib/errors.js'
import { listAlertsForUser, markAlertRead } from '../repos/alerts.js'
import { ensureCalibration, updateCalibration } from '../repos/calibration.js'
import {
  expireOpenPending,
  expirePendingCommands,
  insertCommand,
  latestAckedIrrigation,
} from '../repos/commands.js'
import {
  insertDevice,
  listAllDevices,
  listDevicesByZone,
  listStaleDevices,
  updateDeviceRuntime,
} from '../repos/devices.js'
import { listGardensByUser } from '../repos/gardens.js'
import { listIrrigations, listIrrigationsInRange, openIrrigation } from '../repos/irrigations.js'
import { getDeviceForUser, getZoneForUser } from '../repos/ownership.js'
import { deleteOldReadings } from '../repos/readings.js'
import {
  deleteOldTelemetry,
  latestTelemetry,
  listTelemetry,
  listTelemetryAggregated,
} from '../repos/telemetry.js'
import {
  getPrimaryZoneForUser,
  getZoneSettings,
  listZonesByGarden,
  updateZoneSettings,
} from '../repos/zones.js'
import { raiseAlert } from './alertService.js'
import { publishToNodeRed } from './nodered.js'

function num(value) {
  return value == null ? null : Number(value)
}

/** Intervalo de envío del ESP32 (ms). Hueco = 3× este valor en crudo. */
export const TELEMETRY_SEND_INTERVAL_MS = 10_000

/**
 * Config de agregación por rango del gráfico.
 * 1h crudo · 6h /1 min · 12h /2 min · 24h /5 min
 */
export function rangeAggregation(range) {
  const hours = range === '1h' ? 1 : range === '6h' ? 6 : range === '12h' ? 12 : 24
  if (range === '1h') {
    return {
      hours,
      binInterval: null,
      intervalSeconds: TELEMETRY_SEND_INTERVAL_MS / 1000,
      gapMs: TELEMETRY_SEND_INTERVAL_MS * 3,
    }
  }
  if (range === '6h') {
    return { hours, binInterval: '1 minute', intervalSeconds: 60, gapMs: 60_000 * 3 }
  }
  if (range === '12h') {
    return { hours, binInterval: '2 minutes', intervalSeconds: 120, gapMs: 120_000 * 3 }
  }
  return { hours, binInterval: '5 minutes', intervalSeconds: 300, gapMs: 300_000 * 3 }
}

function rangeWindow(range, now = new Date()) {
  const { hours } = rangeAggregation(range)
  const to = new Date(now)
  const from = new Date(to.getTime() - hours * 60 * 60 * 1000)
  return { from, to }
}

function formatBogota(iso) {
  return new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota' })
}

function formatBogotaTime(iso, withSeconds = false) {
  return new Date(iso).toLocaleTimeString('es-CO', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
  })
}

/**
 * Inserta puntos nulos para cortar la línea cuando hay huecos reales.
 * @param {Array<Record<string, unknown>>} points
 * @param {number} gapMs
 */
export function insertGapBreaks(points, gapMs) {
  if (!points.length) return points
  const out = []
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i]
    if (i > 0) {
      const prev = points[i - 1]
      const dt = Number(point.t) - Number(prev.t)
      if (dt > gapMs) {
        out.push({
          t: Number(prev.t) + 1,
          at: null,
          label: null,
          humidity: null,
          humidityMin: null,
          humidityMax: null,
          tank: null,
          battery: null,
          vRed: null,
          vBat: null,
          source: null,
          pump: null,
          rssi: null,
          gap: true,
        })
      }
    }
    out.push(point)
  }
  return out
}

function isDeviceOnline(device, offlineMinutes) {
  if (device.online === false) return false
  if (!device.last_seen_at) return false
  const ageMs = Date.now() - new Date(device.last_seen_at).getTime()
  return ageMs <= offlineMinutes * 60 * 1000
}

function pumpActive(device, openEvent, lastAcked) {
  if (device?.last_pump) return true
  if (openEvent) return true
  if (!lastAcked?.acked_at || !lastAcked.seconds) return false
  const ends = new Date(lastAcked.acked_at).getTime() + Number(lastAcked.seconds) * 1000
  return Date.now() < ends
}

function mapSettings(settings) {
  if (!settings) return null
  return {
    thresholdPct: num(settings.threshold_pct),
    watchPct: num(settings.watch_pct),
    maxIrrigationSeconds: settings.max_irrigation_seconds,
    mode: settings.mode,
    tankMinPct: num(settings.tank_min_pct),
    batteryMinPct: num(settings.battery_min_pct),
    allowManualOnBattery: Boolean(settings.allow_manual_on_battery),
    updatedAt: settings.updated_at,
  }
}

function mapCalibration(row) {
  if (!row) return null
  return {
    humidityRawDry: row.humidity_raw_dry,
    humidityRawWet: row.humidity_raw_wet,
    distanceFullCm: num(row.distance_full_cm),
    distanceEmptyCm: num(row.distance_empty_cm),
    batteryVEmpty: num(row.battery_v_empty),
    batteryVFull: num(row.battery_v_full),
    updatedAt: row.updated_at,
  }
}

function round1(value) {
  if (value == null || !Number.isFinite(Number(value))) return null
  return Math.round(Number(value) * 10) / 10
}

function mapTelemetryPoint(row, { aggregated = false, intervalSeconds = null, rawLatest = false } = {}) {
  const at = row.recorded_at
  const t = new Date(at).getTime()
  const isAgg = Boolean(aggregated) && !rawLatest
  const binEndT = isAgg && intervalSeconds ? t + intervalSeconds * 1000 : null
  return {
    t,
    at,
    binEndT,
    label: formatBogotaTime(at, false),
    labelFull: formatBogotaTime(at, true),
    humidity: round1(row.humidity_pct),
    humidityMin: round1(row.humidity_min ?? row.humidity_pct),
    humidityMax: round1(row.humidity_max ?? row.humidity_pct),
    tank: round1(row.tank_pct),
    battery: round1(row.battery_pct),
    vRed: round1(row.v_red),
    vBat: round1(row.v_bat),
    source: row.source,
    pump: row.pump == null ? null : Boolean(row.pump),
    rssi: row.rssi == null ? null : Number(row.rssi),
    samples: row.samples == null ? 1 : Number(row.samples),
    aggregated: isAgg,
    rawLatest: Boolean(rawLatest),
  }
}

/**
 * Asegura que el extremo derecho coincida con la última lectura cruda (tarjeta del panel).
 */
async function withLatestRawPoint(app, deviceId, series, { aggregated, intervalSeconds }) {
  const latest = await latestTelemetry(app.db, deviceId)
  if (!latest) return series
  const point = mapTelemetryPoint(latest, {
    aggregated: false,
    intervalSeconds: null,
    rawLatest: true,
  })
  const filtered = series.filter((p) => p.gap || Number(p.t) < point.t)
  const lastReal = [...filtered].reverse().find((p) => !p.gap)
  if (lastReal && Number(lastReal.t) === point.t && lastReal.rawLatest) {
    return filtered
  }
  filtered.push(point)
  // Si el rango es agregado, marcar puntos previos como agregados ya viene de map.
  void aggregated
  void intervalSeconds
  return filtered
}

function mapIrrigationMarker(row) {
  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    startedT: new Date(row.started_at).getTime(),
    endedT: row.ended_at ? new Date(row.ended_at).getTime() : null,
    reason: row.reason,
    secondsRequested: row.seconds_requested,
    secondsActual: row.seconds_actual,
  }
}

async function buildTelemetrySeries(app, { deviceId, zoneId, range, now = new Date() }) {
  const agg = rangeAggregation(range)
  const { from, to } = rangeWindow(range, now)
  const aggregated = Boolean(agg.binInterval)
  const mapOpts = { aggregated, intervalSeconds: agg.intervalSeconds }
  const rows = aggregated
    ? await listTelemetryAggregated(app.db, {
        deviceId,
        from,
        to,
        binInterval: agg.binInterval,
      })
    : await listTelemetry(app.db, { deviceId, from, to, limit: 2000 })

  let series = insertGapBreaks(
    rows.map((row) => mapTelemetryPoint(row, mapOpts)),
    agg.gapMs,
  )
  series = await withLatestRawPoint(app, deviceId, series, mapOpts)

  let irrigations = []
  if (zoneId) {
    irrigations = (await listIrrigationsInRange(app.db, { zoneId, from, to })).map(
      mapIrrigationMarker,
    )
  }
  return {
    series,
    irrigations,
    range: {
      key: range,
      from: from.toISOString(),
      to: to.toISOString(),
      fromT: from.getTime(),
      toT: to.getTime(),
      intervalSeconds: agg.intervalSeconds,
      aggregated,
    },
  }
}

async function pushConfig(app, device) {
  const settings = await getZoneSettings(app.db, device.zone_id)
  const calibration = await ensureCalibration(app.db, device.id)
  const payload = {
    umbral_humedad: Number(settings?.threshold_pct ?? 35),
    duracion_max_s: Number(settings?.max_irrigation_seconds ?? 60),
    modo: settings?.mode || 'auto',
    tank_min_pct: Number(settings?.tank_min_pct ?? 10),
    battery_min_pct: Number(settings?.battery_min_pct ?? 30),
    allow_manual_on_battery: Boolean(settings?.allow_manual_on_battery),
    // Nombres exactos que lee el firmware (Preferences / OLED).
    calibracion: {
      humedad_raw_seco: Number(calibration.humidity_raw_dry),
      humedad_raw_mojado: Number(calibration.humidity_raw_wet),
      distancia_lleno_cm: Number(calibration.distance_full_cm),
      distancia_vacio_cm: Number(calibration.distance_empty_cm),
      bateria_v_vacio: Number(calibration.battery_v_empty),
      bateria_v_lleno: Number(calibration.battery_v_full),
    },
  }
  const result = await publishToNodeRed(app.config, {
    mqttId: device.mqtt_id,
    kind: 'config',
    payload,
    log: app.log,
  })
  if (!result.ok) {
    app.log?.warn(
      {
        mqttId: device.mqtt_id,
        deviceId: device.id,
        reason: result.reason,
        calibracion: payload.calibracion,
      },
      'No se pudo publicar config retenida en MQTT vía Node-RED',
    )
  } else {
    app.log?.info(
      {
        mqttId: device.mqtt_id,
        deviceId: device.id,
        humedad_raw_seco: payload.calibracion.humedad_raw_seco,
        humedad_raw_mojado: payload.calibracion.humedad_raw_mojado,
      },
      'Config publicada en hidrobot/<id>/config (retain)',
    )
  }
  return result
}

/** Republica la config retenida de todos los dispositivos (arranque de la API). */
export async function pushAllDeviceConfigs(app) {
  const devices = await listAllDevices(app.db)
  app.log?.info({ count: devices.length }, 'Republicando config MQTT de dispositivos')
  const results = []
  for (const device of devices) {
    results.push({
      mqttId: device.mqtt_id,
      ...(await pushConfig(app, device)),
    })
  }
  return results
}

export async function getPanelSummary(app, userId) {
  const zone = await getPrimaryZoneForUser(app.db, userId)
  if (!zone) {
    return {
      zone: null,
      settings: null,
      device: null,
      calibration: null,
      latest: null,
      series: [],
      irrigations: [],
      alerts: [],
      online: false,
      pump: false,
      onBattery: false,
    }
  }

  const settings = await getZoneSettings(app.db, zone.id)
  const devices = await listDevicesByZone(app.db, zone.id)
  const device = devices[0] || null
  let latest = null
  let series = []
  let pump = false
  let online = false
  let calibration = null
  let onBattery = false

  if (device) {
    online = isDeviceOnline(device, app.config.DEVICE_OFFLINE_MINUTES)
    calibration = mapCalibration(await ensureCalibration(app.db, device.id))
    const tele = await latestTelemetry(app.db, device.id)
    if (tele) {
      latest = {
        humidity: num(tele.humidity_pct),
        tank: num(tele.tank_pct),
        battery: num(tele.battery_pct),
        vRed: num(tele.v_red),
        vBat: num(tele.v_bat),
        source: tele.source,
        pump: tele.pump,
        rssi: tele.rssi,
        humidityRaw: tele.humidity_raw,
        distanceCm: num(tele.distance_cm),
        recordedAt: tele.recorded_at,
        recordedLabel: formatBogota(tele.recorded_at),
      }
      onBattery = tele.source === 'bateria'
    } else {
      onBattery = device.last_source === 'bateria'
    }

    const teleSeries = await buildTelemetrySeries(app, {
      deviceId: device.id,
      zoneId: zone.id,
      range: '24h',
    })
    series = teleSeries.series

    const open = await openIrrigation(app.db, zone.id)
    const lastAcked = await latestAckedIrrigation(app.db, device.id)
    pump = pumpActive(device, open, lastAcked)
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
    settings: mapSettings(settings),
    device: device
      ? {
          id: device.id,
          name: device.name,
          mqttId: device.mqtt_id,
          lastSeenAt: device.last_seen_at,
          lastSeenLabel: device.last_seen_at ? formatBogota(device.last_seen_at) : null,
          source: device.last_source,
        }
      : null,
    calibration,
    latest,
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
    onBattery,
  }
}

export async function getTelemetrySeries(app, userId, deviceId, range = '24h') {
  const device = await getDeviceForUser(app.db, deviceId, userId)
  if (!device) throw new AppError(404, 'Dispositivo no encontrado')
  return buildTelemetrySeries(app, {
    deviceId: device.id,
    zoneId: device.zone_id,
    range,
  })
}

/** @deprecated alias */
export async function getReadingsSeries(app, userId, deviceId, range) {
  return getTelemetrySeries(app, userId, deviceId, range)
}

export async function patchSettings(app, userId, zoneId, patch) {
  const zone = await getZoneForUser(app.db, zoneId, userId)
  if (!zone) throw new AppError(404, 'Zona no encontrada')
  const updated = await updateZoneSettings(app.db, zoneId, patch)
  const devices = await listDevicesByZone(app.db, zoneId)
  if (devices[0]) await pushConfig(app, devices[0])
  return mapSettings(updated)
}

export async function getDeviceCalibration(app, userId, deviceId) {
  const device = await getDeviceForUser(app.db, deviceId, userId)
  if (!device) throw new AppError(404, 'Dispositivo no encontrado')
  return mapCalibration(await ensureCalibration(app.db, deviceId))
}

export async function patchDeviceCalibration(app, userId, deviceId, patch) {
  const device = await getDeviceForUser(app.db, deviceId, userId)
  if (!device) throw new AppError(404, 'Dispositivo no encontrado')
  const updated = await updateCalibration(app.db, deviceId, patch)
  await pushConfig(app, device)
  return mapCalibration(updated)
}

export async function createDevice(app, userId, zoneId, { name, mqttId } = {}) {
  const zone = await getZoneForUser(app.db, zoneId, userId)
  if (!zone) throw new AppError(404, 'Zona no encontrada')
  const existing = await listDevicesByZone(app.db, zoneId)
  if (existing.length > 0) {
    throw new AppError(409, 'Esta zona ya tiene un dispositivo. Por ahora solo se admite uno.')
  }

  const apiKey = randomToken(24)
  const finalMqttId =
    (mqttId && String(mqttId).trim()) ||
    `esp32-${randomToken(4).replace(/[^a-z0-9]/gi, '').slice(0, 8) || Date.now().toString(36)}`

  let device
  try {
    device = await insertDevice(app.db, {
      zoneId,
      name: (name || 'ESP32').trim(),
      apiKeyHash: sha256(apiKey),
      mqttId: finalMqttId,
    })
  } catch (error) {
    if (error?.code === '23505') {
      throw new AppError(409, 'Ese mqtt_id ya está en uso.')
    }
    throw error
  }

  await ensureCalibration(app.db, device.id)
  await pushConfig(app, device)

  return {
    device: {
      id: device.id,
      name: device.name,
      mqttId: device.mqtt_id,
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

  const push = await publishToNodeRed(app.config, {
    mqttId: device.mqtt_id,
    kind: 'comando',
    payload: { accion: 'regar', segundos: requested },
  })

  return {
    id: command.id,
    type: command.type,
    seconds: command.seconds,
    status: command.status,
    expiresAt: command.expires_at,
    pushed: push.ok,
    pushReason: push.reason,
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

  const push = await publishToNodeRed(app.config, {
    mqttId: device.mqtt_id,
    kind: 'comando',
    payload: { accion: 'detener' },
  })

  return {
    id: command.id,
    type: command.type,
    status: command.status,
    expiresAt: command.expires_at,
    pushed: push.ok,
    pushReason: push.reason,
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
    await updateDeviceRuntime(app.db, device.id, { online: false })
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
  const a = await deleteOldTelemetry(app.db, app.config.READINGS_RETENTION_DAYS)
  const b = await deleteOldReadings(app.db, app.config.READINGS_RETENTION_DAYS)
  return a + b
}

export { isDeviceOnline }
