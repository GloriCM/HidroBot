/**
 * Publica comando/config en Node-RED → MQTT. Si falla, el caller deja el pending en DB.
 */
export async function publishToNodeRed(config, { mqttId, kind, payload }) {
  const url = config.NODERED_COMMAND_URL
  const token = config.NODERED_TOKEN
  if (!url || !token) {
    return { ok: false, reason: 'not_configured' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.NODERED_TIMEOUT_MS || 3000)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-NodeRed-Token': token,
      },
      body: JSON.stringify({ mqttId, kind, payload }),
      signal: controller.signal,
    })
    if (!response.ok) {
      return { ok: false, reason: `http_${response.status}` }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: error.name === 'AbortError' ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timer)
  }
}
