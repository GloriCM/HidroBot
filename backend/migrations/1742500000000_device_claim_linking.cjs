/**
 * Vinculación por código, ownerships y MAC → hb-xxxxxx.
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.createType('device_ownership_status', ['unclaimed', 'claimed'])

  pgm.alterColumn('devices', 'api_key_hash', { notNull: false })
  pgm.alterColumn('devices', 'zone_id', { notNull: false })

  pgm.addColumns('devices', {
    mac: { type: 'text' },
    ownership_status: {
      type: 'device_ownership_status',
      notNull: true,
      default: 'claimed',
    },
    firmware_version: { type: 'text' },
  })

  pgm.sql(`
    UPDATE devices SET ownership_status = 'claimed' WHERE zone_id IS NOT NULL
  `)

  pgm.createIndex('devices', 'mac', {
    unique: true,
    name: 'devices_mac_unique',
    where: 'mac IS NOT NULL',
  })

  pgm.createTable('device_ownerships', {
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
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    zone_id: {
      type: 'uuid',
      notNull: true,
      references: 'zones',
      onDelete: 'CASCADE',
    },
    claimed_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    unclaimed_at: { type: 'timestamptz' },
    device_name: { type: 'text', notNull: true, default: 'HidroBot' },
  })
  pgm.createIndex('device_ownerships', 'device_id', {
    name: 'device_ownerships_device_active',
    unique: true,
    where: 'unclaimed_at IS NULL',
  })
  pgm.createIndex('device_ownerships', ['user_id', { name: 'claimed_at', sort: 'DESC' }])

  pgm.createTable('device_claim_codes', {
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
    code_hash: { type: 'text', notNull: true },
    expires_at: { type: 'timestamptz', notNull: true },
    used_at: { type: 'timestamptz' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  })
  pgm.createIndex('device_claim_codes', 'device_id', {
    name: 'device_claim_codes_unused',
    unique: true,
    where: 'used_at IS NULL',
  })

  pgm.createTable('device_claim_attempts', {
    id: { type: 'bigserial', primaryKey: true },
    user_id: { type: 'uuid', references: 'users', onDelete: 'CASCADE' },
    ip: { type: 'text' },
    success: { type: 'boolean', notNull: true, default: false },
    attempted_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  })
  pgm.createIndex('device_claim_attempts', ['user_id', { name: 'attempted_at', sort: 'DESC' }])
  pgm.createIndex('device_claim_attempts', ['ip', { name: 'attempted_at', sort: 'DESC' }])

  pgm.addColumns('device_telemetry', {
    ownership_id: {
      type: 'uuid',
      references: 'device_ownerships',
      onDelete: 'SET NULL',
    },
  })
  pgm.addColumns('alerts', {
    ownership_id: {
      type: 'uuid',
      references: 'device_ownerships',
      onDelete: 'SET NULL',
    },
  })
  pgm.addColumns('irrigation_events', {
    ownership_id: {
      type: 'uuid',
      references: 'device_ownerships',
      onDelete: 'SET NULL',
    },
  })

  pgm.sql(`
    INSERT INTO device_ownerships (device_id, user_id, zone_id, claimed_at, device_name)
    SELECT d.id, g.user_id, d.zone_id, COALESCE(d.created_at, now()), d.name
    FROM devices d
    INNER JOIN zones z ON z.id = d.zone_id
    INNER JOIN gardens g ON g.id = z.garden_id
    WHERE d.zone_id IS NOT NULL
  `)

  pgm.sql(`
    UPDATE device_telemetry t
    SET ownership_id = ow.id
    FROM device_ownerships ow
    WHERE t.device_id = ow.device_id
      AND ow.unclaimed_at IS NULL
      AND t.ownership_id IS NULL
  `)

  pgm.sql(`
    UPDATE alerts a
    SET ownership_id = ow.id
    FROM device_ownerships ow
    WHERE a.device_id = ow.device_id
      AND ow.unclaimed_at IS NULL
      AND a.ownership_id IS NULL
      AND a.device_id IS NOT NULL
  `)

  pgm.sql(`
    UPDATE irrigation_events ie
    SET ownership_id = ow.id
    FROM device_ownerships ow
    WHERE ie.device_id = ow.device_id
      AND ow.unclaimed_at IS NULL
      AND ie.ownership_id IS NULL
  `)

  pgm.sql(`
    UPDATE devices
    SET mqtt_id = 'hb-542cfc',
        mac = '80:f3:da:54:2c:fc',
        ownership_status = 'claimed'
    WHERE mqtt_id = 'esp32-1'
  `)

  pgm.sql(`
    DELETE FROM devices d
    WHERE d.mqtt_id = 'esp32-bcd9286b'
      AND NOT EXISTS (SELECT 1 FROM device_telemetry t WHERE t.device_id = d.id)
  `)
}

exports.down = (pgm) => {
  pgm.sql(`DELETE FROM devices WHERE mqtt_id = 'hb-542cfc' AND mac = '80:f3:da:54:2c:fc'`)
  pgm.sql(`
    UPDATE devices SET mqtt_id = 'esp32-1', mac = NULL
    WHERE mqtt_id = 'hb-542cfc'
  `)

  pgm.dropColumns('irrigation_events', ['ownership_id'])
  pgm.dropColumns('alerts', ['ownership_id'])
  pgm.dropColumns('device_telemetry', ['ownership_id'])
  pgm.dropTable('device_claim_attempts')
  pgm.dropTable('device_claim_codes')
  pgm.dropTable('device_ownerships')
  pgm.dropColumns('devices', ['mac', 'ownership_status', 'firmware_version'])
  pgm.dropType('device_ownership_status')
  pgm.alterColumn('devices', 'zone_id', { notNull: true })
  pgm.alterColumn('devices', 'api_key_hash', { notNull: true })
}