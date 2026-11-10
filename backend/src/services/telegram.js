/**
 * Envío opcional a Telegram. Si no hay token, no hace nada.
 * @param {{ botToken?: string, chatId?: string|null, text: string }} opts
 */
export async function sendTelegram({ botToken, chatId, text }) {
  if (!botToken || !chatId) return { sent: false, reason: 'missing' }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    })
    if (!response.ok) {
      return { sent: false, reason: `http_${response.status}` }
    }
    return { sent: true }
  } catch {
    return { sent: false, reason: 'network' }
  }
}
