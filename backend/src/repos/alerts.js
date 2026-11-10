/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function recentAlertOfType(db, { userId, deviceId, type, cooldownMinutes }) {
  const result = await db.query(
    `SELECT id, created_at
     FROM alerts
     WHERE user_id = $1
       AND type = $2
       AND (($3::uuid IS NULL AND device_id IS NULL) OR device_id = $3)
       AND created_at > now() - ($4::text || ' minutes')::interval
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, type, deviceId ?? null, String(cooldownMinutes)],
  )
  return result.rows[0] || null
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function insertAlert(db, {
  userId,
  zoneId = null,
  deviceId = null,
  type,
  severity = 'warning',
  message,
}) {
  const result = await db.query(
    `INSERT INTO alerts (user_id, zone_id, device_id, type, severity, message)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, user_id, zone_id, device_id, type, severity, message, read_at, created_at`,
    [userId, zoneId, deviceId, type, severity, message],
  )
  return result.rows[0]
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function listAlertsForUser(db, userId, limit = 30) {
  const result = await db.query(
    `SELECT id, user_id, zone_id, device_id, type, severity, message, read_at, created_at
     FROM alerts
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit],
  )
  return result.rows
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function markAlertRead(db, alertId, userId) {
  const result = await db.query(
    `UPDATE alerts SET read_at = now()
     WHERE id = $1 AND user_id = $2
     RETURNING id, read_at`,
    [alertId, userId],
  )
  return result.rows[0] || null
}
