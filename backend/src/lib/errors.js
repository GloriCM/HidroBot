export class AppError extends Error {
  /**
   * @param {number} statusCode
   * @param {string} message
   * @param {{ code?: string }} [opts]
   */
  constructor(statusCode, message, opts = {}) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = opts.code
  }
}

export function isAppError(error) {
  return error instanceof AppError
}
