/**
 * Esquema inicial de HidroBot.
 * No editar una vez aplicada en cualquier entorno: crear una migración nueva.
 *
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.createExtension('pgcrypto', { ifNotExists: true })

  pgm.createType('user_role', ['user', 'admin'])
  pgm.createType('zone_mode', ['auto', 'manual'])
  pgm.createType('irrigation_reason', ['automatic', 'manual', 'stopped'])
  pgm.createType('command_type', ['irrigate', 'stop'])
  pgm.createType('command_status', ['pending', 'acked', 'expired'])
  pgm.createType('alert_type', [
    'dry_persistent',
    'irrigation_too_long',
    'device_offline',
  ])
  pgm.createType('alert_severity', ['info', 'warning', 'critical'])

  pgm.createTable('users', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    email: { type: 'text', notNull: true },
    password_hash: { type: 'text', notNull: true },
    name: { type: 'text', notNull: true },
    role: { type: 'user_role', notNull: true, default: 'user' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  })
  pgm.createIndex('users', 'email', { unique: true, name: 'users_email_unique' })

  pgm.createTable('sessions', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    token_hash: { type: 'text', notNull: true, unique: true },
    expires_at: { type: 'timestamptz', notNull: true },
    ip: { type: 'text' },
    user_agent: { type: 'text' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  })
  pgm.createIndex('sessions', 'user_id')
  pgm.createIndex('sessions', 'expires_at')

  pgm.createTable('gardens', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    name: { type: 'text', notNull: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  })
  pgm.createIndex('gardens', 'user_id')

  pgm.createTable('zones', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    garden_id: {
      type: 'uuid',
      notNull: true,
      references: 'gardens',
      onDelete: 'CASCADE',
    },
    name: { type: 'text', notNull: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  })
  pgm.createIndex('zones', 'garden_id')

  pgm.createTable('zone_settings', {
    zone_id: {
      type: 'uuid',
      primaryKey: true,
      references: 'zones',
      onDelete: 'CASCADE',
    },
    threshold_pct: { type: 'numeric(5,2)', notNull: true, default: 35 },
    watch_pct: { type: 'numeric(5,2)', notNull: true, default: 55 },
    max_irrigation_seconds: { type: 'integer', notNull: true, default: 60 },
    mode: { type: 'zone_mode', notNull: true, default: 'auto' },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  })

  pgm.createTable('devices', {
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
    name: { type: 'text', notNull: true },
    api_key_hash: { type: 'text', notNull: true },
    last_seen_at: { type: 'timestamptz' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  })
  pgm.createIndex('devices', 'zone_id')

  pgm.createTable('moisture_readings', {
    id: { type: 'bigserial', primaryKey: true },
    device_id: {
      type: 'uuid',
      notNull: true,
      references: 'devices',
      onDelete: 'CASCADE',
    },
    humidity_pct: { type: 'numeric(5,2)', notNull: true },
    recorded_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  })
  pgm.createIndex('moisture_readings', ['device_id', { name: 'recorded_at', sort: 'DESC' }])

  pgm.createTable('irrigation_events', {
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
    device_id: {
      type: 'uuid',
      references: 'devices',
      onDelete: 'SET NULL',
    },
    started_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    ended_at: { type: 'timestamptz' },
    reason: { type: 'irrigation_reason', notNull: true },
    seconds_requested: { type: 'integer' },
    seconds_actual: { type: 'integer' },
  })
  pgm.createIndex('irrigation_events', ['zone_id', { name: 'started_at', sort: 'DESC' }])

  pgm.createTable('device_commands', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    device_id: {
      type: 'uuid',
      notNull: true,
      references: 'devices',
      onDelete: 'CASCADE',
    },
    type: { type: 'command_type', notNull: true },
    seconds: { type: 'integer' },
    status: { type: 'command_status', notNull: true, default: 'pending' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    expires_at: { type: 'timestamptz', notNull: true },
    acked_at: { type: 'timestamptz' },
  })
  pgm.createIndex('device_commands', 'device_id', {
    name: 'device_commands_pending_idx',
    where: "status = 'pending'",
  })
  pgm.createIndex('device_commands', 'expires_at', {
    name: 'device_commands_expires_idx',
    where: "status = 'pending'",
  })

  pgm.createTable('alerts', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    zone_id: {
      type: 'uuid',
      references: 'zones',
      onDelete: 'SET NULL',
    },
    device_id: {
      type: 'uuid',
      references: 'devices',
      onDelete: 'SET NULL',
    },
    type: { type: 'alert_type', notNull: true },
    severity: { type: 'alert_severity', notNull: true, default: 'warning' },
    message: { type: 'text', notNull: true },
    read_at: { type: 'timestamptz' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  })
  pgm.createIndex('alerts', ['user_id', { name: 'created_at', sort: 'DESC' }])
  pgm.createIndex('alerts', ['device_id', 'type', { name: 'created_at', sort: 'DESC' }])

  pgm.createTable('notification_prefs', {
    user_id: {
      type: 'uuid',
      primaryKey: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    telegram_chat_id: { type: 'text' },
    alerts_enabled: { type: 'boolean', notNull: true, default: true },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  })
}

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.down = (pgm) => {
  pgm.dropTable('notification_prefs')
  pgm.dropTable('alerts')
  pgm.dropTable('device_commands')
  pgm.dropTable('irrigation_events')
  pgm.dropTable('moisture_readings')
  pgm.dropTable('devices')
  pgm.dropTable('zone_settings')
  pgm.dropTable('zones')
  pgm.dropTable('gardens')
  pgm.dropTable('sessions')
  pgm.dropTable('users')
  pgm.dropType('alert_severity')
  pgm.dropType('alert_type')
  pgm.dropType('command_status')
  pgm.dropType('command_type')
  pgm.dropType('irrigation_reason')
  pgm.dropType('zone_mode')
  pgm.dropType('user_role')
}
