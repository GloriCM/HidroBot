import { z } from 'zod'
import { AppError } from '../lib/errors.js'
import * as deviceLinkService from '../services/deviceLinkService.js'
import * as emailNotificationService from '../services/emailNotificationService.js'
import * as panelService from '../services/panelService.js'

const settingsSchema = z.object({
  thresholdPct: z.number().min(0).max(100).optional(),
  watchPct: z.number().min(0).max(100).optional(),
  maxIrrigationSeconds: z.number().int().positive().max(600).optional(),
  mode: z.enum(['auto', 'manual']).optional(),
  tankMinPct: z.number().min(0).max(100).optional(),
  tankAlertLowPct: z.number().min(0).max(100).optional(),
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

  app.post('/api/zones/:zoneId/devices', async () => {
    throw new AppError(410, 'Usa POST /api/devices/claim con el código del dispositivo', {
      code: 'DEPRECATED',
    })
  })

  app.get('/api/devices', async (request) => {
    return deviceLinkService.listDevices(app, request.user.id)
  })

  app.post('/api/devices/claim', async (request, reply) => {
    const schema = z.object({
      code: z.string().min(5).max(16),
      zoneId: z.string().uuid(),
      name: z.string().min(1).max(80).optional(),
    })
    const parsed = schema.safeParse(request.body ?? {})
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const field = issue?.path?.[0]
      if (field === 'code') {
        throw new AppError(400, 'El código de vinculación no es válido. Debe tener al menos 5 caracteres.')
      }
      if (field === 'zoneId') {
        throw new AppError(400, 'No se pudo identificar la zona. Recarga el panel e inténtalo de nuevo.')
      }
      if (field === 'name') {
        throw new AppError(400, 'El nombre del dispositivo no es válido (máx. 80 caracteres).')
      }
      throw new AppError(400, 'Revisa el código y el nombre del dispositivo.')
    }
    const ip = request.ip || request.headers['x-forwarded-for']?.split(',')[0]?.trim()
    const created = await deviceLinkService.claimDevice(app, request.user.id, {
      ...parsed.data,
      ip,
    })
    return reply.code(201).send(created)
  })

  app.patch('/api/devices/:deviceId', async (request) => {
    const schema = z.object({ name: z.string().min(1).max(80) })
    const parsed = schema.safeParse(request.body ?? {})
    if (!parsed.success) throw new AppError(400, 'Datos inválidos')
    return deviceLinkService.patchDeviceForUser(app, request.user.id, request.params.deviceId, {
      name: parsed.data.name,
    })
  })

  app.post('/api/devices/:deviceId/unlink', async (request) => {
    const schema = z.object({ keepHistory: z.boolean().optional().default(true) })
    const parsed = schema.safeParse(request.body ?? {})
    if (!parsed.success) throw new AppError(400, 'Datos inválidos')
    return deviceLinkService.unlinkDevice(app, request.user.id, request.params.deviceId, {
      keepHistory: parsed.data.keepHistory,
    })
  })

  app.get('/api/devices/:deviceId/telemetry', async (request) => {
    const range = typeof request.query.range === 'string' ? request.query.range : '24h'
    if (!['1h', '6h', '12h', '24h'].includes(range)) {
      throw new AppError(400, 'range inválido')
    }
    const ownershipId =
      typeof request.query.ownershipId === 'string' ? request.query.ownershipId : null
    return panelService.getTelemetrySeries(
      app,
      request.user.id,
      request.params.deviceId,
      range,
      ownershipId,
    )
  })

  app.get('/api/devices/:deviceId/readings', async (request) => {
    const range = typeof request.query.range === 'string' ? request.query.range : '24h'
    if (!['1h', '6h', '12h', '24h'].includes(range)) {
      throw new AppError(400, 'range inválido')
    }
    return panelService.getTelemetrySeries(
      app,
      request.user.id,
      request.params.deviceId,
      range,
    )
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

  const notificationsPatchSchema = z.object({
    enabled: z.boolean().optional(),
    notifyTankLow: z.boolean().optional(),
    notifyTankEmpty: z.boolean().optional(),
    notifyTankRecovered: z.boolean().optional(),
    notifyDeviceOffline: z.boolean().optional(),
    ownerEmailEnabled: z.boolean().optional(),
    tankAlertLowPct: z.number().min(0).max(100).optional(),
  })

  app.get('/api/zones/:zoneId/notifications', async (request) => {
    const notifications = await emailNotificationService.getNotificationsForZone(
      app,
      request.user.id,
      request.params.zoneId,
    )
    return { notifications }
  })

  app.patch('/api/zones/:zoneId/notifications', async (request) => {
    const parsed = notificationsPatchSchema.safeParse(request.body ?? {})
    if (!parsed.success) throw new AppError(400, 'Datos inválidos')
    const notifications = await emailNotificationService.patchNotificationsForZone(
      app,
      request.user.id,
      request.params.zoneId,
      parsed.data,
    )
    return { notifications }
  })

  app.post('/api/zones/:zoneId/notifications/recipients', async (request) => {
    const schema = z.object({ email: z.string().email() })
    const parsed = schema.safeParse(request.body ?? {})
    if (!parsed.success) throw new AppError(400, 'Correo inválido')
    const recipient = await emailNotificationService.addExtraRecipient(
      app,
      request.user.id,
      request.params.zoneId,
      parsed.data.email,
    )
    return { recipient }
  })

  app.delete('/api/zones/:zoneId/notifications/recipients/:recipientId', async (request) => {
    await emailNotificationService.removeExtraRecipient(
      app,
      request.user.id,
      request.params.zoneId,
      request.params.recipientId,
    )
    return { ok: true }
  })

  app.post('/api/zones/:zoneId/notifications/test', async (request) => {
    return emailNotificationService.sendTestEmail(app, request.user.id, request.params.zoneId)
  })
}
