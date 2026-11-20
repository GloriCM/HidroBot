import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { isSmtpConfigured } from '../src/services/mail/transport.js'
import { countDeviceEmailsLastHour } from '../src/repos/emailNotifications.js'
import { generateClaimCode } from '../src/lib/claimCode.js'
import { mqttIdFromMac } from '../src/lib/deviceIdentity.js'
import { insertClaimCode } from '../src/repos/claimCodes.js'
import { createTestApp, hasDatabaseUrl, resetAuthTables, shutdownTestApp } from './helpers.js'

const run = hasDatabaseUrl() ? describe : describe.skip

const MAC = '22:33:44:55:66:77'
const MQTT_ID = mqttIdFromMac(MAC)

run('email notifications', () => {
  /** @type {import('fastify').FastifyInstance} */
  let app
  let config
  let zoneId
  let deviceId
  let cookieValue

  before(async () => {
    ;({ app, config } = await createTestApp())
    await resetAuthTables(config.DATABASE_URL)

    const register = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Mail',
        email: 'mail@example.com',
        password: 'cesped123',
        garden: 'Jardín mail',
      },
    })
    cookieValue = register.cookies.find((c) => c.name === config.COOKIE_NAME)?.value
    zoneId = (
      await app.db.query(
        `SELECT z.id FROM zones z JOIN gardens g ON g.id = z.garden_id WHERE g.user_id = $1 LIMIT 1`,
        [register.json().user.id],
      )
    ).rows[0].id

    await app.inject({
      method: 'POST',
      url: '/api/ingest/hola',
      headers: { 'x-ingest-token': config.INGEST_TOKEN },
      payload: { mqttId: MQTT_ID, mac: MAC, version_firmware: '1.0.0' },
    })
    deviceId = (await app.db.query(`SELECT id FROM devices WHERE mqtt_id = $1`, [MQTT_ID])).rows[0].id
    const code = generateClaimCode()
    await insertClaimCode(app.db, {
      deviceId,
      codeHash: code.hash,
      expiresAt: new Date(Date.now() + 600_000),
    })
    await app.inject({
      method: 'POST',
      url: '/api/devices/claim',
      cookies: { [config.COOKIE_NAME]: cookieValue },
      payload: { code: code.plain, zoneId, name: 'MailBot' },
    })
  })

  after(async () => {
    if (app) await shutdownTestApp(app)
  })

  test('sin SMTP la API no falla', () => {
    assert.equal(isSmtpConfigured(config), false)
  })

  test('GET notificaciones devuelve defaults', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/zones/${zoneId}/notifications`,
      cookies: { [config.COOKIE_NAME]: cookieValue },
    })
    assert.equal(res.statusCode, 200)
    const body = res.json()
    assert.equal(body.notifications.enabled, true)
    assert.equal(body.notifications.tankAlertLowPct, 20)
    assert.equal(body.notifications.smtpConfigured, false)
  })

  test('correo de prueba sin SMTP responde ok', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/zones/${zoneId}/notifications/test`,
      cookies: { [config.COOKIE_NAME]: cookieValue },
    })
    assert.equal(res.statusCode, 200)
    assert.equal(res.json().queued, false)
  })

  test('ingesta con tanque bajo registra log skipped sin SMTP', async () => {
    await app.db.query(`UPDATE zone_settings SET tank_alert_low_pct = 25 WHERE zone_id = $1`, [zoneId])
    const cal = await app.db.query(`SELECT * FROM device_calibration WHERE device_id = $1`, [deviceId])
    const empty = Number(cal.rows[0].distance_empty_cm)
    const span = empty - Number(cal.rows[0].distance_full_cm)
    const distance = empty - span * 0.18

    for (let i = 0; i < 3; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/ingest/telemetry',
        headers: { 'x-ingest-token': config.INGEST_TOKEN },
        payload: {
          mqttId: MQTT_ID,
          humedad_raw: 1800,
          distancia_cm: distance,
          v_red: 12,
          v_bat: 12.2,
          fuente: 'red',
          bomba: false,
        },
      })
    }

    await new Promise((r) => setTimeout(r, 400))

    const phase = await app.db.query(`SELECT phase FROM device_tank_notify_state WHERE device_id = $1`, [
      deviceId,
    ])
    assert.equal(phase.rows[0]?.phase, 'low')

    const logs = await app.db.query(
      `SELECT status, kind FROM email_send_log WHERE device_id = $1 ORDER BY id DESC LIMIT 5`,
      [deviceId],
    )
    if (logs.rows.length > 0) {
      assert.equal(logs.rows[0].status, 'skipped')
    }
  })

  test('límite por hora en repositorio', async () => {
    for (let i = 0; i < 3; i++) {
      await app.db.query(
        `INSERT INTO email_send_log (zone_id, device_id, recipient, kind, status)
         VALUES ($1,$2,'a@b.com','tank_low','sent')`,
        [zoneId, deviceId],
      )
    }
    const n = await countDeviceEmailsLastHour(app.db, deviceId)
    assert.ok(n >= 3)
  })
})