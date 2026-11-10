/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function listZonesByGarden(db, gardenId) {
  const result = await db.query(
    `SELECT id, garden_id, name, created_at
     FROM zones WHERE garden_id = $1 ORDER BY created_at`,
    [gardenId],
  )
  return result.rows
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function getZoneSettings(db, zoneId) {
  const result = await db.query(
    `SELECT zone_id, threshold_pct, watch_pct, max_irrigation_seconds, mode,
            tank_min_pct, battery_min_pct, allow_manual_on_battery, updated_at
     FROM zone_settings WHERE zone_id = $1`,
    [zoneId],
  )
  return result.rows[0] || null
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function updateZoneSettings(db, zoneId, patch) {
  const result = await db.query(
    `UPDATE zone_settings SET
       threshold_pct = COALESCE($2, threshold_pct),
       watch_pct = COALESCE($3, watch_pct),
       max_irrigation_seconds = COALESCE($4, max_irrigation_seconds),
       mode = COALESCE($5, mode),
       tank_min_pct = COALESCE($6, tank_min_pct),
       battery_min_pct = COALESCE($7, battery_min_pct),
       allow_manual_on_battery = COALESCE($8, allow_manual_on_battery),
       updated_at = now()
     WHERE zone_id = $1
     RETURNING zone_id, threshold_pct, watch_pct, max_irrigation_seconds, mode,
               tank_min_pct, battery_min_pct, allow_manual_on_battery, updated_at`,
    [
      zoneId,
      patch.thresholdPct ?? null,
      patch.watchPct ?? null,
      patch.maxIrrigationSeconds ?? null,
      patch.mode ?? null,
      patch.tankMinPct ?? null,
      patch.batteryMinPct ?? null,
      patch.allowManualOnBattery ?? null,
    ],
  )
  return result.rows[0] || null
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function getPrimaryZoneForUser(db, userId) {
  const result = await db.query(
    `SELECT z.id, z.name, z.garden_id, z.created_at, g.name AS garden_name
     FROM zones z
     JOIN gardens g ON g.id = z.garden_id
     WHERE g.user_id = $1
     ORDER BY g.created_at, z.created_at
     LIMIT 1`,
    [userId],
  )
  return result.rows[0] || null
}
