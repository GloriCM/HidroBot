import { z } from 'zod'
import { AppError } from '../lib/errors.js'
import * as ingestService from '../services/ingestService.js'

const deviceRef = {
  deviceId: z.string().uuid().optional(),
  mqttId: z.string().min(1).max(64).optional(),
}

const telemetrySchema = z
  .object({
    ...deviceRef,
    humedad_raw: z.coerce.number(),
    distancia_cm: z.coerce.number(),
    v_red: z.coerce.number(),
    v_bat: z.coerce.number(),
    fuente: z.enum(['red', 'bateria']),
    bomba: z.boolean().optional().default(false),
    rssi: z.coerce.number().optional(),
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

/**
 * @param {import('fastify').FastifyInstance} app
 */
export async function ingestRoutes(app) {
  app.post('/api/ingest/telemetry', async (request) => {
    requireIngestToken(request, app.config)
    const deviceKey = requireDeviceKey(request)
    const parsed = telemetrySchema.safeParse(request.body)
    if (!parsed.success) throw new AppError(400, 'Cuerpo inválido')
    return ingestService.ingestTelemetry(app, { ...parsed.data, deviceKey })
  })

  app.post('/api/ingest/status', async (request) => {
    requireIngestToken(request, app.config)
    const deviceKey = requireDeviceKey(request)
    const parsed = statusSchema.safeParse(request.body)
    if (!parsed.success) throw new AppError(400, 'Cuerpo inválido')
    return ingestService.ingestStatus(app, { ...parsed.data, deviceKey })
  })

  app.post('/api/ingest/event', async (request) => {
    requireIngestToken(request, app.config)
    const deviceKey = requireDeviceKey(request)
    const parsed = eventSchema.safeParse(request.body)
    if (!parsed.success) throw new AppError(400, 'Cuerpo inválido')
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
