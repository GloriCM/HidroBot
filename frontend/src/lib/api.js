export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {number} status
   */
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * @param {string} path
 * @param {RequestInit} [options]
 */
async function request(path, options = {}) {
  const headers = new Headers(options.headers || {})
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let response
  try {
    response = await fetch(path, {
      ...options,
      credentials: 'include',
      headers,
    })
  } catch {
    throw new ApiError('No hay conexión con el servidor. Inténtalo de nuevo.', 0)
  }

  const text = await response.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    throw new ApiError(data?.error || 'No se pudo completar la solicitud.', response.status)
  }

  return data
}

export const api = {
  me: () => request('/api/auth/me'),
  login: (body) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  register: (body) => request('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),

  panelSummary: () => request('/api/panel/summary'),
  readings: (deviceId, range) =>
    request(`/api/devices/${deviceId}/readings?range=${encodeURIComponent(range)}`),
  patchSettings: (zoneId, body) =>
    request(`/api/zones/${zoneId}/settings`, { method: 'PATCH', body: JSON.stringify(body) }),
  createDevice: (zoneId, body = {}) =>
    request(`/api/zones/${zoneId}/devices`, { method: 'POST', body: JSON.stringify(body) }),
  irrigate: (zoneId, body = {}) =>
    request(`/api/zones/${zoneId}/commands/irrigate`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  stopIrrigation: (zoneId) =>
    request(`/api/zones/${zoneId}/commands/stop`, { method: 'POST', body: '{}' }),
  alerts: () => request('/api/alerts'),
  markAlertRead: (id) => request(`/api/alerts/${id}/read`, { method: 'PATCH', body: '{}' }),
}
