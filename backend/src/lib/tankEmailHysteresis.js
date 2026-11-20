import { medianOf } from './tankCalibration.js'

export const TANK_NOTIFY_MEDIAN_SAMPLES = 3
export const TANK_RECOVERY_OFFSET_PCT = 10

/**
 * Mediana del % de tanque con las últimas lecturas que tienen ultrasónico.
 * @param {{ tank_pct: number | null, distance_cm: number | null }[]} readingsDesc — más reciente primero
 * @returns {number | null}
 */
export function medianTankPctFromReadings(readingsDesc) {
  const pcts = []
  for (const row of readingsDesc) {
    if (row.distance_cm == null || row.tank_pct == null) continue
    const pct = Number(row.tank_pct)
    if (!Number.isFinite(pct)) continue
    pcts.push(pct)
    if (pcts.length >= TANK_NOTIFY_MEDIAN_SAMPLES) break
  }
  if (pcts.length < TANK_NOTIFY_MEDIAN_SAMPLES) return null
  return medianOf(pcts).median
}

/**
 * @param {'normal' | 'low' | 'empty'} phase
 * @param {number | null} medianPct
 * @param {{ lowPct: number, minPct: number }} thresholds
 */
export function decideTankNotifyTransition(phase, medianPct, { lowPct, minPct }) {
  const recoveryPct = lowPct + TANK_RECOVERY_OFFSET_PCT
  if (medianPct == null) {
    return { nextPhase: phase, events: [] }
  }

  if (phase === 'normal') {
    if (medianPct < minPct) {
      return { nextPhase: 'empty', events: ['tank_empty'] }
    }
    if (medianPct < lowPct) {
      return { nextPhase: 'low', events: ['tank_low'] }
    }
    return { nextPhase: 'normal', events: [] }
  }

  if (phase === 'low') {
    if (medianPct < minPct) {
      return { nextPhase: 'empty', events: ['tank_empty'] }
    }
    if (medianPct >= recoveryPct) {
      return { nextPhase: 'normal', events: ['tank_recovered'] }
    }
    return { nextPhase: 'low', events: [] }
  }

  if (phase === 'empty') {
    if (medianPct >= recoveryPct) {
      return { nextPhase: 'normal', events: ['tank_recovered'] }
    }
    return { nextPhase: 'empty', events: [] }
  }

  return { nextPhase: phase, events: [] }
}