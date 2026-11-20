import crypto from 'node:crypto'

function newToken() {
  return crypto.randomBytes(24).toString('hex')
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function ensureZoneEmailNotifications(db, zoneId) {
  await db.query(
    `INSERT INTO zone_email_notifications (zone_id, owner_unsubscribe_token)
     VALUES ($1, $2)
     ON CONFLICT (zone_id) DO NOTHING`,
    [zoneId, newToken()],
  )
  const result = await db.query(`SELECT * FROM zone_email_notifications WHERE zone_id = $1`, [zoneId])
  const row = result.rows[0]
  if (!row.owner_unsubscribe_token) {
    const token = newToken()
    await db.query(
      `UPDATE zone_email_notifications SET owner_unsubscribe_token = $2, updated_at = now() WHERE zone_id = $1`,
      [zoneId, token],
    )
    row.owner_unsubscribe_token = token
  }
  return row
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function getZoneEmailNotifications(db, zoneId) {
  const row = await ensureZoneEmailNotifications(db, zoneId)
  return row
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function updateZoneEmailNotifications(db, zoneId, patch) {
  await ensureZoneEmailNotifications(db, zoneId)
  const result = await db.query(
    `UPDATE zone_email_notifications SET
       enabled = COALESCE($2, enabled),
       notify_tank_low = COALESCE($3, notify_tank_low),
       notify_tank_empty = COALESCE($4, notify_tank_empty),
       notify_tank_recovered = COALESCE($5, notify_tank_recovered),
       notify_device_offline = COALESCE($6, notify_device_offline),
       owner_email_enabled = COALESCE($7, owner_email_enabled),
       updated_at = now()
     WHERE zone_id = $1
     RETURNING *`,
    [
      zoneId,
      patch.enabled ?? null,
      patch.notifyTankLow ?? null,
      patch.notifyTankEmpty ?? null,
      patch.notifyTankRecovered ?? null,
      patch.notifyDeviceOffline ?? null,
      patch.ownerEmailEnabled ?? null,
    ],
  )
  return result.rows[0] || null
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function listZoneEmailRecipients(db, zoneId) {
  const result = await db.query(
    `SELECT id, zone_id, email, confirmed_at, created_at
     FROM zone_email_recipients
     WHERE zone_id = $1
     ORDER BY created_at`,
    [zoneId],
  )
  return result.rows
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function countZoneEmailRecipients(db, zoneId) {
  const result = await db.query(`SELECT count(*)::int AS n FROM zone_email_recipients WHERE zone_id = $1`, [
    zoneId,
  ])
  return result.rows[0]?.n ?? 0
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function insertZoneEmailRecipient(db, zoneId, email) {
  const confirmToken = newToken()
  const unsubscribeToken = newToken()
  const result = await db.query(
    `INSERT INTO zone_email_recipients (zone_id, email, confirm_token, unsubscribe_token)
     VALUES ($1, $2, $3, $4)
     RETURNING id, zone_id, email, confirm_token, confirmed_at, unsubscribe_token, created_at`,
    [zoneId, email.toLowerCase().trim(), confirmToken, unsubscribeToken],
  )
  return result.rows[0]
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function removeZoneEmailRecipient(db, zoneId, recipientId) {
  const result = await db.query(
    `DELETE FROM zone_email_recipients WHERE zone_id = $1 AND id = $2 RETURNING id`,
    [zoneId, recipientId],
  )
  return result.rows[0] || null
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function confirmEmailRecipientByToken(db, token) {
  const result = await db.query(
    `UPDATE zone_email_recipients
     SET confirmed_at = COALESCE(confirmed_at, now())
     WHERE confirm_token = $1
     RETURNING id, zone_id, email, confirmed_at`,
    [token],
  )
  return result.rows[0] || null
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function unsubscribeOwnerByToken(db, token) {
  const result = await db.query(
    `UPDATE zone_email_notifications
     SET owner_email_enabled = false, updated_at = now()
     WHERE owner_unsubscribe_token = $1
     RETURNING zone_id`,
    [token],
  )
  return result.rows[0] || null
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function unsubscribeRecipientByToken(db, token) {
  const result = await db.query(
    `DELETE FROM zone_email_recipients WHERE unsubscribe_token = $1 RETURNING zone_id, email`,
    [token],
  )
  return result.rows[0] || null
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function getDeviceTankNotifyPhase(db, deviceId) {
  const result = await db.query(`SELECT phase FROM device_tank_notify_state WHERE device_id = $1`, [deviceId])
  return result.rows[0]?.phase || 'normal'
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function setDeviceTankNotifyPhase(db, deviceId, phase) {
  await db.query(
    `INSERT INTO device_tank_notify_state (device_id, phase, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (device_id) DO UPDATE SET phase = EXCLUDED.phase, updated_at = now()`,
    [deviceId, phase],
  )
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function insertEmailSendLog(db, row) {
  await db.query(
    `INSERT INTO email_send_log (zone_id, device_id, recipient, kind, status, error_message)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [row.zoneId ?? null, row.deviceId ?? null, row.recipient, row.kind, row.status, row.errorMessage ?? null],
  )
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function countDeviceEmailsLastHour(db, deviceId) {
  const result = await db.query(
    `SELECT count(*)::int AS n FROM email_send_log
     WHERE device_id = $1 AND status = 'sent' AND created_at > now() - interval '1 hour'`,
    [deviceId],
  )
  return result.rows[0]?.n ?? 0
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function getOwnerEmailForZone(db, zoneId) {
  const result = await db.query(
    `SELECT u.email, u.id AS user_id
     FROM zones z
     INNER JOIN gardens g ON g.id = z.garden_id
     INNER JOIN users u ON u.id = g.user_id
     WHERE z.id = $1`,
    [zoneId],
  )
  return result.rows[0] || null
}