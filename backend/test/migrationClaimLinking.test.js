import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { runner } from 'node-pg-migrate'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sha256 } from '../src/lib/crypto.js'
import { closePool, getPool } from '../src/db/pool.js'
import { hasDatabaseUrl, testConfig } from './helpers.js'

const run = hasDatabaseUrl() ? describe : describe.skip

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsDir = path.resolve(__dirname, '../migrations')

async function migrateTo(databaseUrl, count) {
  return runner({
    databaseUrl,
    dir: migrationsDir,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    count,
    verbose: false,
  })
}

async function resetPublicSchema(db) {
  await db.query(`
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO public;
  `)
}

run('migración device claim sobre datos legacy', () => {
  const databaseUrl =
    process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || testConfig().DATABASE_URL
  let pool

  before(async () => {
    pool = getPool(databaseUrl)
    await resetPublicSchema(pool)
    await migrateTo(databaseUrl, 3)

    const user = await pool.query(
      `INSERT INTO users (email, password_hash, name)
       VALUES ('legacy@example.com', $1, 'Legacy')
       RETURNING id`,
      [sha256('dummy-not-used')],
    )
    const userId = user.rows[0].id
    const garden = await pool.query(
      `INSERT INTO gardens (user_id, name) VALUES ($1, 'Jardín real') RETURNING id`,
      [userId],
    )
    const zone = await pool.query(
      `INSERT INTO zones (garden_id, name) VALUES ($1, 'Zona 1') RETURNING id`,
      [garden.rows[0].id],
    )
    const zoneId = zone.rows[0].id

    const esp1 = await pool.query(
      `INSERT INTO devices (zone_id, name, api_key_hash, mqtt_id)
       VALUES ($1, 'HidroBot real', $2, 'esp32-1') RETURNING id`,
      [zoneId, sha256('legacy-key')],
    )
    const esp1Id = esp1.rows[0].id

    const esp2 = await pool.query(
      `INSERT INTO devices (zone_id, name, api_key_hash, mqtt_id)
       VALUES ($1, 'Prueba', $2, 'esp32-bcd9286b') RETURNING id`,
      [zoneId, sha256('junk-key')],
    )
    const esp2Id = esp2.rows[0].id

    await pool.query(`INSERT INTO device_calibration (device_id) VALUES ($1), ($2)`, [
      esp1Id,
      esp2Id,
    ])

    for (let i = 0; i < 5; i += 1) {
      await pool.query(
        `INSERT INTO device_telemetry (device_id, humidity_raw, humidity_pct, recorded_at)
         VALUES ($1, 2500, 40, now() - ($2::text || ' minutes')::interval)`,
        [esp1Id, String(i * 2)],
      )
    }
  })

  after(async () => {
    await closePool()
  })

  test('conserva esp32-1 como hb-542cfc y elimina esp32-bcd9286b vacío', async () => {
    await migrateTo(databaseUrl, 1)

    const devices = await pool.query(`SELECT mqtt_id, mac FROM devices ORDER BY mqtt_id`)
    assert.equal(devices.rows.length, 1)
    assert.equal(devices.rows[0].mqtt_id, 'hb-542cfc')
    assert.equal(devices.rows[0].mac, '80:f3:da:54:2c:fc')

    const tele = await pool.query(`SELECT COUNT(*)::int AS n FROM device_telemetry`)
    assert.equal(tele.rows[0].n, 5)

    const ow = await pool.query(`SELECT COUNT(*)::int AS n FROM device_ownerships WHERE unclaimed_at IS NULL`)
    assert.equal(ow.rows[0].n, 1)

    const tagged = await pool.query(
      `SELECT COUNT(*)::int AS n FROM device_telemetry WHERE ownership_id IS NOT NULL`,
    )
    assert.equal(tagged.rows[0].n, 5)
  })
})