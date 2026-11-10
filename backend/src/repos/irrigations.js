/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function insertIrrigationEvent(db, {
  zoneId,
  deviceId,
  reason,
  secondsRequested,
  startedAt = new Date(),
}) {
  const result = await db.query(
    `INSERT INTO irrigation_events
       (zone_id, device_id, started_at, reason, seconds_requested)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, zone_id, device_id, started_at, ended_at, reason, seconds_requested, seconds_actual`,
    [zoneId, deviceId ?? null, startedAt, reason, secondsRequested ?? null],
  )
  return result.rows[0]
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function closeOpenIrrigation(db, zoneId, { endedAt = new Date(), secondsActual = null, reason = null } = {}) {
  const result = await db.query(
    `UPDATE irrigation_events
     SET ended_at = $2,
         seconds_actual = COALESCE($3, seconds_actual),
         reason = COALESCE($4, reason)
     WHERE id = (
       SELECT id FROM irrigation_events
       WHERE zone_id = $1 AND ended_at IS NULL
       ORDER BY started_at DESC
       LIMIT 1
     )
     RETURNING id, zone_id, device_id, started_at, ended_at, reason, seconds_requested, seconds_actual`,
    [zoneId, endedAt, secondsActual, reason],
  )
  return result.rows[0] || null
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function openIrrigation(db, zoneId) {
  const result = await db.query(
    `SELECT id, zone_id, device_id, started_at, ended_at, reason, seconds_requested, seconds_actual
     FROM irrigation_events
     WHERE zone_id = $1 AND ended_at IS NULL
     ORDER BY started_at DESC
     LIMIT 1`,
    [zoneId],
  )
  return result.rows[0] || null
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function listIrrigations(db, zoneId, limit = 50) {
  const result = await db.query(
    `SELECT id, zone_id, device_id, started_at, ended_at, reason, seconds_requested, seconds_actual
     FROM irrigation_events
     WHERE zone_id = $1
     ORDER BY started_at DESC
     LIMIT $2`,
    [zoneId, limit],
  )
  return result.rows
}
