/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function listDevicesByZone(db, zoneId) {
  const result = await db.query(
    `SELECT id, zone_id, name, last_seen_at, created_at
     FROM devices WHERE zone_id = $1 ORDER BY created_at`,
    [zoneId],
  )
  return result.rows
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function insertDevice(db, { zoneId, name, apiKeyHash }) {
  const result = await db.query(
    `INSERT INTO devices (zone_id, name, api_key_hash)
     VALUES ($1, $2, $3)
     RETURNING id, zone_id, name, last_seen_at, created_at`,
    [zoneId, name, apiKeyHash],
  )
  return result.rows[0]
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function findDeviceById(db, deviceId) {
  const result = await db.query(
    `SELECT d.id, d.zone_id, d.name, d.api_key_hash, d.last_seen_at, d.created_at,
            g.user_id
     FROM devices d
     JOIN zones z ON z.id = d.zone_id
     JOIN gardens g ON g.id = z.garden_id
     WHERE d.id = $1`,
    [deviceId],
  )
  return result.rows[0] || null
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function touchDeviceSeen(db, deviceId, at = new Date()) {
  await db.query(`UPDATE devices SET last_seen_at = $2 WHERE id = $1`, [deviceId, at])
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function listStaleDevices(db, offlineMinutes) {
  const result = await db.query(
    `SELECT d.id, d.name, d.zone_id, d.last_seen_at, g.user_id
     FROM devices d
     JOIN zones z ON z.id = d.zone_id
     JOIN gardens g ON g.id = z.garden_id
     WHERE d.last_seen_at IS NOT NULL
       AND d.last_seen_at < now() - ($1::text || ' minutes')::interval`,
    [String(offlineMinutes)],
  )
  return result.rows
}
