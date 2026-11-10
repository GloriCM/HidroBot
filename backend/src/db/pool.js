import pg from 'pg'

const { Pool } = pg

/** @type {import('pg').Pool | null} */
let pool = null

export function getPool(databaseUrl) {
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    })
  }
  return pool
}

export async function closePool() {
  if (pool) {
    await pool.end()
    pool = null
  }
}

export async function checkDatabase(databaseUrl) {
  const client = await getPool(databaseUrl).connect()
  try {
    await client.query('SELECT 1')
    return true
  } finally {
    client.release()
  }
}
