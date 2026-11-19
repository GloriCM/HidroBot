/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function getActiveOwnership(db, deviceId) {
  const result = await db.query(
    `SELECT id, device_id, user_id, zone_id, claimed_at, unclaimed_at, device_name
     FROM device_ownerships
     WHERE device_id = $1 AND unclaimed_at IS NULL
     LIMIT 1`,
    [deviceId],
  )
  return result.rows[0] || null
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function insertOwnership(db, { deviceId, userId, zoneId, deviceName, claimedAt }) {
  const result = await db.query(
    `INSERT INTO device_ownerships (device_id, user_id, zone_id, device_name, claimed_at)
     VALUES ($1, $2, $3, $4, COALESCE($5, now()))
     RETURNING *`,
    [deviceId, userId, zoneId, deviceName, claimedAt ?? null],
  )
  return result.rows[0]
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function closeOwnership(db, ownershipId, unclaimedAt = new Date()) {
  const result = await db.query(
    `UPDATE device_ownerships
     SET unclaimed_at = $2
     WHERE id = $1 AND unclaimed_at IS NULL
     RETURNING *`,
    [ownershipId, unclaimedAt],
  )
  return result.rows[0] || null
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function listActiveDevicesForUser(db, userId) {
  const result = await db.query(
    `SELECT d.id, d.name, d.mqtt_id, d.mac, d.online, d.firmware_version,
            d.last_seen_at, d.last_source, d.last_pump, d.created_at,
            ow.id AS ownership_id, ow.claimed_at,
            z.id AS zone_id, z.name AS zone_name, g.id AS garden_id, g.name AS garden_name
     FROM device_ownerships ow
     INNER JOIN devices d ON d.id = ow.device_id
     INNER JOIN zones z ON z.id = ow.zone_id
     INNER JOIN gardens g ON g.id = z.garden_id
     WHERE ow.unclaimed_at IS NULL AND g.user_id = $1
     ORDER BY d.name`,
    [userId],
  )
  return result.rows
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function listPastOwnershipsForUser(db, userId) {
  const result = await db.query(
    `SELECT ow.id, ow.device_id, ow.device_name, ow.claimed_at, ow.unclaimed_at,
            z.name AS zone_name, g.name AS garden_name
     FROM device_ownerships ow
     INNER JOIN zones z ON z.id = ow.zone_id
     INNER JOIN gardens g ON g.id = z.garden_id
     WHERE ow.unclaimed_at IS NOT NULL AND g.user_id = $1
     ORDER BY ow.unclaimed_at DESC`,
    [userId],
  )
  return result.rows
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function getOwnershipForUser(db, ownershipId, userId) {
  const result = await db.query(
    `SELECT ow.*, d.mqtt_id, d.id AS device_id
     FROM device_ownerships ow
     INNER JOIN devices d ON d.id = ow.device_id
     INNER JOIN zones z ON z.id = ow.zone_id
     INNER JOIN gardens g ON g.id = z.garden_id
     WHERE ow.id = $1 AND g.user_id = $2`,
    [ownershipId, userId],
  )
  return result.rows[0] || null
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function deleteOwnershipData(db, ownershipId) {
  await db.query(`DELETE FROM device_telemetry WHERE ownership_id = $1`, [ownershipId])
  await db.query(`DELETE FROM alerts WHERE ownership_id = $1`, [ownershipId])
  await db.query(`DELETE FROM irrigation_events WHERE ownership_id = $1`, [ownershipId])
}