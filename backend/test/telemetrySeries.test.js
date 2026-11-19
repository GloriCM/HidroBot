import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { generateClaimCode } from '../src/lib/claimCode.js'
import { mqttIdFromMac } from '../src/lib/deviceIdentity.js'
import { insertClaimCode } from '../src/repos/claimCodes.js'
import { rangeAggregation } from '../src/services/panelService.js'
import { createTestApp, hasDatabaseUrl, resetAuthTables, shutdownTestApp } from './helpers.js'

const run = hasDatabaseUrl() ? describe : describe.skip

run('GET telemetría agregada por range', () => {
  /** @type {import('fastify').FastifyInstance} */
  let app
  /** @type {ReturnType<import('./helpers.js').testConfig>} */
  let config
  let deviceId = ''
  let cookieValue = ''
  const MAC = '22:33:44:55:66:77'
  const MQTT_ID = mqttIdFromMac(MAC)

  before(async () => {
    ;({ app, config } = await createTestApp())
    await resetAuthTables(config.DATABASE_URL)

    const register = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Agg',
        email: 'agg@example.com',
        password: 'cesped123',
        garden: 'Jardín agg',
      },
    })
    assert.equal(register.statusCode, 201)
    cookieValue = register.cookies.find((item) => item.name === config.COOKIE_NAME).value

    const summary = await app.inject({
      method: 'GET',
      url: '/api/panel/summary',
      cookies: { [config.COOKIE_NAME]: cookieValue },
    })
    const zoneId = summary.json().zone.id

    await app.inject({
      method: 'POST',
      url: '/api/ingest/hola',
      headers: { 'x-ingest-token': config.INGEST_TOKEN },
      payload: { mqttId: MQTT_ID, mac: MAC, version_firmware: '1.0.0' },
    })
    const dev = await app.db.query(`SELECT id FROM devices WHERE mqtt_id = $1`, [MQTT_ID])
    const code = generateClaimCode()
    await insertClaimCode(app.db, {
      deviceId: dev.rows[0].id,
      codeHash: code.hash,
      expiresAt: new Date(Date.now() + 600_000),
    })
    const created = await app.inject({
      method: 'POST',
      url: '/api/devices/claim',
      cookies: { [config.COOKIE_NAME]: cookieValue },
      payload: { code: code.plain, zoneId, name: 'ESP32 agg' },
    })
    assert.equal(created.statusCode, 201)
    deviceId = created.json().device.id
    const ow = await app.db.query(
      `SELECT id FROM device_ownerships WHERE device_id = $1 AND unclaimed_at IS NULL`,
      [deviceId],
    )
    const ownershipId = ow.rows[0].id

    // Inserta puntos a lo largo de ~70 minutos: suficiente para 1h crudo y bins de 6h.
    const now = Date.now()
    const rows = []
    for (let i = 0; i < 42; i += 1) {
      const at = new Date(now - (70 - i) * 60_000)
      rows.push(
        app.db.query(
          `INSERT INTO device_telemetry (
             device_id, ownership_id, humidity_raw, humidity_pct, tank_pct, v_red, v_bat, battery_pct,
             source, pump, rssi, recorded_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'red',false,-55,$9)`,
          [deviceId, ownershipId, 2000 + i, 30 + (i % 5), 50 + (i % 3), 12.0, 11.5, 80, at],
        ),
      )
    }
    // Hueco grande (>30 s) dentro de la última hora: dos puntos con 2 minutos de separación.
    rows.push(
      app.db.query(
        `INSERT INTO device_telemetry (
           device_id, ownership_id, humidity_raw, humidity_pct, tank_pct, v_red, v_bat, battery_pct,
           source, pump, rssi, recorded_at
         ) VALUES ($1,$2,2100,44,55,12.1,11.6,81,'red',true,-50,$3)`,
        [deviceId, ownershipId, new Date(now - 5 * 60_000)],
      ),
      app.db.query(
        `INSERT INTO device_telemetry (
           device_id, ownership_id, humidity_raw, humidity_pct, tank_pct, v_red, v_bat, battery_pct,
           source, pump, rssi, recorded_at
         ) VALUES ($1,$2,2105,45,56,12.1,11.6,81,'red',false,-50,$3)`,
        [deviceId, ownershipId, new Date(now - 5 * 60_000 + 120_000)],
      ),
    )
    await Promise.all(rows)
  })

  after(async () => {
    if (app) await shutdownTestApp(app)
  })

  test('1h: rango dibujado = 1 hora y puntos con t numérico', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/devices/${deviceId}/telemetry?range=1h`,
      cookies: { [config.COOKIE_NAME]: cookieValue },
    })
    assert.equal(response.statusCode, 200)
    const body = response.json()
    assert.equal(body.range.key, '1h')
    assert.equal(body.range.aggregated, false)
    assert.equal(body.range.intervalSeconds, 10)
    const span = body.range.toT - body.range.fromT
    assert.ok(Math.abs(span - 60 * 60 * 1000) < 2000)
    assert.ok(body.series.length > 0)
    const real = body.series.filter((p) => !p.gap)
    assert.ok(real.every((p) => typeof p.t === 'number'))
    assert.ok(real.every((p) => p.t >= body.range.fromT && p.t <= body.range.toT))
    assert.ok(body.series.some((p) => p.gap === true), 'debe cortar el hueco >30s')
  })

  test('6h: agrega por minuto, min/max y termina en la lectura cruda', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/devices/${deviceId}/telemetry?range=6h`,
      cookies: { [config.COOKIE_NAME]: cookieValue },
    })
    assert.equal(response.statusCode, 200)
    const body = response.json()
    assert.equal(body.range.key, '6h')
    assert.equal(body.range.aggregated, true)
    assert.equal(body.range.intervalSeconds, rangeAggregation('6h').intervalSeconds)
    const span = body.range.toT - body.range.fromT
    assert.ok(Math.abs(span - 6 * 60 * 60 * 1000) < 2000)
    const real = body.series.filter((p) => !p.gap)
    assert.ok(real.length > 0)
    assert.ok(real.every((p) => p.humidityMin != null && p.humidityMax != null))
    assert.ok(real.every((p) => p.humidityMin <= p.humidity && p.humidity <= p.humidityMax))
    const last = real[real.length - 1]
    assert.equal(last.rawLatest, true)
    assert.equal(last.aggregated, false)
    const bins = real.filter((p) => p.aggregated)
    assert.ok(bins.length > 0)
    assert.ok(bins.every((p) => p.binEndT === p.t + body.range.intervalSeconds * 1000))
  })

  test('12h y 24h respetan el intervalo de bin configurado', async () => {
    for (const range of ['12h', '24h']) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/devices/${deviceId}/telemetry?range=${range}`,
        cookies: { [config.COOKIE_NAME]: cookieValue },
      })
      assert.equal(response.statusCode, 200)
      const body = response.json()
      assert.equal(body.range.key, range)
      assert.equal(body.range.intervalSeconds, rangeAggregation(range).intervalSeconds)
      const hours = range === '12h' ? 12 : 24
      assert.ok(Math.abs(body.range.toT - body.range.fromT - hours * 3600_000) < 2000)
    }
  })
})
