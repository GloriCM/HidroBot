import { z } from 'zod'
import { clientIp } from '../lib/clientIp.js'
import { AppError } from '../lib/errors.js'
import * as authService from '../services/authService.js'

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().min(1),
  password: z.string().min(1),
  garden: z.string().optional(),
})

const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
})

function parseBody(schema, body) {
  const parsed = schema.safeParse(body ?? {})
  if (!parsed.success) {
    throw new AppError(400, 'Datos inválidos')
  }
  return parsed.data
}

/**
 * @param {import('fastify').FastifyInstance} app
 */
export async function authRoutes(app) {
  const loginWindowMs = app.config.LOGIN_WINDOW_MINUTES * 60 * 1000

  app.post(
    '/api/auth/register',
    {
      config: {
        rateLimit: {
          max: Math.max(app.config.LOGIN_MAX_ATTEMPTS, 10),
          timeWindow: loginWindowMs,
          keyGenerator: (request) => `register:${clientIp(request)}`,
        },
      },
    },
    async (request, reply) => {
      const input = parseBody(registerSchema, request.body)
      const result = await authService.register(app, request, reply, input)
      return reply.code(201).send(result)
    },
  )

  app.post(
    '/api/auth/login',
    {
      config: {
        rateLimit: {
          max: app.config.LOGIN_MAX_ATTEMPTS,
          timeWindow: loginWindowMs,
          keyGenerator: (request) => {
            const email =
              typeof request.body?.email === 'string'
                ? request.body.email.trim().toLowerCase()
                : ''
            return `login:${clientIp(request)}:${email}`
          },
        },
      },
    },
    async (request, reply) => {
      const input = parseBody(loginSchema, request.body)
      const result = await authService.login(app, request, reply, input)
      return result
    },
  )

  app.post('/api/auth/logout', async (request, reply) => {
    return authService.logout(app, request, reply)
  })

  app.get(
    '/api/auth/me',
    { preHandler: [app.requireAuth] },
    async (request) => authService.me(app, request.user.id),
  )
}
