/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function expirePendingCommands(db, deviceId = null) {
  if (deviceId) {
    await db.query(
      `UPDATE device_commands
       SET status = 'expired'
       WHERE device_id = $1 AND status = 'pending' AND expires_at <= now()`,
      [deviceId],
    )
    return
  }
  await db.query(
    `UPDATE device_commands
     SET status = 'expired'
     WHERE status = 'pending' AND expires_at <= now()`,
  )
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function insertCommand(db, { deviceId, type, seconds, expiresAt }) {
  const result = await db.query(
    `INSERT INTO device_commands (device_id, type, seconds, status, expires_at)
     VALUES ($1, $2, $3, 'pending', $4)
     RETURNING id, device_id, type, seconds, status, created_at, expires_at, acked_at`,
    [deviceId, type, seconds ?? null, expiresAt],
  )
  return result.rows[0]
}

/**
 * Cancela pendientes previos del mismo dispositivo al encolar uno nuevo.
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function expireOpenPending(db, deviceId) {
  await db.query(
    `UPDATE device_commands
     SET status = 'expired'
     WHERE device_id = $1 AND status = 'pending'`,
    [deviceId],
  )
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function nextPendingCommand(db, deviceId) {
  const result = await db.query(
    `SELECT id, device_id, type, seconds, status, created_at, expires_at
     FROM device_commands
     WHERE device_id = $1 AND status = 'pending' AND expires_at > now()
     ORDER BY created_at ASC
     LIMIT 1`,
    [deviceId],
  )
  return result.rows[0] || null
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function ackCommand(db, commandId) {
  const result = await db.query(
    `UPDATE device_commands
     SET status = 'acked', acked_at = now()
     WHERE id = $1
     RETURNING id, device_id, type, seconds, status, created_at, expires_at, acked_at`,
    [commandId],
  )
  return result.rows[0] || null
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function latestAckedIrrigation(db, deviceId) {
  const result = await db.query(
    `SELECT id, device_id, type, seconds, status, created_at, acked_at
     FROM device_commands
     WHERE device_id = $1 AND type = 'irrigate' AND status = 'acked'
     ORDER BY acked_at DESC NULLS LAST
     LIMIT 1`,
    [deviceId],
  )
  return result.rows[0] || null
}
