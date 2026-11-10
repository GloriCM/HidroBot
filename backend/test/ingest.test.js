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
  let mqttId = ''
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
      payload: { name: 'ESP32 test', mqttId: 'esp32-test' },
    })
    assert.equal(created.statusCode, 201)
    deviceId = created.json().device.id
    mqttId = created.json().device.mqttId

    await app.db.query('UPDATE devices SET api_key_hash = $2 WHERE id = $1', [
      deviceId,
      sha256(deviceKey),
    ])
  })

  after(async () => {
    if (app) await shutdownTestApp(app)
  })

  test('readings está deprecado', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/ingest/readings',
      headers: {
        'x-ingest-token': config.INGEST_TOKEN,
        'x-device-key': deviceKey,
      },
      payload: { deviceId, humidity: 40 },
    })
    assert.equal(response.statusCode, 410)
  })

  test('guarda telemetría y responde decisión', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/ingest/telemetry',
      headers: {
        'x-ingest-token': config.INGEST_TOKEN,
        'x-device-key': deviceKey,
      },
      payload: {
        mqttId,
        humedad_raw: 2800,
        distancia_cm: 12,
        v_red: 12.1,
        v_bat: 11.8,
        fuente: 'red',
        bomba: false,
        rssi: -60,
      },
    })
    assert.equal(response.statusCode, 200)
    const body = response.json()
    assert.equal(typeof body.regar, 'boolean')
    assert.ok(body.telemetry.humidity_pct >= 0)
    assert.ok(body.telemetry.tank_pct >= 0)

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'ingest@example.com', password: 'cesped123' },
    })
    const cookie = login.cookies.find((item) => item.name === config.COOKIE_NAME)
    const panel = await app.inject({
      method: 'GET',
      url: '/api/panel/summary',
      cookies: { [config.COOKIE_NAME]: cookie.value },
    })
    assert.equal(panel.statusCode, 200)
    assert.ok(panel.json().latest.humidity != null)
    assert.equal(panel.json().online, true)
  })
})
