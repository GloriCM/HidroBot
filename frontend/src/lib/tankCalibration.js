/** Misma lógica que backend/src/lib/tankCalibration.js (mantener en sync). */

export const TANK_HC_SR04_MIN_FULL_CM = 3
export const TANK_MIN_EMPTY_FULL_DIFF_CM = 5
export const TANK_UNSTABLE_READING_SPREAD_CM = 2
export const TANK_MEDIAN_SAMPLE_SIZE = 5

export function medianOf(values) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (sorted.length === 0) return { median: null, count: 0 }
  const mid = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  return { median, count: sorted.length }
}

export function assessDistanceStability(readings) {
  const valid = readings.filter((v) => Number.isFinite(v))
  if (valid.length < 2) return { unstable: false, spread: 0, count: valid.length }
  const spread = Math.max(...valid) - Math.min(...valid)
  return {
    unstable: spread > TANK_UNSTABLE_READING_SPREAD_CM,
    spread,
    count: valid.length,
  }
}

export function stableMedianFromReadings(readings, n = TANK_MEDIAN_SAMPLE_SIZE) {
  const tail = readings.filter((v) => Number.isFinite(v) && v >= 0).slice(-n)
  const { median, count } = medianOf(tail)
  const stability = assessDistanceStability(tail)
  return { median, count, stability, samples: tail }
}

export function validateTankDistancePair(fullCm, emptyCm) {
  if (!Number.isFinite(fullCm) || !Number.isFinite(emptyCm)) {
    return 'Las distancias de tanque deben ser números válidos.'
  }
  if (fullCm < TANK_HC_SR04_MIN_FULL_CM) {
    return `La distancia con tanque lleno debe ser al menos ${TANK_HC_SR04_MIN_FULL_CM} cm (zona ciega del HC-SR04).`
  }
  if (emptyCm <= fullCm) {
    return 'Con el tanque vacío el sensor debe medir más distancia que con el tanque lleno.'
  }
  if (emptyCm - fullCm < TANK_MIN_EMPTY_FULL_DIFF_CM) {
    return `La diferencia entre vacío y lleno debe ser de al menos ${TANK_MIN_EMPTY_FULL_DIFF_CM} cm.`
  }
  return null
}

export function tankPctFromDistance(distanceCm, cal) {
  const full = Number(cal.distanceFullCm)
  const empty = Number(cal.distanceEmptyCm)
  if (
    !Number.isFinite(distanceCm) ||
    !Number.isFinite(full) ||
    !Number.isFinite(empty) ||
    empty === full
  ) {
    return null
  }
  const pct = (100 * (empty - distanceCm)) / (empty - full)
  return Math.min(100, Math.max(0, Math.round(pct * 100) / 100))
}