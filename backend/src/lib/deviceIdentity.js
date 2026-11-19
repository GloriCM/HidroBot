import { AppError } from './errors.js'

const MQTT_ID_RE = /^hb-[0-9a-f]{6}$/

/** Normaliza MAC a minúsculas con dos puntos (aa:bb:cc:dd:ee:ff). */
export function normalizeMac(mac) {
  if (typeof mac !== 'string' || !mac.trim()) {
    throw new AppError(400, 'MAC inválida')
  }
  const compact = mac.trim().replace(/[^0-9a-fA-F]/g, '').toLowerCase()
  if (compact.length !== 12) {
    throw new AppError(400, 'MAC inválida')
  }
  const parts = []
  for (let i = 0; i < 12; i += 2) {
    parts.push(compact.slice(i, i + 2))
  }
  return parts.join(':')
}

/** hb- + últimos 3 bytes hex en minúsculas. */
export function mqttIdFromMac(mac) {
  const normalized = normalizeMac(mac)
  const bytes = normalized.split(':')
  const suffix = bytes.slice(-3).join('')
  return `hb-${suffix}`
}

/** mqttId debe coincidir con los últimos 6 hex de la MAC. */
export function assertMqttIdMatchesMac(mqttId, mac) {
  const expected = mqttIdFromMac(mac)
  const id = String(mqttId || '').trim().toLowerCase()
  if (!MQTT_ID_RE.test(id)) {
    throw new AppError(400, 'mqttId inválido')
  }
  if (id !== expected) {
    throw new AppError(400, 'mqttId no coincide con la MAC del dispositivo')
  }
  return id
}