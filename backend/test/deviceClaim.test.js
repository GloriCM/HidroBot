import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { generateClaimCode } from '../src/lib/claimCode.js'
import { mqttIdFromMac } from '../src/lib/deviceIdentity.js'
import { insertClaimCode } from '../src/repos/claimCodes.js'
import { createTestApp, hasDatabaseUrl, resetAuthTables, shutdownTestApp } from './helpers.js'

const run = hasDatabaseUrl() ? describe : describe.skip

const TEST_MAC = 'aa:bb:cc:dd:ee:ff'
const TEST_MQTT = mqttIdFromMac(TEST_MAC)

run('device claim / hola', () => {
  /** @type {import('fastify').FastifyInstance} */
  let app
  let config
  let cookie = ''
  let zoneId = ''

  before(async () => {
    ;({ app, config } = await createTestApp())
    await resetAuthTables(config.DATABASE_URL)

    const register = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Claim',
        email: 'claim@example.com',
        password: 'cesped123',
        garden: 'Jardín claim',
      },
    })
    cookie = register.cookies.find((item) => item.name === config.COOKIE_NAME).value

    const summary = await app.inject({
      method: 'GET',
      url: '/api/panel/summary',
      cookies: { [config.COOKIE_NAME]: cookie },
    })
    zoneId = summary.json().zone.id
  })

  after(async () => {
    if (app) await shutdownTestApp(app)
  })

  test('rechaza hola si mqttId no coincide con MAC', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/ingest/hola',
      headers: { 'x-ingest-token': config.INGEST_TOKEN },
      payload: { mqttId: 'hb-deadbe', mac: TEST_MAC, version_firmware: '1.0.0' },
    })
    assert.equal(response.statusCode, 400)
  })

  test('presentación crea dispositivo sin dueño', async () => {
    const hola = await app.inject({
      method: 'POST',
      url: '/api/ingest/hola',
      headers: { 'x-ingest-token': config.INGEST_TOKEN },
      payload: { mqttId: TEST_MQTT, mac: TEST_MAC, version_firmware: '1.0.0' },
    })
    assert.equal(hola.statusCode, 200)
    assert.equal(hola.json().ownership, 'unclaimed')
  })

  test('telemetría sin dueño se descarta', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/ingest/telemetry',
      headers: { 'x-ingest-token': config.INGEST_TOKEN },
      payload: {
        mqttId: TEST_MQTT,
        humedad_raw: 2800,
        distancia_cm: 12,
        v_red: 12.1,
        v_bat: 11.8,
        fuente: 'red',
        bomba: false,
      },
    })
    assert.equal(response.statusCode, 200)
    assert.equal(response.json().discarded, true)
    const count = await app.db.query(
      `SELECT COUNT(*)::int AS n FROM device_telemetry t
       INNER JOIN devices d ON d.id = t.device_id
       WHERE d.mqtt_id = $1`,
      [TEST_MQTT],
    )
    assert.equal(count.rows[0].n, 0)
  })

  test('reclamar y caducidad de código', async () => {
    const dev = await app.db.query(`SELECT id FROM devices WHERE mqtt_id = $1`, [TEST_MQTT])
    const code = generateClaimCode()
    await insertClaimCode(app.db, {
      deviceId: dev.rows[0].id,
      codeHash: code.hash,
      expiresAt: new Date(Date.now() + 60_000),
    })

    const bad = await app.inject({
      method: 'POST',
      url: '/api/devices/claim',
      cookies: { [config.COOKIE_NAME]: cookie },
      payload: { code: 'BAD-BAD', zoneId, name: 'Test' },
    })
    assert.equal(bad.statusCode, 404)

    const claim = await app.inject({
      method: 'POST',
      url: '/api/devices/claim',
      cookies: { [config.COOKIE_NAME]: cookie },
      payload: { code: code.plain, zoneId, name: 'Maceta prueba' },
    })
    assert.equal(claim.statusCode, 201)

    const telem = await app.inject({
      method: 'POST',
      url: '/api/ingest/telemetry',
      headers: { 'x-ingest-token': config.INGEST_TOKEN },
      payload: {
        mqttId: TEST_MQTT,
        humedad_raw: 2500,
        distancia_cm: 10,
        v_red: 12,
        v_bat: 12,
        fuente: 'red',
        bomba: false,
      },
    })
    assert.equal(telem.statusCode, 200)
    assert.notEqual(telem.json().discarded, true)

    const deviceId = claim.json().device.id
    const unlink = await app.inject({
      method: 'POST',
      url: `/api/devices/${deviceId}/unlink`,
      cookies: { [config.COOKIE_NAME]: cookie },
      payload: { keepHistory: true },
    })
    assert.equal(unlink.statusCode, 200)

    const list = await app.inject({
      method: 'GET',
      url: '/api/devices',
      cookies: { [config.COOKIE_NAME]: cookie },
    })
    assert.equal(list.json().devices.length, 0)
    assert.ok(list.json().previous.length >= 1)
  })
})