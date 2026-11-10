/**
 * Semilla opcional. Solo se ejecuta si SEED=1.
 * Nunca activar en producción.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../config.js'
import { getPool, closePool } from '../db/pool.js'
import { sha256, randomToken } from '../lib/crypto.js'
import { hashPassword } from '../lib/password.js'

const DEMO_EMAIL = 'demo@hidrobot.local'
const DEMO_PASSWORD = 'cesped123'

export async function seedDemo(databaseUrl) {
  const pool = getPool(databaseUrl)
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [DEMO_EMAIL])
  if (existing.rowCount > 0) {
    console.log('Semilla: usuario demo ya existe, no se modifica.')
    return { created: false }
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD)
  const deviceKey = process.env.DEMO_DEVICE_KEY || randomToken(24)
  const apiKeyHash = sha256(deviceKey)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const user = await client.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, 'user')
       RETURNING id`,
      [DEMO_EMAIL, passwordHash, 'Demo'],
    )
    const userId = user.rows[0].id

    const garden = await client.query(
      `INSERT INTO gardens (user_id, name) VALUES ($1, $2) RETURNING id`,
      [userId, 'Mi jardín'],
    )
    const gardenId = garden.rows[0].id

    const zone = await client.query(
      `INSERT INTO zones (garden_id, name) VALUES ($1, $2) RETURNING id`,
      [gardenId, 'Césped principal'],
    )
    const zoneId = zone.rows[0].id

    await client.query(
      `INSERT INTO zone_settings (zone_id, threshold_pct, watch_pct, max_irrigation_seconds, mode)
       VALUES ($1, 35, 55, 60, 'auto')`,
      [zoneId],
    )

    const device = await client.query(
      `INSERT INTO devices (zone_id, name, api_key_hash, mqtt_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, mqtt_id`,
      [zoneId, 'ESP32 demo', apiKeyHash, 'esp32-demo'],
    )

    await client.query(
      `INSERT INTO device_calibration (device_id) VALUES ($1)
       ON CONFLICT (device_id) DO NOTHING`,
      [device.rows[0].id],
    )

    await client.query(
      `INSERT INTO notification_prefs (user_id, alerts_enabled)
       VALUES ($1, true)`,
      [userId],
    )

    await client.query('COMMIT')

    console.log('Semilla demo creada.')
    console.log(`  email: ${DEMO_EMAIL}`)
    console.log(`  password: ${DEMO_PASSWORD}`)
    console.log(`  deviceId: ${device.rows[0].id}`)
    console.log(`  mqttId: ${device.rows[0].mqtt_id}`)
    console.log(`  deviceKey: ${deviceKey}`)
    console.log('  Guarda deviceKey; no se vuelve a mostrar.')

    return {
      created: true,
      userId,
      zoneId,
      deviceId: device.rows[0].id,
      mqttId: device.rows[0].mqtt_id,
      deviceKey,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  try {
    const config = loadConfig()
    if (!config.SEED) {
      console.error('La semilla solo corre con SEED=1')
      process.exit(1)
    }
    await seedDemo(config.DATABASE_URL)
    await closePool()
    process.exit(0)
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}
