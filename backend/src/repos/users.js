/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function findUserByEmail(db, email) {
  const result = await db.query(
    `SELECT id, email, password_hash, name, role, created_at, updated_at
     FROM users WHERE email = $1`,
    [email],
  )
  return result.rows[0] || null
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function findUserById(db, id) {
  const result = await db.query(
    `SELECT id, email, name, role, created_at, updated_at
     FROM users WHERE id = $1`,
    [id],
  )
  return result.rows[0] || null
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function insertUser(db, { email, passwordHash, name, role = 'user' }) {
  const result = await db.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, name, role, created_at, updated_at`,
    [email, passwordHash, name, role],
  )
  return result.rows[0]
}
