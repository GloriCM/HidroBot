/**
 * Crea jardín + zona + settings + preferencias de notificación por defecto.
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function createDefaultGarden(db, { userId, gardenName = 'Mi jardín' }) {
  const garden = await db.query(
    `INSERT INTO gardens (user_id, name) VALUES ($1, $2) RETURNING id, name, created_at`,
    [userId, gardenName],
  )
  const gardenId = garden.rows[0].id

  const zone = await db.query(
    `INSERT INTO zones (garden_id, name) VALUES ($1, $2) RETURNING id, name, created_at`,
    [gardenId, 'Césped principal'],
  )
  const zoneId = zone.rows[0].id

  await db.query(
    `INSERT INTO zone_settings (zone_id, threshold_pct, watch_pct, max_irrigation_seconds, mode)
     VALUES ($1, 35, 55, 60, 'auto')`,
    [zoneId],
  )

  await db.query(
    `INSERT INTO notification_prefs (user_id, alerts_enabled)
     VALUES ($1, true)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  )

  return {
    garden: garden.rows[0],
    zone: zone.rows[0],
  }
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function listGardensByUser(db, userId) {
  const result = await db.query(
    `SELECT id, name, created_at FROM gardens WHERE user_id = $1 ORDER BY created_at`,
    [userId],
  )
  return result.rows
}
