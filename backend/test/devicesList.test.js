import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { generateClaimCode } from '../src/lib/claimCode.js'
import { mqttIdFromMac } from '../src/lib/deviceIdentity.js'
import { isDeviceOnline } from '../src/lib/deviceOnline.js'
import { insertClaimCode } from '../src/repos/claimCodes.js'
import { createTestApp, hasDatabaseUrl, resetAuthTables, shutdownTestApp } from './helpers.js'

const run = hasDatabaseUrl() ? describe : describe.skip

const TEST_MAC = '11:22:33:44:55:66'
const TEST_MQTT = mqttIdFromMac(TEST_MAC)

run('GET /api/devices lista dispositivos reclamados', () => {
  /** @type {import('fastify').FastifyInstance} */
  let app
  let config
  let cookie = ''
  let zoneId = ''
  let deviceId = ''

  before(async () => {
    ;({ app, config } = await createTestApp())
    await resetAuthTables(config.DATABASE_URL)

    const register = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Lista',
        email: 'lista-devices@example.com',
        password: 'cesped123',
        garden: 'Jardín lista',
      },
    })
    cookie = register.cookies.find((item) => item.name === config.COOKIE_NAME).value
    const summary = await app.inject({
      method: 'GET',
      url: '/api/panel/summary',
      cookies: { [config.COOKIE_NAME]: cookie },
    })
    zoneId = summary.json().zone.id

    await app.inject({
      method: 'POST',
      url: '/api/ingest/hola',
      headers: { 'x-ingest-token': config.INGEST_TOKEN },
      payload: { mqttId: TEST_MQTT, mac: TEST_MAC, version_firmware: 'test' },
    })

    const dev = await app.db.query(`SELECT id FROM devices WHERE mqtt_id = $1`, [TEST_MQTT])
    const code = generateClaimCode()
    await insertClaimCode(app.db, {
      deviceId: dev.rows[0].id,
      codeHash: code.hash,
      expiresAt: new Date(Date.now() + 60_000),
    })

    const claim = await app.inject({
      method: 'POST',
      url: '/api/devices/claim',
      cookies: { [config.COOKIE_NAME]: cookie },
      payload: { code: code.plain, zoneId, name: 'Lista Bot' },
    })
    assert.equal(claim.statusCode, 201)
    deviceId = claim.json().device.id
  })

  after(async () => {
    if (app) await shutdownTestApp(app)
  })

  test('aparece con last_seen_at reciente y online coherente', async () => {
    const now = new Date()
    await app.db.query(
      `UPDATE devices SET last_seen_at = $2, online = true WHERE id = $1`,
      [deviceId, now],
    )

    const list = await app.inject({
      method: 'GET',
      url: '/api/devices',
      cookies: { [config.COOKIE_NAME]: cookie },
    })
    assert.equal(list.statusCode, 200)
    const devices = list.json().devices
    assert.equal(devices.length, 1)
    assert.equal(devices[0].mqttId, TEST_MQTT)
    assert.equal(devices[0].name, 'Lista Bot')
    assert.equal(devices[0].online, true)
  })

  test('sigue listado con last_seen_at antiguo (marcado desconectado)', async () => {
    const stale = new Date(Date.now() - 2 * 60 * 60 * 1000)
    await app.db.query(
      `UPDATE devices SET last_seen_at = $2, online = true WHERE id = $1`,
      [deviceId, stale],
    )

    const row = (
      await app.db.query(`SELECT online, last_seen_at FROM devices WHERE id = $1`, [deviceId])
    ).rows[0]
    assert.equal(
      isDeviceOnline(row, config.DEVICE_OFFLINE_MINUTES),
      false,
      'criterio de panel: stale last_seen',
    )

    const list = await app.inject({
      method: 'GET',
      url: '/api/devices',
      cookies: { [config.COOKIE_NAME]: cookie },
    })
    assert.equal(list.statusCode, 200)
    const devices = list.json().devices
    assert.equal(devices.length, 1, 'el dispositivo reclamado no debe desaparecer de la lista')
    assert.equal(devices[0].mqttId, TEST_MQTT)
    assert.equal(devices[0].online, false)
  })
})