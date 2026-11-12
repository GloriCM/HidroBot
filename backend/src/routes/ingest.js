import { z } from 'zod'
import { AppError } from '../lib/errors.js'
import * as ingestService from '../services/ingestService.js'

const deviceRef = {
  deviceId: z.string().uuid().optional(),
  mqttId: z.string().min(1).max(64).optional(),
}

/** distancia_cm puede faltar o ser null (fallo del ultrasónico). */
const optionalDistanceCm = z.preprocess((value) => {
  if (value === null || value === undefined || value === '') return undefined
  return value
}, z.coerce.number().finite().optional())

const telemetrySchema = z
  .object({
    ...deviceRef,
    humedad_raw: z.coerce.number().finite(),
    distancia_cm: optionalDistanceCm,
    v_red: z.coerce.number().finite(),
    v_bat: z.coerce.number().finite(),
    fuente: z.enum(['red', 'bateria']),
    bomba: z.boolean().optional().default(false),
    rssi: z.coerce.number().finite().optional(),
    recordedAt: z.string().optional(),
  })
  .refine((value) => value.deviceId || value.mqttId, {
    message: 'deviceId o mqttId requerido',
  })

const statusSchema = z
  .object({
    ...deviceRef,
    status: z.enum(['online', 'offline']),
  })
  .refine((value) => value.deviceId || value.mqttId, {
    message: 'deviceId o mqttId requerido',
  })

const eventSchema = z
  .object({
    ...deviceRef,
    tipo: z.enum(['riego_inicio', 'riego_fin', 'bloqueo_tanque_vacio']),
    segundos: z.coerce.number().optional(),
  })
  .refine((value) => value.deviceId || value.mqttId, {
    message: 'deviceId o mqttId requerido',
  })

function requireIngestToken(request, config) {
  const token = request.headers['x-ingest-token']
  if (typeof token !== 'string' || token !== config.INGEST_TOKEN) {
    throw new AppError(401, 'Token de ingesta inválido')
  }
}

function requireDeviceKey(request) {
  const key = request.headers['x-device-key']
  if (typeof key !== 'string' || !key.trim()) {
    throw new AppError(401, 'Falta X-Device-Key')
  }
  return key.trim()
}

function readPathValue(body, path) {
  let current = body
  for (const key of path) {
    if (current == null || typeof current !== 'object') return undefined
    current = current[key]
  }
  return current
}

function throwValidationError(app, route, body, zodError) {
  const fields = zodError.issues.map((issue) => {
    const path = issue.path.length ? issue.path.join('.') : '(root)'
    return {
      field: path,
      message: issue.message,
      value: issue.path.length ? readPathValue(body, issue.path) : body,
      code: issue.code,
    }
  })
  app.log.warn(
    { route, validation: fields },
    `ingest: validación fallida (${fields.map((f) => `${f.field}=${JSON.stringify(f.value)}`).join(', ')})`,
  )
  throw new AppError(400, 'Cuerpo inválido', { code: 'VALIDATION' })
}

/**
 * @param {import('fastify').FastifyInstance} app
 */
export async function ingestRoutes(app) {
  app.post('/api/ingest/telemetry', async (request) => {
    requireIngestToken(request, app.config)
    const deviceKey = requireDeviceKey(request)
    const parsed = telemetrySchema.safeParse(request.body)
    if (!parsed.success) {
      throwValidationError(app, 'POST /api/ingest/telemetry', request.body, parsed.error)
    }
    return ingestService.ingestTelemetry(app, { ...parsed.data, deviceKey })
  })

  app.post('/api/ingest/status', async (request) => {
    requireIngestToken(request, app.config)
    const deviceKey = requireDeviceKey(request)
    const parsed = statusSchema.safeParse(request.body)
    if (!parsed.success) {
      throwValidationError(app, 'POST /api/ingest/status', request.body, parsed.error)
    }
    return ingestService.ingestStatus(app, { ...parsed.data, deviceKey })
  })

  app.post('/api/ingest/event', async (request) => {
    requireIngestToken(request, app.config)
    const deviceKey = requireDeviceKey(request)
    const parsed = eventSchema.safeParse(request.body)
    if (!parsed.success) {
      throwValidationError(app, 'POST /api/ingest/event', request.body, parsed.error)
    }
    return ingestService.ingestEvent(app, { ...parsed.data, deviceKey })
  })

  app.get('/api/ingest/config/:deviceId', async (request) => {
    requireIngestToken(request, app.config)
    const deviceKey = requireDeviceKey(request)
    const deviceId = request.params.deviceId
    const asUuid = z.string().uuid().safeParse(deviceId)
    if (asUuid.success) {
      return ingestService.getIngestConfig(app, { deviceId, deviceKey })
    }
    return ingestService.getIngestConfig(app, { mqttId: deviceId, deviceKey })
  })

  app.post('/api/ingest/readings', async () => {
    throw new AppError(410, 'Deprecated: usa POST /api/ingest/telemetry', {
      code: 'DEPRECATED',
    })
  })
}
