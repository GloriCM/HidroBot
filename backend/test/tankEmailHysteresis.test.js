import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  decideTankNotifyTransition,
  medianTankPctFromReadings,
  TANK_NOTIFY_MEDIAN_SAMPLES,
  TANK_RECOVERY_OFFSET_PCT,
} from '../src/lib/tankEmailHysteresis.js'

describe('tank email hysteresis', () => {
  test('mediana ignora lecturas sin ultrasónico', () => {
    const rows = [
      { tank_pct: 22, distance_cm: 12 },
      { tank_pct: 18, distance_cm: null },
      { tank_pct: 24, distance_cm: 11 },
      { tank_pct: 23, distance_cm: 10 },
    ]
    const median = medianTankPctFromReadings(rows)
    assert.equal(median, 23)
  })

  test('mediana requiere 3 lecturas válidas', () => {
    const rows = [
      { tank_pct: 15, distance_cm: 8 },
      { tank_pct: 16, distance_cm: 9 },
    ]
    assert.equal(medianTankPctFromReadings(rows), null)
    assert.equal(TANK_NOTIFY_MEDIAN_SAMPLES, 3)
  })

  test('bajo desde normal', () => {
    const { nextPhase, events } = decideTankNotifyTransition('normal', 18, { lowPct: 20, minPct: 10 })
    assert.equal(nextPhase, 'low')
    assert.deepEqual(events, ['tank_low'])
  })

  test('vacío desde normal sin pasar por bajo', () => {
    const { nextPhase, events } = decideTankNotifyTransition('normal', 8, { lowPct: 20, minPct: 10 })
    assert.equal(nextPhase, 'empty')
    assert.deepEqual(events, ['tank_empty'])
  })

  test('recuperado con histéresis +10', () => {
    const lowPct = 20
    const recovery = lowPct + TANK_RECOVERY_OFFSET_PCT
    assert.equal(recovery, 30)
    const low = decideTankNotifyTransition('low', 29, { lowPct, minPct: 10 })
    assert.equal(low.nextPhase, 'low')
    assert.equal(low.events.length, 0)
    const ok = decideTankNotifyTransition('low', 31, { lowPct, minPct: 10 })
    assert.equal(ok.nextPhase, 'normal')
    assert.deepEqual(ok.events, ['tank_recovered'])
  })

  test('no repite aviso bajo en fase low', () => {
    const stuck = decideTankNotifyTransition('low', 15, { lowPct: 20, minPct: 10 })
    assert.equal(stuck.events.length, 0)
  })
})