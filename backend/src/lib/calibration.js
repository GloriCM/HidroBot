/**
 * Calibraciones del hardware. El ESP32 envía crudos; la API calcula %.
 *
 * Batería 3S Li-ion: curva por tramos sobre x normalizado entre
 * battery_v_empty (0 %) y battery_v_full (100 %).
 * Tramos (SOC vs fracción de voltaje útil), típicos para Li-ion:
 *   0.00 → 0%, 0.15 → 5%, 0.30 → 15%, 0.45 → 35%, 0.55 → 50%,
 *   0.65 → 70%, 0.75 → 85%, 0.85 → 93%, 1.00 → 100%
 */

function clamp(value, min = 0, max = 100) {
  if (!Number.isFinite(value)) return 0
  return Math.min(max, Math.max(min, value))
}

/**
 * @param {number} raw
 * @param {{ humidity_raw_dry: number, humidity_raw_wet: number }} cal
 */
export function humidityPctFromRaw(raw, cal) {
  const dry = Number(cal.humidity_raw_dry)
  const wet = Number(cal.humidity_raw_wet)
  if (!Number.isFinite(raw) || !Number.isFinite(dry) || !Number.isFinite(wet) || dry === wet) {
    return 0
  }
  return clamp((100 * (dry - raw)) / (dry - wet))
}

/**
 * @param {number} distanceCm
 * @param {{ distance_full_cm: number, distance_empty_cm: number }} cal
 */
export function tankPctFromDistance(distanceCm, cal) {
  const full = Number(cal.distance_full_cm)
  const empty = Number(cal.distance_empty_cm)
  if (
    !Number.isFinite(distanceCm) ||
    !Number.isFinite(full) ||
    !Number.isFinite(empty) ||
    empty === full
  ) {
    return 0
  }
  return clamp((100 * (empty - distanceCm)) / (empty - full))
}

/** Puntos [fracción de voltaje útil 0..1, SOC %] */
export const BATTERY_SOC_POINTS = [
  [0.0, 0],
  [0.15, 5],
  [0.3, 15],
  [0.45, 35],
  [0.55, 50],
  [0.65, 70],
  [0.75, 85],
  [0.85, 93],
  [1.0, 100],
]

function interpolatePoints(x, points) {
  if (x <= points[0][0]) return points[0][1]
  if (x >= points[points.length - 1][0]) return points[points.length - 1][1]
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[i + 1]
    if (x >= x0 && x <= x1) {
      const t = (x - x0) / (x1 - x0)
      return y0 + t * (y1 - y0)
    }
  }
  return points[points.length - 1][1]
}

/**
 * @param {number} volts
 * @param {{ battery_v_empty: number, battery_v_full: number }} cal
 */
export function batteryPctFromVoltage(volts, cal) {
  const empty = Number(cal.battery_v_empty)
  const full = Number(cal.battery_v_full)
  if (!Number.isFinite(volts) || !Number.isFinite(empty) || !Number.isFinite(full) || full === empty) {
    return 0
  }
  const x = clamp((volts - empty) / (full - empty), 0, 1)
  return clamp(interpolatePoints(x, BATTERY_SOC_POINTS))
}

export function roundPct(value) {
  return Math.round(clamp(value) * 100) / 100
}
