import assert from 'node:assert/strict'
import { test } from 'node:test'
import { tankPctFromDistance } from '../src/lib/calibration.js'
import {
  assessDistanceStability,
  medianOf,
  stableMedianFromReadings,
  validateTankDistancePair,
  TANK_HC_SR04_MIN_FULL_CM,
  TANK_MIN_EMPTY_FULL_DIFF_CM,
} from '../src/lib/tankCalibration.js'

test('mediana: impar, par y vacío', () => {
  assert.deepEqual(medianOf([40, 10, 30]), { median: 30, count: 3 })
  assert.deepEqual(medianOf([12, 10, 11, 13]), { median: 11.5, count: 4 })
  assert.deepEqual(medianOf([]), { median: null, count: 0 })
})

test('estabilidad: avisa si la dispersión supera 2 cm', () => {
  assert.equal(assessDistanceStability([10, 10.5, 11]).unstable, false)
  assert.equal(assessDistanceStability([10, 12.5, 11]).unstable, true)
  assert.equal(assessDistanceStability([10]).unstable, false)
})

test('stableMedianFromReadings usa hasta 5 lecturas', () => {
  const r = stableMedianFromReadings([100, 5, 6, 7, 8, 9, 10])
  assert.equal(r.count, 5)
  assert.equal(r.median, 8)
  assert.deepEqual(r.samples, [6, 7, 8, 9, 10])
})

test('validación tanque: lleno < vacío, mínimo 5 cm y lleno ≥ 3 cm', () => {
  assert.equal(validateTankDistancePair(5, 40), null)
  assert.ok(validateTankDistancePair(2, 40).includes(String(TANK_HC_SR04_MIN_FULL_CM)))
  assert.notEqual(validateTankDistancePair(10, 9), null)
  assert.notEqual(validateTankDistancePair(10, 12), null)
  assert.ok(validateTankDistancePair(10, 12).includes(String(TANK_MIN_EMPTY_FULL_DIFF_CM)))
})

test('porcentaje tanque con calibración', () => {
  const cal = { distance_full_cm: 5, distance_empty_cm: 40 }
  assert.equal(tankPctFromDistance(5, cal), 100)
  assert.equal(tankPctFromDistance(40, cal), 0)
  assert.ok(Math.abs(tankPctFromDistance(22.5, cal) - 50) < 0.2)
})