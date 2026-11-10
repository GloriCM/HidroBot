/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function insertTelemetry(db, row) {
  const result = await db.query(
    `INSERT INTO device_telemetry (
       device_id, humidity_raw, humidity_pct, distance_cm, tank_pct,
       v_red, v_bat, battery_pct, source, pump, rssi, recorded_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, COALESCE($12, now()))
     RETURNING *`,
    [
      row.deviceId,
      row.humidityRaw ?? null,
      row.humidityPct ?? null,
      row.distanceCm ?? null,
      row.tankPct ?? null,
      row.vRed ?? null,
      row.vBat ?? null,
      row.batteryPct ?? null,
      row.source ?? null,
      row.pump ?? false,
      row.rssi ?? null,
      row.recordedAt ?? null,
    ],
  )
  return result.rows[0]
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function latestTelemetry(db, deviceId) {
  const result = await db.query(
    `SELECT * FROM device_telemetry
     WHERE device_id = $1
     ORDER BY recorded_at DESC
     LIMIT 1`,
    [deviceId],
  )
  return result.rows[0] || null
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function listTelemetry(db, { deviceId, from, to = new Date(), limit = 500 }) {
  const result = await db.query(
    `SELECT * FROM device_telemetry
     WHERE device_id = $1 AND recorded_at >= $2 AND recorded_at <= $3
     ORDER BY recorded_at ASC
     LIMIT $4`,
    [deviceId, from, to, limit],
  )
  return result.rows
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function deleteOldTelemetry(db, retentionDays) {
  const result = await db.query(
    `DELETE FROM device_telemetry
     WHERE recorded_at < now() - ($1::text || ' days')::interval`,
    [String(retentionDays)],
  )
  return result.rowCount || 0
}
