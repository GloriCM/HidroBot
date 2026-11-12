/**
 * Alerta cuando el ultrasónico no entrega distancia_cm.
 *
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.sql(`ALTER TYPE alert_type ADD VALUE IF NOT EXISTS 'sensor_tanque_sin_lectura'`)
}

/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.down = () => {
  // Los valores de ENUM no se eliminan de forma segura.
}
