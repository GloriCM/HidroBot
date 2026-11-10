/**
 * IP real detrás de Cloudflare Tunnel → nginx → api.
 * Prioriza CF-Connecting-IP; si no, el primer X-Forwarded-For.
 */
export function clientIp(request) {
  const cf = request.headers['cf-connecting-ip']
  if (typeof cf === 'string' && cf.trim()) return cf.trim()

  const forwarded = request.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim()
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return String(forwarded[0]).split(',')[0].trim()
  }

  return request.ip
}
