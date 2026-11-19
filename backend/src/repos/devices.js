/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function listDevicesByZone(db, zoneId) {
  const result = await db.query(
    `SELECT id, zone_id, name, mqtt_id, online, last_seen_at, last_source, last_pump,
            ownership_status, firmware_version, mac, created_at
     FROM devices WHERE zone_id = $1 ORDER BY created_at`,
    [zoneId],
  )
  return result.rows
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function insertUnclaimedDevice(db, { name, mqttId, mac }) {
  const result = await db.query(
    `INSERT INTO devices (name, mqtt_id, mac, ownership_status, zone_id)
     VALUES ($1, $2, $3, 'unclaimed', NULL)
     RETURNING id, zone_id, name, mqtt_id, mac, online, ownership_status, firmware_version,
               last_seen_at, last_source, last_pump, created_at`,
    [name || 'HidroBot', mqttId, mac],
  )
  return result.rows[0]
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function insertDevice(db, { zoneId, name, apiKeyHash, mqttId }) {
  const result = await db.query(
    `INSERT INTO devices (zone_id, name, api_key_hash, mqtt_id, ownership_status)
     VALUES ($1, $2, $3, $4, 'claimed')
     RETURNING id, zone_id, name, mqtt_id, online, last_seen_at, last_source, last_pump, created_at`,
    [zoneId, name, apiKeyHash ?? null, mqttId],
  )
  return result.rows[0]
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function findDeviceRowByMqttId(db, mqttId) {
  const result = await db.query(
    `SELECT id, zone_id, name, mqtt_id, mac, api_key_hash, online, ownership_status,
            firmware_version, last_seen_at, last_source, last_pump, created_at
     FROM devices
     WHERE mqtt_id = $1`,
    [mqttId],
  )
  return result.rows[0] || null
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function findDeviceById(db, deviceId) {
  const result = await db.query(
    `SELECT d.id, d.zone_id, d.name, d.mqtt_id, d.api_key_hash, d.mac, d.ownership_status,
            d.firmware_version, d.online, d.last_seen_at, d.last_source, d.last_pump,
            d.created_at, g.user_id
     FROM devices d
     LEFT JOIN zones z ON z.id = d.zone_id
     LEFT JOIN gardens g ON g.id = z.garden_id
     WHERE d.id = $1`,
    [deviceId],
  )
  return result.rows[0] || null
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function findDeviceByMqttId(db, mqttId) {
  return findDeviceRowByMqttId(db, mqttId)
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function updateDevicePresent(db, deviceId, { mac, firmwareVersion, lastSeenAt }) {
  await db.query(
    `UPDATE devices SET
       mac = COALESCE($2, mac),
       firmware_version = COALESCE($3, firmware_version),
       last_seen_at = COALESCE($4, last_seen_at),
       online = true
     WHERE id = $1`,
    [deviceId, mac ?? null, firmwareVersion ?? null, lastSeenAt ?? new Date()],
  )
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function claimDeviceRow(db, deviceId, { zoneId, name }) {
  const result = await db.query(
    `UPDATE devices SET
       zone_id = $2,
       name = $3,
       ownership_status = 'claimed'
     WHERE id = $1 AND ownership_status = 'unclaimed'
     RETURNING *`,
    [deviceId, zoneId, name],
  )
  return result.rows[0] || null
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function unclaimDeviceRow(db, deviceId) {
  const result = await db.query(
    `UPDATE devices SET zone_id = NULL, ownership_status = 'unclaimed'
     WHERE id = $1
     RETURNING *`,
    [deviceId],
  )
  return result.rows[0] || null
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function updateDeviceName(db, deviceId, name) {
  const result = await db.query(
    `UPDATE devices SET name = $2 WHERE id = $1 RETURNING id, name`,
    [deviceId, name],
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
export async function updateDeviceRuntime(db, deviceId, { online, source, pump, lastSeenAt }) {
  await db.query(
    `UPDATE devices SET
       online = COALESCE($2, online),
       last_source = COALESCE($3, last_source),
       last_pump = COALESCE($4, last_pump),
       last_seen_at = COALESCE($5, last_seen_at)
     WHERE id = $1`,
    [deviceId, online ?? null, source ?? null, pump ?? null, lastSeenAt ?? null],
  )
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function listAllDevices(db) {
  const result = await db.query(
    `SELECT id, zone_id, name, mqtt_id, online, last_seen_at, last_source, last_pump, created_at
     FROM devices
     WHERE ownership_status = 'claimed' AND zone_id IS NOT NULL
     ORDER BY created_at`,
  )
  return result.rows
}

export async function listStaleDevices(db, offlineMinutes) {
  const result = await db.query(
    `SELECT d.id, d.name, d.zone_id, d.last_seen_at, d.mqtt_id, g.user_id
     FROM devices d
     INNER JOIN zones z ON z.id = d.zone_id
     INNER JOIN gardens g ON g.id = z.garden_id
     WHERE d.ownership_status = 'claimed'
       AND d.online = true
       AND (
         d.last_seen_at IS NULL
         OR d.last_seen_at < now() - ($1::text || ' minutes')::interval
       )`,
    [String(offlineMinutes)],
  )
  return result.rows
}