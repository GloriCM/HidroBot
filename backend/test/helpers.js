import { loadConfig } from '../src/config.js'
import { buildApp } from '../src/app.js'
import { closePool, getPool } from '../src/db/pool.js'
import { runMigrations } from '../src/db/migrate.js'

export function testConfig(overrides = {}) {
  return {
    NODE_ENV: 'test',
    PORT: 3000,
    DATABASE_URL: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgres://hidrobot:hidrobot@127.0.0.1:5432/hidrobot',
    SESSION_SECRET: 'test-session-secret-at-least-32-chars!!',
    INGEST_TOKEN: 'test-ingest-token-16',
    COOKIE_SECURE: false,
    COOKIE_NAME: 'hidrobot_session',
    SESSION_TTL_DAYS: 14,
    COMMAND_TTL_MINUTES: 10,
    DEVICE_OFFLINE_MINUTES: 15,
    READINGS_RETENTION_DAYS: 90,
    ALERT_COOLDOWN_MINUTES: 30,
    LOGIN_MAX_ATTEMPTS: 5,
    LOGIN_WINDOW_MINUTES: 15,
    SEED: false,
    TELEGRAM_BOT_TOKEN: '',
    TRUST_PROXY: true,
    ...overrides,
  }
}

export function hasDatabaseUrl() {
  return Boolean(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL)
}

export async function createTestApp(overrides = {}) {
  const config = testConfig(overrides)
  await runMigrations(config.DATABASE_URL)
  const app = await buildApp({ config })
  return { app, config }
}

export async function resetAuthTables(databaseUrl) {
  const pool = getPool(databaseUrl)
  await pool.query('DELETE FROM users')
}

export async function shutdownTestApp(app) {
  await app.close()
  await closePool()
}

export { loadConfig }
