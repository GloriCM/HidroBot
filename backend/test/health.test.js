import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildApp } from '../src/app.js'

test('GET /api/health responde estructura básica sin DB', async () => {
  const config = {
    NODE_ENV: 'test',
    PORT: 3000,
    DATABASE_URL: 'postgres://invalid:invalid@127.0.0.1:1/none',
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
  }

  const app = await buildApp({ config })
  const response = await app.inject({ method: 'GET', url: '/api/health' })

  assert.equal(response.statusCode, 503)
  const body = response.json()
  assert.equal(body.status, 'error')
  assert.equal(body.db, 'error')

  await app.close()
})
