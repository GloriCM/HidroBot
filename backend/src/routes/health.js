import { checkDatabase } from '../db/pool.js'

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{ databaseUrl: string }} opts
 */
export async function healthRoutes(app, opts) {
  app.get('/api/health', async (_request, reply) => {
    try {
      await checkDatabase(opts.databaseUrl)
      return { status: 'ok', db: 'ok' }
    } catch (error) {
      app.log.error({ err: error }, 'health: base de datos no disponible')
      return reply.code(503).send({ status: 'error', db: 'error' })
    }
  })
}
