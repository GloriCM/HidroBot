import { insertAlert, recentAlertOfType } from '../repos/alerts.js'
import { sendTelegram } from './telegram.js'

/**
 * Crea alerta si no hay spam (misma alerta mismo dispositivo en cooldown).
 */
export async function raiseAlert(app, {
  userId,
  zoneId = null,
  deviceId = null,
  type,
  severity = 'warning',
  message,
  telegramChatId = null,
}) {
  const existing = await recentAlertOfType(app.db, {
    userId,
    deviceId,
    type,
    cooldownMinutes: app.config.ALERT_COOLDOWN_MINUTES,
  })
  if (existing) return { created: false, alert: null }

  const alert = await insertAlert(app.db, {
    userId,
    zoneId,
    deviceId,
    type,
    severity,
    message,
  })

  await sendTelegram({
    botToken: app.config.TELEGRAM_BOT_TOKEN,
    chatId: telegramChatId,
    text: `HidroBot: ${message}`,
  })

  return { created: true, alert }
}
