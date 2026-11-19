/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function findActiveClaimCode(db, deviceId, now = new Date()) {
  const result = await db.query(
    `SELECT id, device_id, code_hash, expires_at, used_at, created_at
     FROM device_claim_codes
     WHERE device_id = $1 AND used_at IS NULL AND expires_at > $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [deviceId, now],
  )
  return result.rows[0] || null
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function invalidateUnusedCodes(db, deviceId) {
  await db.query(
    `UPDATE device_claim_codes
     SET used_at = now()
     WHERE device_id = $1 AND used_at IS NULL`,
    [deviceId],
  )
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function insertClaimCode(db, { deviceId, codeHash, expiresAt }) {
  await invalidateUnusedCodes(db, deviceId)
  const result = await db.query(
    `INSERT INTO device_claim_codes (device_id, code_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING id, device_id, code_hash, expires_at, used_at, created_at`,
    [deviceId, codeHash, expiresAt],
  )
  return result.rows[0]
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function findValidCodeForClaim(db, codeHash, now = new Date()) {
  const result = await db.query(
    `SELECT c.id, c.device_id, c.code_hash, c.expires_at, c.used_at,
            d.mqtt_id, d.ownership_status, d.zone_id
     FROM device_claim_codes c
     INNER JOIN devices d ON d.id = c.device_id
     WHERE c.code_hash = $1
       AND c.used_at IS NULL
       AND c.expires_at > $2
       AND d.ownership_status = 'unclaimed'
     LIMIT 1`,
    [codeHash, now],
  )
  return result.rows[0] || null
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function markClaimCodeUsed(db, codeId) {
  await db.query(`UPDATE device_claim_codes SET used_at = now() WHERE id = $1`, [codeId])
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function recordClaimAttempt(db, { userId, ip, success }) {
  await db.query(
    `INSERT INTO device_claim_attempts (user_id, ip, success) VALUES ($1, $2, $3)`,
    [userId, ip ?? null, Boolean(success)],
  )
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function countRecentFailedClaims(db, { userId, ip, windowMinutes }) {
  const result = await db.query(
    `SELECT
       (SELECT COUNT(*)::int FROM device_claim_attempts
        WHERE user_id = $1 AND success = false
          AND attempted_at > now() - ($3::text || ' minutes')::interval) AS by_user,
       (SELECT COUNT(*)::int FROM device_claim_attempts
        WHERE ip IS NOT NULL AND ip = $2 AND success = false
          AND attempted_at > now() - ($3::text || ' minutes')::interval) AS by_ip`,
    [userId, ip ?? '', String(windowMinutes)],
  )
  return result.rows[0] || { by_user: 0, by_ip: 0 }
}