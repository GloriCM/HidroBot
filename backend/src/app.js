import cookie from '@fastify/cookie'
import Fastify from 'fastify'
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

  app.decorate('config', config)

  await app.register(healthRoutes, { databaseUrl: config.DATABASE_URL })

  app.setErrorHandler((error, _request, reply) => {
    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500
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
