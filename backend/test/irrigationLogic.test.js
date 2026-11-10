import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decideIrrigationLogic } from '../src/lib/irrigationLogic.js'

const base = {
  pending: null,
  tankPct: 80,
  tankMinPct: 10,
  source: 'red',
  batteryPct: 90,
  batteryMinPct: 30,
  allowManualOnBattery: false,
  humidityPct: 50,
  thresholdPct: 35,
  mode: 'auto',
  maxSeconds: 60,
}

test('stop pendiente gana', () => {
  const r = decideIrrigationLogic({ ...base, pending: { type: 'stop' }, humidityPct: 10 })
  assert.equal(r.code, 'stop')
  assert.equal(r.regar, false)
})

test('tanque bajo bloquea aunque haya humedad baja', () => {
  const r = decideIrrigationLogic({ ...base, tankPct: 5, humidityPct: 10 })
  assert.equal(r.code, 'tank_low')
  assert.equal(r.regar, false)
})

test('batería baja bloquea auto', () => {
  const r = decideIrrigationLogic({
    ...base,
    source: 'bateria',
    batteryPct: 20,
    humidityPct: 10,
  })
  assert.equal(r.code, 'battery_low')
  assert.equal(r.regar, false)
})

test('batería baja bloquea manual si no está permitido', () => {
  const r = decideIrrigationLogic({
    ...base,
    source: 'bateria',
    batteryPct: 20,
    allowManualOnBattery: false,
    pending: { type: 'irrigate', seconds: 30 },
  })
  assert.equal(r.code, 'battery_block_manual')
  assert.equal(r.regar, false)
})

test('batería baja permite manual si allowManualOnBattery', () => {
  const r = decideIrrigationLogic({
    ...base,
    source: 'bateria',
    batteryPct: 20,
    allowManualOnBattery: true,
    pending: { type: 'irrigate', seconds: 90 },
  })
  assert.equal(r.code, 'manual')
  assert.equal(r.regar, true)
  assert.equal(r.segundos, 60)
})

test('comando irrigate y auto por humedad', () => {
  assert.equal(
    decideIrrigationLogic({ ...base, pending: { type: 'irrigate', seconds: 20 } }).code,
    'manual',
  )
  assert.equal(decideIrrigationLogic({ ...base, humidityPct: 20 }).code, 'auto')
  assert.equal(decideIrrigationLogic({ ...base, humidityPct: 50 }).code, 'idle')
})
