import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import { getPool } from './db/pool.js'
import { isAppError } from './lib/errors.js'
import { setupAuth } from './plugins/auth.js'
import { authRoutes } from './routes/auth.js'
import { healthRoutes } from './routes/health.js'

/**
 * @param {{ config: ReturnType<import('./config.js').loadConfig> }} opts
 */
export async function buildApp({ config }) {
  const app = Fastify({
    logger: config.NODE_ENV !== 'test',
    trustProxy: config.TRUST_PROXY,
  })

  await app.register(cookie, {
    secret: config.SESSION_SECRET,
  })

  await app.register(rateLimit, {
    global: false,
    // preHandler: el body ya está parseado para limitar login por IP+email.
    hook: 'preHandler',
  })

  app.decorate('config', config)
  app.decorate('db', getPool(config.DATABASE_URL))

  await setupAuth(app)

  await app.register(healthRoutes, { databaseUrl: config.DATABASE_URL })
  await app.register(authRoutes)

  app.setErrorHandler((error, _request, reply) => {
    if (isAppError(error)) {
      return reply.code(error.statusCode).send({
        error: error.message,
        code: error.code,
      })
    }

    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500
    if (status === 429) {
      return reply.code(429).send({
        error: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
        code: 'RATE_LIMIT',
      })
    }
    if (status >= 500) {
      app.log.error({ err: error }, 'error no controlado')
    }
    reply.code(status).send({
      error: status >= 500 ? 'Error interno' : error.message,
      code: error.code,
    })
  })

  return app
}
