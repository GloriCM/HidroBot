import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  batteryPctFromVoltage,
  humidityPctFromRaw,
  tankPctFromDistance,
} from '../src/lib/calibration.js'

const soil = { humidity_raw_dry: 3000, humidity_raw_wet: 1200 }
const tank = { distance_full_cm: 5, distance_empty_cm: 40 }
const bat = { battery_v_empty: 9.0, battery_v_full: 12.6 }

test('humedad: seco → 0, mojado → 100, medio ≈ 50', () => {
  assert.equal(humidityPctFromRaw(3000, soil), 0)
  assert.equal(humidityPctFromRaw(1200, soil), 100)
  assert.ok(Math.abs(humidityPctFromRaw(2100, soil) - 50) < 0.1)
})

test('humedad: clamp fuera de rango', () => {
  assert.equal(humidityPctFromRaw(4000, soil), 0)
  assert.equal(humidityPctFromRaw(500, soil), 100)
})

test('tanque: lleno → 100, vacío → 0', () => {
  assert.equal(tankPctFromDistance(5, tank), 100)
  assert.equal(tankPctFromDistance(40, tank), 0)
  assert.ok(Math.abs(tankPctFromDistance(22.5, tank) - 50) < 0.2)
})

test('batería: extremos y curva no lineal (mitad de voltaje ≠ 50%)', () => {
  assert.equal(batteryPctFromVoltage(9.0, bat), 0)
  assert.equal(batteryPctFromVoltage(12.6, bat), 100)
  const midVolt = 9 + (12.6 - 9) * 0.5 // 10.8 V → x=0.5
  const midSoc = batteryPctFromVoltage(midVolt, bat)
  assert.ok(midSoc > 35 && midSoc < 55, `SOC a 10.8V debería ~50 por tramos, fue ${midSoc}`)
  // Por debajo del medio lineal de voltaje, la curva Li-ion suele dar menos SOC que lineal
  const low = batteryPctFromVoltage(9.9, bat) // x≈0.25
  assert.ok(low < 25, `SOC a 9.9V debería ser bajo, fue ${low}`)
})
