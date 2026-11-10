/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function getZoneForUser(db, zoneId, userId) {
  const result = await db.query(
    `SELECT z.id, z.name, z.garden_id, z.created_at, g.user_id, g.name AS garden_name
     FROM zones z
     JOIN gardens g ON g.id = z.garden_id
     WHERE z.id = $1 AND g.user_id = $2`,
    [zoneId, userId],
  )
  return result.rows[0] || null
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function getDeviceForUser(db, deviceId, userId) {
  const result = await db.query(
    `SELECT d.id, d.name, d.zone_id, d.last_seen_at, d.created_at, d.api_key_hash,
            z.name AS zone_name, g.user_id, g.id AS garden_id
     FROM devices d
     JOIN zones z ON z.id = d.zone_id
     JOIN gardens g ON g.id = z.garden_id
     WHERE d.id = $1 AND g.user_id = $2`,
    [deviceId, userId],
  )
  return result.rows[0] || null
}
