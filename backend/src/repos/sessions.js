/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function insertSession(db, { userId, tokenHash, expiresAt, ip, userAgent }) {
  const result = await db.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, expires_at, created_at`,
    [userId, tokenHash, expiresAt, ip ?? null, userAgent ?? null],
  )
  return result.rows[0]
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function findSessionWithUser(db, tokenHash) {
  const result = await db.query(
    `SELECT
       s.id AS session_id,
       s.expires_at,
       u.id AS user_id,
       u.email,
       u.name,
       u.role
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1`,
    [tokenHash],
  )
  return result.rows[0] || null
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function deleteSessionById(db, sessionId) {
  await db.query('DELETE FROM sessions WHERE id = $1', [sessionId])
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function deleteExpiredSessions(db) {
  await db.query('DELETE FROM sessions WHERE expires_at < now()')
}
