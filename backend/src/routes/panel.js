import { z } from 'zod'
import { AppError } from '../lib/errors.js'
import * as panelService from '../services/panelService.js'

const settingsSchema = z.object({
  thresholdPct: z.number().min(0).max(100).optional(),
  watchPct: z.number().min(0).max(100).optional(),
  maxIrrigationSeconds: z.number().int().positive().max(600).optional(),
  mode: z.enum(['auto', 'manual']).optional(),
  tankMinPct: z.number().min(0).max(100).optional(),
  batteryMinPct: z.number().min(0).max(100).optional(),
  allowManualOnBattery: z.boolean().optional(),
})

const deviceSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  mqttId: z.string().min(2).max(64).regex(/^[a-zA-Z0-9_-]+$/).optional(),
})

const calibrationSchema = z.object({
  humidityRawDry: z.number().int().optional(),
  humidityRawWet: z.number().int().optional(),
  distanceFullCm: z.number().optional(),
  distanceEmptyCm: z.number().optional(),
  batteryVEmpty: z.number().optional(),
  batteryVFull: z.number().optional(),
})

const irrigateSchema = z.object({
  seconds: z.number().int().positive().max(600).optional(),
})

/**
 * @param {import('fastify').FastifyInstance} app
 */
export async function panelRoutes(app) {
  app.addHook('preHandler', app.requireAuth)

  app.get('/api/panel/summary', async (request) => {
    return panelService.getPanelSummary(app, request.user.id)
  })

  app.get('/api/gardens', async (request) => {
    return { gardens: await panelService.listUserGardens(app, request.user.id) }
  })

  app.patch('/api/zones/:zoneId/settings', async (request) => {
    const parsed = settingsSchema.safeParse(request.body ?? {})
    if (!parsed.success) throw new AppError(400, 'Datos inválidos')
    const settings = await panelService.patchSettings(
      app,
      request.user.id,
      request.params.zoneId,
      parsed.data,
    )
    return { settings }
  })

  app.post('/api/zones/:zoneId/devices', async (request, reply) => {
    const parsed = deviceSchema.safeParse(request.body ?? {})
    if (!parsed.success) throw new AppError(400, 'Datos inválidos')
    const created = await panelService.createDevice(app, request.user.id, request.params.zoneId, {
      name: parsed.data.name || 'ESP32',
      mqttId: parsed.data.mqttId,
    })
    return reply.code(201).send(created)
  })

  app.get('/api/devices/:deviceId/telemetry', async (request) => {
    const range = typeof request.query.range === 'string' ? request.query.range : '24h'
    if (!['1h', '6h', '12h', '24h'].includes(range)) {
      throw new AppError(400, 'range inválido')
    }
    const series = await panelService.getTelemetrySeries(
      app,
      request.user.id,
      request.params.deviceId,
      range,
    )
    return { series }
  })

  app.get('/api/devices/:deviceId/readings', async (request) => {
    const range = typeof request.query.range === 'string' ? request.query.range : '24h'
    const series = await panelService.getTelemetrySeries(
      app,
      request.user.id,
      request.params.deviceId,
      range,
    )
    return { series }
  })

  app.get('/api/devices/:deviceId/calibration', async (request) => {
    const calibration = await panelService.getDeviceCalibration(
      app,
      request.user.id,
      request.params.deviceId,
    )
    return { calibration }
  })

  app.patch('/api/devices/:deviceId/calibration', async (request) => {
    const parsed = calibrationSchema.safeParse(request.body ?? {})
    if (!parsed.success) throw new AppError(400, 'Datos inválidos')
    const calibration = await panelService.patchDeviceCalibration(
      app,
      request.user.id,
      request.params.deviceId,
      parsed.data,
    )
    return { calibration }
  })

  app.post('/api/zones/:zoneId/commands/irrigate', async (request) => {
    const parsed = irrigateSchema.safeParse(request.body ?? {})
    if (!parsed.success) throw new AppError(400, 'Datos inválidos')
    const command = await panelService.queueIrrigate(
      app,
      request.user.id,
      request.params.zoneId,
      parsed.data.seconds,
    )
    return { command }
  })

  app.post('/api/zones/:zoneId/commands/stop', async (request) => {
    const command = await panelService.queueStop(app, request.user.id, request.params.zoneId)
    return { command }
  })

  app.get('/api/alerts', async (request) => {
    return { alerts: await panelService.listUserAlerts(app, request.user.id) }
  })

  app.patch('/api/alerts/:id/read', async (request) => {
    const alert = await panelService.readAlert(app, request.user.id, request.params.id)
    return { alert }
  })
}
