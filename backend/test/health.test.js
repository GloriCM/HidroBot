import assert from 'node:assert/strict'
import { test } from 'node:test'
import { closePool } from '../src/db/pool.js'
import { buildApp } from '../src/app.js'
import { testConfig } from './helpers.js'

test('GET /api/health responde estructura básica sin DB', async () => {
  const config = testConfig({
    DATABASE_URL: 'postgres://invalid:invalid@127.0.0.1:1/none',
  })

  const app = await buildApp({ config })
  const response = await app.inject({ method: 'GET', url: '/api/health' })

  assert.equal(response.statusCode, 503)
  const body = response.json()
  assert.equal(body.status, 'error')
  assert.equal(body.db, 'error')

  await app.close()
  await closePool()
})
