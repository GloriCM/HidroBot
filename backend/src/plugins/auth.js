import { sha256 } from '../lib/crypto.js'
import { AppError } from '../lib/errors.js'
import { findSessionWithUser } from '../repos/sessions.js'

/**
 * Decora request.user / request.sessionId y expone requireAuth / requireAdmin.
 * @param {import('fastify').FastifyInstance} app
 */
export async function setupAuth(app) {
  app.decorateRequest('user', null)
  app.decorateRequest('sessionId', null)

  app.decorate('authenticate', async function authenticate(request, _reply) {
    const token = request.cookies?.[app.config.COOKIE_NAME]
    if (!token) throw new AppError(401, 'No autenticado')

    const row = await findSessionWithUser(app.db, sha256(token))
    if (!row) throw new AppError(401, 'No autenticado')
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      throw new AppError(401, 'Sesión expirada')
    }

    request.user = {
      id: row.user_id,
      email: row.email,
      name: row.name,
      role: row.role,
    }
    request.sessionId = row.session_id
  })

  app.decorate('requireAuth', async function requireAuth(request, reply) {
    await app.authenticate(request, reply)
  })

  app.decorate('requireAdmin', async function requireAdmin(request, reply) {
    await app.authenticate(request, reply)
    if (request.user.role !== 'admin') {
      throw new AppError(403, 'Se requiere rol administrador')
    }
  })
}
