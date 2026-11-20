import nodemailer from 'nodemailer'

/**
 * @param {ReturnType<import('../../config.js').loadConfig>} config
 */
export function isSmtpConfigured(config) {
  return Boolean(config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS && config.MAIL_FROM)
}

let cachedTransport = null
let cachedKey = ''

/**
 * @param {ReturnType<import('../../config.js').loadConfig>} config
 */
export function getMailTransport(config) {
  if (!isSmtpConfigured(config)) return null
  const key = [config.SMTP_HOST, config.SMTP_PORT, config.SMTP_SECURE, config.SMTP_USER].join('|')
  if (cachedTransport && cachedKey === key) return cachedTransport
  cachedTransport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: {
      user: config.SMTP_USER,
      pass: config.SMTP_PASS,
    },
  })
  cachedKey = key
  return cachedTransport
}

/**
 * @param {ReturnType<import('../../config.js').loadConfig>} config
 * @param {{ to: string, subject: string, text: string, html: string }} message
 */
export async function sendMailMessage(config, message) {
  const transport = getMailTransport(config)
  if (!transport) {
    return { ok: false, skipped: true, error: 'smtp_disabled' }
  }
  await transport.sendMail({
    from: config.MAIL_FROM,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  })
  return { ok: true, skipped: false }
}