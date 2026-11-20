import { insertEmailSendLog } from '../../repos/emailNotifications.js'
import { sendMailMessage, isSmtpConfigured } from './transport.js'

/** @type {{ app: import('fastify').FastifyInstance, job: MailJob }[]} */
const queue = []
let draining = false

const MAX_ATTEMPTS = 3
const RETRY_MS = [0, 2_000, 8_000]

/**
 * @typedef {{
 *   zoneId: string,
 *   deviceId: string | null,
 *   recipient: string,
 *   kind: string,
 *   subject: string,
 *   text: string,
 *   html: string,
 * }} MailJob
 */

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {MailJob} job
 */
export function enqueueMail(app, job) {
  queue.push({ app, job })
  if (!draining) {
    draining = true
    setImmediate(() => {
      drainQueue().catch((err) => {
        const first = queue[0]?.app
        first?.log?.error({ err }, 'mail queue drain')
      })
    })
  }
}

async function drainQueue() {
  while (queue.length > 0) {
    const item = queue.shift()
    if (!item) break
    const { app, job } = item
    if (!isSmtpConfigured(app.config)) {
      app.log.info({ kind: job.kind, to: job.recipient }, 'Correo desactivado (SMTP no configurado)')
      await insertEmailSendLog(app.db, {
        zoneId: job.zoneId,
        deviceId: job.deviceId,
        recipient: job.recipient,
        kind: job.kind,
        status: 'skipped',
        errorMessage: 'smtp_disabled',
      })
      continue
    }

    let lastError = null
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (RETRY_MS[attempt] > 0) {
        await new Promise((r) => setTimeout(r, RETRY_MS[attempt]))
      }
      try {
        await sendMailMessage(app.config, {
          to: job.recipient,
          subject: job.subject,
          text: job.text,
          html: job.html,
        })
        await insertEmailSendLog(app.db, {
          zoneId: job.zoneId,
          deviceId: job.deviceId,
          recipient: job.recipient,
          kind: job.kind,
          status: 'sent',
        })
        lastError = null
        break
      } catch (error) {
        lastError = error
        app.log.warn({ err: error, attempt, kind: job.kind }, 'Reintento de correo')
      }
    }
    if (lastError) {
      await insertEmailSendLog(app.db, {
        zoneId: job.zoneId,
        deviceId: job.deviceId,
        recipient: job.recipient,
        kind: job.kind,
        status: 'failed',
        errorMessage: lastError.message?.slice(0, 500) || 'send_failed',
      })
    }
  }
  draining = false
  if (queue.length > 0) {
    draining = true
    setImmediate(() => drainQueue().catch(() => {}))
  }
}