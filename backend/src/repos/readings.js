/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function insertReading(db, { deviceId, humidityPct, recordedAt }) {
  const result = await db.query(
    `INSERT INTO moisture_readings (device_id, humidity_pct, recorded_at)
     VALUES ($1, $2, COALESCE($3, now()))
     RETURNING id, device_id, humidity_pct, recorded_at`,
    [deviceId, humidityPct, recordedAt ?? null],
  )
  return result.rows[0]
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function latestReading(db, deviceId) {
  const result = await db.query(
    `SELECT id, device_id, humidity_pct, recorded_at
     FROM moisture_readings
     WHERE device_id = $1
     ORDER BY recorded_at DESC
     LIMIT 1`,
    [deviceId],
  )
  return result.rows[0] || null
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @param {{ deviceId: string, from: Date, to?: Date, limit?: number }} opts
 */
export async function listReadings(db, { deviceId, from, to = new Date(), limit = 500 }) {
  const result = await db.query(
    `SELECT id, device_id, humidity_pct, recorded_at
     FROM moisture_readings
     WHERE device_id = $1
       AND recorded_at >= $2
       AND recorded_at <= $3
     ORDER BY recorded_at ASC
     LIMIT $4`,
    [deviceId, from, to, limit],
  )
  return result.rows
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function deleteOldReadings(db, retentionDays) {
  const result = await db.query(
    `DELETE FROM moisture_readings
     WHERE recorded_at < now() - ($1::text || ' days')::interval`,
    [String(retentionDays)],
  )
  return result.rowCount || 0
}
