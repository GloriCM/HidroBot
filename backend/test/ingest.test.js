import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { sha256 } from '../src/lib/crypto.js'
import { createTestApp, hasDatabaseUrl, resetAuthTables, shutdownTestApp } from './helpers.js'

const run = hasDatabaseUrl() ? describe : describe.skip

run('ingest API', () => {
  /** @type {import('fastify').FastifyInstance} */
  let app
  /** @type {ReturnType<import('./helpers.js').testConfig>} */
  let config
  let deviceId = ''
  const deviceKey = 'test-device-key-abcdefghijklmnopqrstuvwxyz'

  before(async () => {
    ;({ app, config } = await createTestApp())
    await resetAuthTables(config.DATABASE_URL)

    const register = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Ingest',
        email: 'ingest@example.com',
        password: 'cesped123',
        garden: 'Jardín ingest',
      },
    })
    assert.equal(register.statusCode, 201)
    const cookie = register.cookies.find((item) => item.name === config.COOKIE_NAME)

    const summary = await app.inject({
      method: 'GET',
      url: '/api/panel/summary',
      cookies: { [config.COOKIE_NAME]: cookie.value },
    })
    assert.equal(summary.statusCode, 200)
    const zoneId = summary.json().zone.id

    const created = await app.inject({
      method: 'POST',
      url: `/api/zones/${zoneId}/devices`,
      cookies: { [config.COOKIE_NAME]: cookie.value },
      payload: { name: 'ESP32 test' },
    })
    assert.equal(created.statusCode, 201)
    deviceId = created.json().device.id

    // Reemplaza la clave por una conocida para el test
    await app.db.query('UPDATE devices SET api_key_hash = $2 WHERE id = $1', [
      deviceId,
      sha256(deviceKey),
    ])
  })

  after(async () => {
    if (app) await shutdownTestApp(app)
  })

  test('rechaza sin tokens', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/ingest/readings',
      payload: { deviceId, humidity: 40 },
    })
    assert.equal(response.statusCode, 401)
  })

  test('guarda lectura y responde decisión', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/ingest/readings',
      headers: {
        'x-ingest-token': config.INGEST_TOKEN,
        'x-device-key': deviceKey,
      },
      payload: { deviceId, humidity: 20 },
    })
    assert.equal(response.statusCode, 200)
    const body = response.json()
    assert.equal(body.regar, true)
    assert.ok(body.segundos > 0)
    assert.equal(body.reading.humidity, 20)

    const panel = await app.inject({
      method: 'GET',
      url: '/api/panel/summary',
      cookies: {
        [config.COOKIE_NAME]: (
          await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: { email: 'ingest@example.com', password: 'cesped123' },
          })
        ).cookies.find((item) => item.name === config.COOKIE_NAME).value,
      },
    })
    assert.equal(panel.statusCode, 200)
    assert.equal(panel.json().latest.humidity, 20)
    assert.equal(panel.json().online, true)
  })
})
