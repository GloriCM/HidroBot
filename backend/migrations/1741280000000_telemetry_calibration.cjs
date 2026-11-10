/**
 * Telemetría ESP32, calibraciones, mqtt_id y nuevos tipos de alerta.
 * No editar una vez aplicada: crear una migración nueva.
 *
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.addColumns('devices', {
    mqtt_id: { type: 'text' },
    online: { type: 'boolean', notNull: true, default: false },
    last_source: { type: 'text' },
    last_pump: { type: 'boolean', notNull: true, default: false },
  })

  pgm.sql(`
    UPDATE devices
    SET mqtt_id = 'esp32-' || substr(replace(id::text, '-', ''), 1, 8)
    WHERE mqtt_id IS NULL
  `)

  pgm.alterColumn('devices', 'mqtt_id', { notNull: true })
  pgm.createIndex('devices', 'mqtt_id', { unique: true, name: 'devices_mqtt_id_unique' })

  pgm.createTable('device_calibration', {
    device_id: {
      type: 'uuid',
      primaryKey: true,
      references: 'devices',
      onDelete: 'CASCADE',
    },
    humidity_raw_dry: { type: 'integer', notNull: true, default: 3000 },
    humidity_raw_wet: { type: 'integer', notNull: true, default: 1200 },
    distance_full_cm: { type: 'numeric(6,2)', notNull: true, default: 5 },
    distance_empty_cm: { type: 'numeric(6,2)', notNull: true, default: 40 },
    battery_v_empty: { type: 'numeric(5,2)', notNull: true, default: 9.0 },
    battery_v_full: { type: 'numeric(5,2)', notNull: true, default: 12.6 },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  })

  pgm.sql(`
    INSERT INTO device_calibration (device_id)
    SELECT id FROM devices
    ON CONFLICT (device_id) DO NOTHING
  `)

  pgm.addColumns('zone_settings', {
    tank_min_pct: { type: 'numeric(5,2)', notNull: true, default: 10 },
    battery_min_pct: { type: 'numeric(5,2)', notNull: true, default: 30 },
    allow_manual_on_battery: { type: 'boolean', notNull: true, default: false },
  })

  pgm.createTable('device_telemetry', {
    id: { type: 'bigserial', primaryKey: true },
    device_id: {
      type: 'uuid',
      notNull: true,
      references: 'devices',
      onDelete: 'CASCADE',
    },
    humidity_raw: { type: 'integer' },
    humidity_pct: { type: 'numeric(5,2)' },
    distance_cm: { type: 'numeric(6,2)' },
    tank_pct: { type: 'numeric(5,2)' },
    v_red: { type: 'numeric(5,2)' },
    v_bat: { type: 'numeric(5,2)' },
    battery_pct: { type: 'numeric(5,2)' },
    source: { type: 'text' },
    pump: { type: 'boolean', notNull: true, default: false },
    rssi: { type: 'integer' },
    recorded_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  })
  pgm.createIndex('device_telemetry', ['device_id', { name: 'recorded_at', sort: 'DESC' }])

  pgm.sql(`ALTER TYPE alert_type ADD VALUE IF NOT EXISTS 'power_cut'`)
  pgm.sql(`ALTER TYPE alert_type ADD VALUE IF NOT EXISTS 'power_restored'`)
  pgm.sql(`ALTER TYPE alert_type ADD VALUE IF NOT EXISTS 'battery_low'`)
  pgm.sql(`ALTER TYPE alert_type ADD VALUE IF NOT EXISTS 'tank_low'`)
  pgm.sql(`ALTER TYPE alert_type ADD VALUE IF NOT EXISTS 'tank_empty'`)
  pgm.sql(`ALTER TYPE irrigation_reason ADD VALUE IF NOT EXISTS 'blocked_tank'`)
  pgm.sql(`ALTER TYPE irrigation_reason ADD VALUE IF NOT EXISTS 'blocked_battery'`)
}

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.down = (pgm) => {
  pgm.dropTable('device_telemetry')
  pgm.dropColumns('zone_settings', [
    'tank_min_pct',
    'battery_min_pct',
    'allow_manual_on_battery',
  ])
  pgm.dropTable('device_calibration')
  pgm.dropIndex('devices', 'mqtt_id', { name: 'devices_mqtt_id_unique' })
  pgm.dropColumns('devices', ['mqtt_id', 'online', 'last_source', 'last_pump'])
  // Los valores nuevos de ENUM no se eliminan fácilmente; se dejan.
}
