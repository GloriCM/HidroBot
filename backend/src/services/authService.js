import { clientIp } from '../lib/clientIp.js'
import { randomToken, sha256 } from '../lib/crypto.js'
import { AppError } from '../lib/errors.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { createDefaultGarden, listGardensByUser } from '../repos/gardens.js'
import { deleteSessionById, findSessionWithUser, insertSession } from '../repos/sessions.js'
import { findUserByEmail, findUserById, insertUser } from '../repos/users.js'

function publicUser(user) {
  return {
    id: user.id || user.user_id,
    email: user.email,
    name: user.name,
    role: user.role,
  }
}

function sessionExpiry(ttlDays) {
  return new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000)
}

function cookieOptions(config) {
  return {
    path: '/',
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: 'lax',
    maxAge: config.SESSION_TTL_DAYS * 24 * 60 * 60,
  }
}

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {import('fastify').FastifyReply} reply
 * @param {string} userId
 * @param {import('fastify').FastifyRequest} request
 */
async function createSessionCookie(app, reply, userId, request) {
  const { config, db } = app
  const token = randomToken(32)
  const tokenHash = sha256(token)
  const expiresAt = sessionExpiry(config.SESSION_TTL_DAYS)

  await insertSession(db, {
    userId,
    tokenHash,
    expiresAt,
    ip: clientIp(request),
    userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null,
  })

  reply.setCookie(config.COOKIE_NAME, token, cookieOptions(config))
  return token
}

export async function register(app, request, reply, input) {
  const email = input.email.trim().toLowerCase()
  const name = input.name.trim()
  const gardenName = (input.garden || '').trim() || 'Mi jardín'
  const password = input.password

  if (name.length < 2) throw new AppError(400, 'Escribe tu nombre.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError(400, 'Escribe un correo válido.')
  if (password.length < 8) throw new AppError(400, 'La contraseña necesita al menos 8 caracteres.')

  const existing = await findUserByEmail(app.db, email)
  if (existing) throw new AppError(409, 'Ya existe una cuenta con ese correo.')

  const passwordHash = await hashPassword(password)
  const client = await app.db.connect()
  try {
    await client.query('BEGIN')
    const user = await insertUser(client, { email, passwordHash, name })
    await createDefaultGarden(client, { userId: user.id, gardenName })
    await client.query('COMMIT')

    await createSessionCookie(app, reply, user.id, request)
    const gardens = await listGardensByUser(app.db, user.id)
    return { user: publicUser(user), gardens }
  } catch (error) {
    await client.query('ROLLBACK')
    if (error?.code === '23505') {
      throw new AppError(409, 'Ya existe una cuenta con ese correo.')
    }
    throw error
  } finally {
    client.release()
  }
}

export async function login(app, request, reply, input) {
  const email = input.email.trim().toLowerCase()
  const password = input.password

  if (!email || !password) throw new AppError(400, 'Correo y contraseña son obligatorios.')

  const user = await findUserByEmail(app.db, email)
  if (!user) throw new AppError(401, 'Correo o contraseña incorrectos.')

  const ok = await verifyPassword(user.password_hash, password)
  if (!ok) throw new AppError(401, 'Correo o contraseña incorrectos.')

  await createSessionCookie(app, reply, user.id, request)
  const gardens = await listGardensByUser(app.db, user.id)
  return { user: publicUser(user), gardens }
}

export async function logout(app, request, reply) {
  const token = request.cookies?.[app.config.COOKIE_NAME]
  if (token) {
    const row = await findSessionWithUser(app.db, sha256(token))
    if (row) await deleteSessionById(app.db, row.session_id)
  }
  reply.clearCookie(app.config.COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    secure: app.config.COOKIE_SECURE,
    sameSite: 'lax',
  })
  return { ok: true }
}

export async function me(app, userId) {
  const user = await findUserById(app.db, userId)
  if (!user) throw new AppError(401, 'No autenticado')
  const gardens = await listGardensByUser(app.db, user.id)
  return { user: publicUser(user), gardens }
}

export { publicUser, cookieOptions }
