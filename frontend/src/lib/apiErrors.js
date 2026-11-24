const GENERIC_HTTP_MESSAGES = new Set([
  'Bad Request',
  'Not Found',
  'Internal Server Error',
  'Unauthorized',
  'Forbidden',
  'Unprocessable Entity',
  'Request failed',
])

/**
 * Convierte respuestas genéricas del servidor en textos útiles para el usuario.
 * @param {string | undefined} message
 * @param {number} [status]
 */
export function formatApiErrorMessage(message, status = 0) {
  const raw = String(message || '').trim()

  if (!raw || GENERIC_HTTP_MESSAGES.has(raw)) {
    switch (status) {
      case 400:
        return 'Revisa el código y el nombre del dispositivo e inténtalo de nuevo.'
      case 401:
        return 'Tu sesión expiró. Vuelve a iniciar sesión.'
      case 403:
        return 'No tienes permiso para hacer esto.'
      case 404:
        return 'No encontramos ese código. Comprueba que el HidroBot esté encendido y conectado a Wi‑Fi.'
      case 409:
        return 'Este dispositivo o zona ya está vinculado.'
      case 429:
        return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.'
      default:
        return 'No se pudo completar la solicitud. Inténtalo de nuevo.'
    }
  }

  if (raw.includes('Código incorrecto') || raw.includes('caducado')) {
    return raw
  }
  if (raw === 'Zona no encontrada') {
    return 'No se encontró tu jardín. Recarga la página e inténtalo de nuevo.'
  }

  return raw
}

/** @param {string} code */
export function validateClaimCodeInput(code) {
  const normalized = String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
  if (normalized.length !== 6) {
    return 'Escribe el código de 6 letras y números que ves en la pantalla del HidroBot (ejemplo: ABC-123).'
  }
  return null
}