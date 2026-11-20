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
 * Dispositivo activo del usuario (ownership vigente).
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function getDeviceForUser(db, deviceId, userId) {
  const result = await db.query(
    `SELECT d.id, d.name, d.mqtt_id, d.zone_id, d.last_seen_at, d.created_at, d.api_key_hash,
            d.online, d.last_source, d.last_pump, d.firmware_version, d.ownership_status,
            ow.id AS ownership_id,
            z.name AS zone_name, g.user_id, g.id AS garden_id
     FROM devices d
     INNER JOIN device_ownerships ow ON ow.device_id = d.id AND ow.unclaimed_at IS NULL
     INNER JOIN zones z ON z.id = d.zone_id
     INNER JOIN gardens g ON g.id = z.garden_id
     WHERE d.id = $1 AND g.user_id = $2`,
    [deviceId, userId],
  )
  return result.rows[0] || null
}

/**
 * Acceso a historial de un periodo de ownership (activo o pasado).
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function getDeviceAccessForUser(db, deviceId, userId, ownershipId) {
  if (ownershipId) {
    const result = await db.query(
      `SELECT d.id, d.name, d.mqtt_id, ow.id AS ownership_id, ow.zone_id, ow.claimed_at, ow.unclaimed_at,
              z.name AS zone_name, g.user_id
       FROM device_ownerships ow
       INNER JOIN devices d ON d.id = ow.device_id
       INNER JOIN zones z ON z.id = ow.zone_id
       INNER JOIN gardens g ON g.id = z.garden_id
       WHERE ow.id = $1 AND d.id = $2 AND g.user_id = $3`,
      [ownershipId, deviceId, userId],
    )
    return result.rows[0] || null
  }
  return getDeviceForUser(db, deviceId, userId)
}