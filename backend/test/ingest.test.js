import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { generateClaimCode } from '../src/lib/claimCode.js'
import { mqttIdFromMac } from '../src/lib/deviceIdentity.js'
import { insertClaimCode } from '../src/repos/claimCodes.js'
import { createTestApp, hasDatabaseUrl, resetAuthTables, shutdownTestApp } from './helpers.js'

const run = hasDatabaseUrl() ? describe : describe.skip

const MAC = '11:22:33:44:55:66'
const MQTT_ID = mqttIdFromMac(MAC)

run('ingest API', () => {
  /** @type {import('fastify').FastifyInstance} */
  let app
  let config
  let mqttId = MQTT_ID

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
    assert.ok(cookie?.value, 'cookie de sesión tras registro')
    const userId = register.json().user.id

    await app.inject({
      method: 'POST',
      url: '/api/ingest/hola',
      headers: { 'x-ingest-token': config.INGEST_TOKEN },
      payload: { mqttId: MQTT_ID, mac: MAC, version_firmware: '1.0.0' },
    })

    const zoneRow = await app.db.query(
      `SELECT z.id FROM zones z
       INNER JOIN gardens g ON g.id = z.garden_id
       WHERE g.user_id = $1
       ORDER BY z.created_at
       LIMIT 1`,
      [userId],
    )
    assert.ok(zoneRow.rows[0], 'zona del usuario')
    const zoneId = zoneRow.rows[0].id
    const dev = await app.db.query(`SELECT id FROM devices WHERE mqtt_id = $1`, [MQTT_ID])
    const code = generateClaimCode()
    await insertClaimCode(app.db, {
      deviceId: dev.rows[0].id,
      codeHash: code.hash,
      expiresAt: new Date(Date.now() + 600_000),
    })
    await app.inject({
      method: 'POST',
      url: '/api/devices/claim',
      cookies: { [config.COOKIE_NAME]: cookie.value },
      payload: { code: code.plain, zoneId, name: 'ESP32 test' },
    })
    mqttId = MQTT_ID
  })

  after(async () => {
    if (app) await shutdownTestApp(app)
  })

  test('readings está deprecado', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/ingest/readings',
      headers: { 'x-ingest-token': config.INGEST_TOKEN },
      payload: { deviceId: '00000000-0000-4000-8000-000000000000', humidity: 40 },
    })
    assert.equal(response.statusCode, 410)
  })

  test('guarda telemetría y responde decisión', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/ingest/telemetry',
      headers: { 'x-ingest-token': config.INGEST_TOKEN },
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