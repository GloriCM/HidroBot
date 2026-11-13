/**
 * Publica comando/config en Node-RED → MQTT.
 * Si falla, el caller puede dejar el pending en DB; siempre se deja rastro en logs.
 *
 * @param {Record<string, unknown>} config
 * @param {{
 *   mqttId: string,
 *   kind: string,
 *   payload: unknown,
 *   log?: { info?: Function, warn?: Function, error?: Function },
 * }} opts
 */
export async function publishToNodeRed(config, { mqttId, kind, payload, log }) {
  const url = config.NODERED_COMMAND_URL
  const token = config.NODERED_TOKEN
  if (!url || !token) {
    const detail = {
      mqttId,
      kind,
      hasUrl: Boolean(url),
      hasToken: Boolean(token),
    }
    if (log?.warn) {
      log.warn(detail, 'Node-RED no configurado: falta NODERED_COMMAND_URL o NODERED_TOKEN')
    } else {
      console.warn(
        `[nodered] no configurado (mqttId=${mqttId} kind=${kind}): falta NODERED_COMMAND_URL o NODERED_TOKEN`,
      )
    }
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
      let bodyText = ''
      try {
        bodyText = await response.text()
      } catch {
        bodyText = ''
      }
      const reason = `http_${response.status}`
      if (log?.warn) {
        log.warn(
          { mqttId, kind, status: response.status, body: bodyText.slice(0, 300) },
          'Node-RED rechazó la publicación',
        )
      } else {
        console.warn(
          `[nodered] fallo ${reason} mqttId=${mqttId} kind=${kind} body=${bodyText.slice(0, 200)}`,
        )
      }
      return { ok: false, reason, status: response.status, body: bodyText }
    }
    if (log?.info) {
      log.info({ mqttId, kind }, 'Publicado en Node-RED → MQTT')
    } else {
      console.log(`[nodered] ok mqttId=${mqttId} kind=${kind}`)
    }
    return { ok: true }
  } catch (error) {
    const reason = error.name === 'AbortError' ? 'timeout' : 'network'
    if (log?.error) {
      log.error({ mqttId, kind, reason, err: error.message }, 'Error al llamar a Node-RED')
    } else {
      console.error(`[nodered] error ${reason} mqttId=${mqttId} kind=${kind}: ${error.message}`)
    }
    return { ok: false, reason, error: error.message }
  } finally {
    clearTimeout(timer)
  }
}
