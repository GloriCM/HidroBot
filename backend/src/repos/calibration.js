/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function getCalibration(db, deviceId) {
  const result = await db.query(
    `SELECT device_id, humidity_raw_dry, humidity_raw_wet, distance_full_cm,
            distance_empty_cm, battery_v_empty, battery_v_full, updated_at
     FROM device_calibration WHERE device_id = $1`,
    [deviceId],
  )
  return result.rows[0] || null
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function ensureCalibration(db, deviceId) {
  await db.query(
    `INSERT INTO device_calibration (device_id) VALUES ($1)
     ON CONFLICT (device_id) DO NOTHING`,
    [deviceId],
  )
  return getCalibration(db, deviceId)
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function updateCalibration(db, deviceId, patch) {
  await ensureCalibration(db, deviceId)
  const result = await db.query(
    `UPDATE device_calibration SET
       humidity_raw_dry = COALESCE($2, humidity_raw_dry),
       humidity_raw_wet = COALESCE($3, humidity_raw_wet),
       distance_full_cm = COALESCE($4, distance_full_cm),
       distance_empty_cm = COALESCE($5, distance_empty_cm),
       battery_v_empty = COALESCE($6, battery_v_empty),
       battery_v_full = COALESCE($7, battery_v_full),
       updated_at = now()
     WHERE device_id = $1
     RETURNING device_id, humidity_raw_dry, humidity_raw_wet, distance_full_cm,
               distance_empty_cm, battery_v_empty, battery_v_full, updated_at`,
    [
      deviceId,
      patch.humidityRawDry ?? null,
      patch.humidityRawWet ?? null,
      patch.distanceFullCm ?? null,
      patch.distanceEmptyCm ?? null,
      patch.batteryVEmpty ?? null,
      patch.batteryVFull ?? null,
    ],
  )
  return result.rows[0]
}
