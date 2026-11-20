/**
 * Notificaciones por correo (tanque, desconexión) + estado de histéresis.
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.addColumns('zone_settings', {
    tank_alert_low_pct: { type: 'numeric(5,2)', notNull: true, default: 20 },
  })

  pgm.createTable('zone_email_notifications', {
    zone_id: {
      type: 'uuid',
      primaryKey: true,
      references: 'zones',
      onDelete: 'CASCADE',
    },
    enabled: { type: 'boolean', notNull: true, default: true },
    notify_tank_low: { type: 'boolean', notNull: true, default: true },
    notify_tank_empty: { type: 'boolean', notNull: true, default: true },
    notify_tank_recovered: { type: 'boolean', notNull: true, default: true },
    notify_device_offline: { type: 'boolean', notNull: true, default: true },
    owner_email_enabled: { type: 'boolean', notNull: true, default: true },
    owner_unsubscribe_token: { type: 'text' },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  })

  pgm.createTable('zone_email_recipients', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    zone_id: {
      type: 'uuid',
      notNull: true,
      references: 'zones',
      onDelete: 'CASCADE',
    },
    email: { type: 'text', notNull: true },
    confirm_token: { type: 'text', notNull: true },
    confirmed_at: { type: 'timestamptz' },
    unsubscribe_token: { type: 'text', notNull: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  })
  pgm.createIndex('zone_email_recipients', 'zone_id')
  pgm.createIndex('zone_email_recipients', ['confirm_token'], { unique: true })
  pgm.createIndex('zone_email_recipients', ['unsubscribe_token'], { unique: true })
  pgm.createIndex('zone_email_recipients', ['zone_id', 'email'], { unique: true })

  pgm.createTable('device_tank_notify_state', {
    device_id: {
      type: 'uuid',
      primaryKey: true,
      references: 'devices',
      onDelete: 'CASCADE',
    },
    phase: { type: 'text', notNull: true, default: 'normal' },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  })
  pgm.addConstraint('device_tank_notify_state', 'device_tank_notify_state_phase_check', {
    check: "phase IN ('normal', 'low', 'empty')",
  })

  pgm.createTable('email_send_log', {
    id: { type: 'bigserial', primaryKey: true },
    zone_id: { type: 'uuid', references: 'zones', onDelete: 'SET NULL' },
    device_id: { type: 'uuid', references: 'devices', onDelete: 'SET NULL' },
    recipient: { type: 'text', notNull: true },
    kind: { type: 'text', notNull: true },
    status: { type: 'text', notNull: true },
    error_message: { type: 'text' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  })
  pgm.createIndex('email_send_log', ['device_id', 'created_at'])
  pgm.createIndex('email_send_log', ['zone_id', 'created_at'])

  pgm.sql(`
    INSERT INTO zone_email_notifications (zone_id)
    SELECT id FROM zones
    ON CONFLICT (zone_id) DO NOTHING
  `)
}

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropTable('email_send_log')
  pgm.dropTable('device_tank_notify_state')
  pgm.dropTable('zone_email_recipients')
  pgm.dropTable('zone_email_notifications')
  pgm.dropColumns('zone_settings', ['tank_alert_low_pct'])
}