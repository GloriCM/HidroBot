import { tankPctFromDistance } from './calibration.js'

export const TANK_HC_SR04_MIN_FULL_CM = 3
export const TANK_MIN_EMPTY_FULL_DIFF_CM = 5
export const TANK_UNSTABLE_READING_SPREAD_CM = 2
export const TANK_MEDIAN_SAMPLE_SIZE = 5
export const TANK_BLIND_ZONE_LIVE_CM = 5
export const TANK_NO_READING_MS = 30_000

export function isTankCalibrated(cal) {
  const full = Number(cal?.distance_full_cm ?? cal?.distanceFullCm)
  const empty = Number(cal?.distance_empty_cm ?? cal?.distanceEmptyCm)
  return validateTankDistancePair(full, empty) === null
}

export function tankStepLiveValidation(step, liveDistanceCm, emptyCm) {
  if (liveDistanceCm == null || !Number.isFinite(liveDistanceCm)) {
    return {
      ok: false,
      message: 'El sensor no responde: revisa los cables del ultrasónico.',
    }
  }
  if (liveDistanceCm < TANK_BLIND_ZONE_LIVE_CM) {
    return {
      ok: false,
      message:
        'El agua está demasiado cerca del sensor (zona ciega). Baja el nivel o sube el sensor.',
    }
  }
  if (step === 2 && Number.isFinite(emptyCm)) {
    if (liveDistanceCm >= emptyCm || emptyCm - liveDistanceCm < TANK_MIN_EMPTY_FULL_DIFF_CM) {
      return {
        ok: false,
        message: `Llena más el tanque: la distancia debe ser menor que la de vacío (${emptyCm} cm).`,
      }
    }
  }
  return { ok: true, message: '' }
}

/**
 * @param {number[]} values
 */
export function medianOf(values) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (sorted.length === 0) {
    return { median: null, count: 0 }
  }
  const mid = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  return { median, count: sorted.length }
}

/**
 * @param {number[]} readings
 */
export function assessDistanceStability(readings) {
  const valid = readings.filter((v) => Number.isFinite(v))
  if (valid.length < 2) {
    return { unstable: false, spread: 0, count: valid.length }
  }
  const spread = Math.max(...valid) - Math.min(...valid)
  return {
    unstable: spread > TANK_UNSTABLE_READING_SPREAD_CM,
    spread,
    count: valid.length,
  }
}

/**
 * Mediana de hasta las últimas N lecturas válidas.
 * @param {number[]} readings cronológicas
 * @param {number} [n]
 */
export function stableMedianFromReadings(readings, n = TANK_MEDIAN_SAMPLE_SIZE) {
  const tail = readings
    .filter((v) => Number.isFinite(v) && v >= 0)
    .slice(-n)
  const { median, count } = medianOf(tail)
  const stability = assessDistanceStability(tail)
  return { median, count, stability, samples: tail }
}

/**
 * @param {number} fullCm distancia con tanque lleno (menor)
 * @param {number} emptyCm distancia con tanque vacío (mayor)
 * @returns {string | null} mensaje de error o null si ok
 */
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

export { tankPctFromDistance }