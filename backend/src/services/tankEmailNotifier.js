import {
  countDeviceEmailsLastHour,
  getDeviceTankNotifyPhase,
  getOwnerEmailForZone,
  getZoneEmailNotifications,
  listZoneEmailRecipients,
  setDeviceTankNotifyPhase,
} from '../repos/emailNotifications.js'
import { listRecentTankReadings } from '../repos/telemetry.js'
import { getZoneSettings } from '../repos/zones.js'
import {
  decideTankNotifyTransition,
  medianTankPctFromReadings,
} from '../lib/tankEmailHysteresis.js'
import { enqueueMail } from './mail/mailQueue.js'
import { buildNotificationEmail } from './mail/templates.js'

function formatBogota(iso) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso))
}

function notifyFlagForKind(settings, kind) {
  if (kind === 'tank_low') return settings.notify_tank_low
  if (kind === 'tank_empty') return settings.notify_tank_empty
  if (kind === 'tank_recovered') return settings.notify_tank_recovered
  if (kind === 'device_offline') return settings.notify_device_offline
  return true
}

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{
 *   deviceId: string,
 *   zoneId: string,
 *   deviceName: string,
 *   zoneName: string,
 *   recordedAt: Date | string,
 *   distanceCm: number | null,
 *   tankPct: number | null,
 * }} ctx
 */
export async function evaluateTankEmailAfterTelemetry(app, ctx) {
  setImmediate(() => {
    runTankEmailEvaluation(app, ctx).catch((err) => {
      app.log.error({ err, deviceId: ctx.deviceId }, 'tank email evaluation')
    })
  })
}

async function runTankEmailEvaluation(app, ctx) {
  let zoneName = ctx.zoneName
  if (!zoneName) {
    const z = await app.db.query(`SELECT name FROM zones WHERE id = $1`, [ctx.zoneId])
    zoneName = z.rows[0]?.name || 'Zona'
  }

  const settings = await getZoneEmailNotifications(app.db, ctx.zoneId)
  if (!settings.enabled) return

  const zoneSettings = await getZoneSettings(app.db, ctx.zoneId)
  const lowPct = Number(zoneSettings?.tank_alert_low_pct ?? 20)
  const minPct = Number(zoneSettings?.tank_min_pct ?? 10)

  const readings = await listRecentTankReadings(app.db, ctx.deviceId, 10)
  const medianPct = medianTankPctFromReadings(readings)
  if (medianPct == null) return

  const phase = await getDeviceTankNotifyPhase(app.db, ctx.deviceId)
  const { nextPhase, events } = decideTankNotifyTransition(phase, medianPct, { lowPct, minPct })
  if (nextPhase !== phase) {
    await setDeviceTankNotifyPhase(app.db, ctx.deviceId, nextPhase)
  }
  if (events.length === 0) return

  const latest = readings[0]
  const distanceCm = latest?.distance_cm != null ? Number(latest.distance_cm) : ctx.distanceCm
  const recordedLabel = formatBogota(latest?.recorded_at || ctx.recordedAt)

  for (const kind of events) {
    if (!notifyFlagForKind(settings, kind)) continue
    await dispatchZoneEmail(app, {
      zoneId: ctx.zoneId,
      deviceId: ctx.deviceId,
      deviceName: ctx.deviceName,
      zoneName,
      kind,
      tankPct: medianPct,
      distanceCm,
      recordedLabel,
      emailSettings: settings,
    })
  }
}

/**
 * @param {import('fastify').FastifyInstance} app
 */
export async function sendDeviceOfflineEmail(app, device) {
  const settings = await getZoneEmailNotifications(app.db, device.zone_id)
  if (!settings.enabled || !settings.notify_device_offline) return

  const recordedLabel = formatBogota(new Date())
  await dispatchZoneEmail(app, {
    zoneId: device.zone_id,
    deviceId: device.id,
    deviceName: device.name,
    zoneName: device.zone_name || 'Zona',
    kind: 'device_offline',
    tankPct: null,
    distanceCm: null,
    recordedLabel,
    emailSettings: settings,
  })
}

/**
 * @param {import('fastify').FastifyInstance} app
 */
export async function dispatchZoneEmail(app, ctx) {
  const isTest = ctx.kind === 'test'
  if (!isTest && !ctx.emailSettings?.enabled) return

  const maxPerHour = app.config.MAIL_MAX_PER_DEVICE_PER_HOUR
  if (ctx.deviceId && !isTest) {
    const sent = await countDeviceEmailsLastHour(app.db, ctx.deviceId)
    if (sent >= maxPerHour) {
      app.log.info({ deviceId: ctx.deviceId, kind: ctx.kind }, 'Límite horario de correos alcanzado')
      return
    }
  }

  const appUrl = (app.config.APP_URL || '').replace(/\/$/, '') || 'http://localhost:5173'
  const owner = await getOwnerEmailForZone(app.db, ctx.zoneId)
  const extra = await listZoneEmailRecipients(app.db, ctx.zoneId)

  const recipients = []
  const ownerOk = isTest || ctx.emailSettings.owner_email_enabled
  if (ownerOk && owner?.email) {
    recipients.push({
      email: owner.email,
      unsubscribeUrl: `${appUrl}/api/email/unsubscribe/owner/${ctx.emailSettings.owner_unsubscribe_token}`,
    })
  }
  for (const row of extra) {
    if (!row.confirmed_at) continue
    recipients.push({
      email: row.email,
      unsubscribeUrl: `${appUrl}/api/email/unsubscribe/${row.unsubscribe_token}`,
    })
  }

  for (const target of recipients) {
    const payload = buildNotificationEmail({
      kind: ctx.kind,
      deviceName: ctx.deviceName,
      zoneName: ctx.zoneName,
      tankPct: ctx.tankPct,
      distanceCm: ctx.distanceCm,
      recordedLabel: ctx.recordedLabel,
      appUrl,
      unsubscribeUrl: target.unsubscribeUrl,
    })
    enqueueMail(app, {
      zoneId: ctx.zoneId,
      deviceId: ctx.deviceId,
      recipient: target.email,
      kind: ctx.kind,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    })
  }

}