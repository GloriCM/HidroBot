import { z } from 'zod'
import { AppError } from '../lib/errors.js'
import * as ingestService from '../services/ingestService.js'

const readingSchema = z.object({
  deviceId: z.string().uuid(),
  humidity: z.coerce.number(),
  recordedAt: z.string().optional(),
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
  app.post('/api/ingest/readings', async (request) => {
    requireIngestToken(request, app.config)
    const deviceKey = requireDeviceKey(request)
    const parsed = readingSchema.safeParse(request.body)
    if (!parsed.success) throw new AppError(400, 'Cuerpo inválido')
    return ingestService.ingestReading(app, {
      ...parsed.data,
      deviceKey,
    })
  })

  app.get('/api/ingest/config/:deviceId', async (request) => {
    requireIngestToken(request, app.config)
    const deviceKey = requireDeviceKey(request)
    const deviceId = request.params.deviceId
    if (!z.string().uuid().safeParse(deviceId).success) {
      throw new AppError(400, 'deviceId inválido')
    }
    return ingestService.getIngestConfig(app, { deviceId, deviceKey })
  })
}
