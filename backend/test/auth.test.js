import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { createTestApp, hasDatabaseUrl, resetAuthTables, shutdownTestApp } from './helpers.js'

const run = hasDatabaseUrl() ? describe : describe.skip

run('auth API', () => {
  /** @type {import('fastify').FastifyInstance} */
  let app
  /** @type {ReturnType<import('./helpers.js').testConfig>} */
  let config

  before(async () => {
    ;({ app, config } = await createTestApp({
      LOGIN_MAX_ATTEMPTS: 5,
      LOGIN_WINDOW_MINUTES: 15,
    }))
    await resetAuthTables(config.DATABASE_URL)
  })

  after(async () => {
    if (app) await shutdownTestApp(app)
  })

  test('registro crea sesión, jardín por defecto y /me funciona', async () => {
    const register = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Ana',
        email: 'ana@example.com',
        password: 'cesped123',
        garden: 'Patio norte',
      },
    })

    assert.equal(register.statusCode, 201)
    const body = register.json()
    assert.equal(body.user.email, 'ana@example.com')
    assert.equal(body.user.name, 'Ana')
    assert.equal(body.user.role, 'user')
    assert.equal(body.gardens.length, 1)
    assert.equal(body.gardens[0].name, 'Patio norte')

    const cookie = register.cookies.find((item) => item.name === config.COOKIE_NAME)
    assert.ok(cookie)
    assert.equal(cookie.httpOnly, true)
    assert.equal(cookie.sameSite, 'Lax')
    assert.equal(cookie.secure, false)

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { [config.COOKIE_NAME]: cookie.value },
    })
    assert.equal(me.statusCode, 200)
    assert.equal(me.json().user.email, 'ana@example.com')
  })

  test('login rechaza credenciales incorrectas y acepta las buenas', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Bruno',
        email: 'bruno@example.com',
        password: 'cesped123',
      },
    })

    const bad = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'bruno@example.com', password: 'wrong-password' },
      headers: { 'cf-connecting-ip': '203.0.113.50' },
    })
    assert.equal(bad.statusCode, 401)

    const ok = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'bruno@example.com', password: 'cesped123' },
      headers: { 'cf-connecting-ip': '203.0.113.50' },
    })
    assert.equal(ok.statusCode, 200)
    assert.equal(ok.json().user.email, 'bruno@example.com')
    assert.ok(ok.cookies.some((item) => item.name === config.COOKIE_NAME))
  })

  test('logout invalida la sesión', async () => {
    const register = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Carla',
        email: 'carla@example.com',
        password: 'cesped123',
      },
    })
    const cookie = register.cookies.find((item) => item.name === config.COOKIE_NAME)

    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      cookies: { [config.COOKIE_NAME]: cookie.value },
    })
    assert.equal(logout.statusCode, 200)

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { [config.COOKIE_NAME]: cookie.value },
    })
    assert.equal(me.statusCode, 401)
  })

  test('no permite emails duplicados', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Dario',
        email: 'dario@example.com',
        password: 'cesped123',
      },
    })
    const again = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Dario 2',
        email: 'Dario@example.com',
        password: 'cesped123',
      },
    })
    assert.equal(again.statusCode, 409)
  })
})
