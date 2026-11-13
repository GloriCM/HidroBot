import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  insertGapBreaks,
  rangeAggregation,
  TELEMETRY_SEND_INTERVAL_MS,
} from '../src/services/panelService.js'

describe('agregación de telemetría (configuración)', () => {
  test('1h usa lecturas crudas cada 10 s', () => {
    const cfg = rangeAggregation('1h')
    assert.equal(cfg.hours, 1)
    assert.equal(cfg.binInterval, null)
    assert.equal(cfg.intervalSeconds, 10)
    assert.equal(cfg.gapMs, TELEMETRY_SEND_INTERVAL_MS * 3)
  })

  test('6h / 12h / 24h usan bins de 1 / 2 / 5 minutos', () => {
    assert.deepEqual(
      {
        bin: rangeAggregation('6h').binInterval,
        sec: rangeAggregation('6h').intervalSeconds,
        gap: rangeAggregation('6h').gapMs,
      },
      { bin: '1 minute', sec: 60, gap: 180_000 },
    )
    assert.deepEqual(
      {
        bin: rangeAggregation('12h').binInterval,
        sec: rangeAggregation('12h').intervalSeconds,
        gap: rangeAggregation('12h').gapMs,
      },
      { bin: '2 minutes', sec: 120, gap: 360_000 },
    )
    assert.deepEqual(
      {
        bin: rangeAggregation('24h').binInterval,
        sec: rangeAggregation('24h').intervalSeconds,
        gap: rangeAggregation('24h').gapMs,
      },
      { bin: '5 minutes', sec: 300, gap: 900_000 },
    )
  })

  test('insertGapBreaks corta la serie cuando el hueco supera 3× el intervalo', () => {
    const t0 = Date.parse('2026-03-20T12:00:00.000Z')
    const points = [
      { t: t0, humidity: 40 },
      { t: t0 + 10_000, humidity: 41 },
      { t: t0 + 10_000 + 90_000, humidity: 42 },
    ]
    const out = insertGapBreaks(points, 30_000)
    assert.equal(out.length, 4)
    assert.equal(out[2].gap, true)
    assert.equal(out[2].humidity, null)
    assert.equal(out[3].humidity, 42)
  })

  test('sin huecos no inserta rupturas', () => {
    const t0 = Date.now()
    const points = [
      { t: t0, humidity: 10 },
      { t: t0 + 10_000, humidity: 11 },
      { t: t0 + 20_000, humidity: 12 },
    ]
    assert.equal(insertGapBreaks(points, 30_000).length, 3)
  })
})
