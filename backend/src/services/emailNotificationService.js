import { AppError } from '../lib/errors.js'
import {
  confirmEmailRecipientByToken,
  countZoneEmailRecipients,
  ensureZoneEmailNotifications,
  getZoneEmailNotifications,
  insertZoneEmailRecipient,
  listZoneEmailRecipients,
  removeZoneEmailRecipient,
  unsubscribeOwnerByToken,
  unsubscribeRecipientByToken,
  updateZoneEmailNotifications,
} from '../repos/emailNotifications.js'
import { getZoneForUser } from '../repos/ownership.js'
import { getOwnerEmailForZone } from '../repos/emailNotifications.js'
import { listDevicesByZone } from '../repos/devices.js'
import { getZoneSettings, updateZoneSettings } from '../repos/zones.js'
import { buildConfirmEmail } from './mail/templates.js'
import { enqueueMail } from './mail/mailQueue.js'
import { dispatchZoneEmail } from './tankEmailNotifier.js'
import { isSmtpConfigured } from './mail/transport.js'

function mapNotifications(row, recipients, ownerEmail) {
  return {
    enabled: Boolean(row.enabled),
    notifyTankLow: Boolean(row.notify_tank_low),
    notifyTankEmpty: Boolean(row.notify_tank_empty),
    notifyTankRecovered: Boolean(row.notify_tank_recovered),
    notifyDeviceOffline: Boolean(row.notify_device_offline),
    ownerEmailEnabled: Boolean(row.owner_email_enabled),
    ownerEmail: ownerEmail || null,
    smtpConfigured: false,
    tankAlertLowPct: null,
    extraRecipients: recipients.map((r) => ({
      id: r.id,
      email: r.email,
      confirmed: Boolean(r.confirmed_at),
      createdAt: r.created_at,
    })),
    updatedAt: row.updated_at,
  }
}

/**
 * @param {import('fastify').FastifyInstance} app
 */
export async function getNotificationsForZone(app, userId, zoneId) {
  const zone = await getZoneForUser(app.db, zoneId, userId)
  if (!zone) throw new AppError(404, 'Zona no encontrada')
  const row = await getZoneEmailNotifications(app.db, zoneId)
  const recipients = await listZoneEmailRecipients(app.db, zoneId)
  const owner = await getOwnerEmailForZone(app.db, zoneId)
  const zoneSettings = await getZoneSettings(app.db, zoneId)
  const mapped = mapNotifications(row, recipients, owner?.email)
  mapped.smtpConfigured = isSmtpConfigured(app.config)
  mapped.tankAlertLowPct = Number(zoneSettings?.tank_alert_low_pct ?? 20)
  return mapped
}

/**
 * @param {import('fastify').FastifyInstance} app
 */
export async function patchNotificationsForZone(app, userId, zoneId, patch) {
  const zone = await getZoneForUser(app.db, zoneId, userId)
  if (!zone) throw new AppError(404, 'Zona no encontrada')
  if (patch.tankAlertLowPct != null) {
    await updateZoneSettings(app.db, zoneId, { tankAlertLowPct: patch.tankAlertLowPct })
  }
  const { tankAlertLowPct: _drop, ...notifPatch } = patch
  const updated = await updateZoneEmailNotifications(app.db, zoneId, notifPatch)
  const recipients = await listZoneEmailRecipients(app.db, zoneId)
  const owner = await getOwnerEmailForZone(app.db, zoneId)
  const zoneSettings = await getZoneSettings(app.db, zoneId)
  const mapped = mapNotifications(updated, recipients, owner?.email)
  mapped.smtpConfigured = isSmtpConfigured(app.config)
  mapped.tankAlertLowPct = Number(zoneSettings?.tank_alert_low_pct ?? 20)
  return mapped
}

/**
 * @param {import('fastify').FastifyInstance} app
 */
export async function addExtraRecipient(app, userId, zoneId, email) {
  const zone = await getZoneForUser(app.db, zoneId, userId)
  if (!zone) throw new AppError(404, 'Zona no encontrada')
  const normalized = String(email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new AppError(400, 'Correo inválido')
  }
  const count = await countZoneEmailRecipients(app.db, zoneId)
  if (count >= 3) throw new AppError(400, 'Máximo 3 correos adicionales')

  let row
  try {
    row = await insertZoneEmailRecipient(app.db, zoneId, normalized)
  } catch (error) {
    if (error.code === '23505') throw new AppError(409, 'Ese correo ya está registrado')
    throw error
  }

  const appUrl = (app.config.APP_URL || '').replace(/\/$/, '') || 'http://localhost:5173'
  const confirmUrl = `${appUrl}/api/email/confirm/${row.confirm_token}`
  const payload = buildConfirmEmail({ confirmUrl, zoneName: zone.name, email: normalized })
  if (isSmtpConfigured(app.config)) {
    enqueueMail(app, {
      zoneId,
      deviceId: null,
      recipient: normalized,
      kind: 'confirm',
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    })
  } else {
    app.log.info({ email: normalized }, 'Correo de confirmación no enviado (SMTP desactivado)')
  }

  return {
    id: row.id,
    email: row.email,
    confirmed: Boolean(row.confirmed_at),
    createdAt: row.created_at,
    pendingConfirmation: true,
  }
}

/**
 * @param {import('fastify').FastifyInstance} app
 */
export async function removeExtraRecipient(app, userId, zoneId, recipientId) {
  const zone = await getZoneForUser(app.db, zoneId, userId)
  if (!zone) throw new AppError(404, 'Zona no encontrada')
  const removed = await removeZoneEmailRecipient(app.db, zoneId, recipientId)
  if (!removed) throw new AppError(404, 'Destinatario no encontrado')
  return { ok: true }
}

/**
 * @param {import('fastify').FastifyInstance} app
 */
export async function sendTestEmail(app, userId, zoneId) {
  const zone = await getZoneForUser(app.db, zoneId, userId)
  if (!zone) throw new AppError(404, 'Zona no encontrada')
  await ensureZoneEmailNotifications(app.db, zoneId)
  const settings = await getZoneEmailNotifications(app.db, zoneId)
  const devices = await listDevicesByZone(app.db, zoneId)
  const device = devices[0]
  const appUrl = (app.config.APP_URL || '').replace(/\/$/, '') || 'http://localhost:5173'
  const owner = await getOwnerEmailForZone(app.db, zoneId)

  if (!isSmtpConfigured(app.config)) {
    return { ok: true, queued: false, message: 'SMTP no configurado; revisa los logs del servidor.' }
  }

  await dispatchZoneEmail(app, {
    zoneId,
    deviceId: device?.id ?? null,
    deviceName: device?.name || 'Dispositivo',
    zoneName: zone.name,
    kind: 'test',
    tankPct: 42,
    distanceCm: 18.5,
    recordedLabel: new Intl.DateTimeFormat('es-CO', {
      timeZone: 'America/Bogota',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date()),
    emailSettings: { ...settings, enabled: true, owner_email_enabled: true },
  })

  return {
    ok: true,
    queued: true,
    message: owner?.email
      ? `Correo de prueba encolado hacia ${owner.email} (y destinatarios confirmados).`
      : 'Correo de prueba encolado.',
  }
}

export async function confirmRecipientPublic(app, token) {
  const row = await confirmEmailRecipientByToken(app.db, token)
  if (!row) throw new AppError(404, 'Enlace inválido o ya usado')
  return row
}

export async function unsubscribeOwnerPublic(app, token) {
  const row = await unsubscribeOwnerByToken(app.db, token)
  if (!row) throw new AppError(404, 'Enlace inválido')
  return row
}

export async function unsubscribeRecipientPublic(app, token) {
  const row = await unsubscribeRecipientByToken(app.db, token)
  if (!row) throw new AppError(404, 'Enlace inválido')
  return row
}