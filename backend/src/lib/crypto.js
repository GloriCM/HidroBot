import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/** Token/clave opaca aleatoria (sesiones, API keys de dispositivo). */
export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url')
}

/** Hash rápido SHA-256 para tokens y claves de dispositivo (no para contraseñas). */
export function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function sha256Equal(plain, hash) {
  const left = Buffer.from(sha256(plain), 'utf8')
  const right = Buffer.from(hash, 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}
