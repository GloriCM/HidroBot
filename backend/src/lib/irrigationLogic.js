/**
 * Decisión de riego pura (sin DB), para tests.
 *
 * Orden:
 * 1. stop pendiente
 * 2. tanque bajo mínimo
 * 3. batería baja (auto bloqueado; manual solo si allowManualOnBattery)
 * 4. irrigate pendiente
 * 5. auto + humedad bajo umbral
 * 6. no regar
 *
 * @param {{
 *   pending?: { type: 'stop'|'irrigate', seconds?: number|null } | null,
 *   tankPct: number,
 *   tankMinPct: number,
 *   source: 'red'|'bateria'|string,
 *   batteryPct: number,
 *   batteryMinPct: number,
 *   allowManualOnBattery: boolean,
 *   humidityPct: number,
 *   thresholdPct: number,
 *   mode: 'auto'|'manual',
 *   maxSeconds: number,
 * }} input
 */
export function decideIrrigationLogic(input) {
  const maxSeconds = Math.max(1, Number(input.maxSeconds) || 60)
  const pending = input.pending || null

  if (pending?.type === 'stop') {
    return { regar: false, segundos: 0, motivo: 'Comando detener', code: 'stop' }
  }

  if (Number(input.tankPct) < Number(input.tankMinPct)) {
    return {
      regar: false,
      segundos: 0,
      motivo: `Tanque bajo (${Number(input.tankPct).toFixed(0)}% < ${input.tankMinPct}%)`,
      code: 'tank_low',
    }
  }

  const onBattery = input.source === 'bateria'
  const batteryLow = Number(input.batteryPct) < Number(input.batteryMinPct)

  if (pending?.type === 'irrigate') {
    if (onBattery && batteryLow && !input.allowManualOnBattery) {
      return {
        regar: false,
        segundos: 0,
        motivo: 'Batería baja: riego manual no permitido',
        code: 'battery_block_manual',
      }
    }
    const seconds = Math.min(Number(pending.seconds || maxSeconds), maxSeconds)
    return { regar: true, segundos: seconds, motivo: 'Comando manual', code: 'manual' }
  }

  if (onBattery && batteryLow) {
    return {
      regar: false,
      segundos: 0,
      motivo: `Batería baja (${Number(input.batteryPct).toFixed(0)}% < ${input.batteryMinPct}%)`,
      code: 'battery_low',
    }
  }

  if (input.mode === 'auto' && Number(input.humidityPct) < Number(input.thresholdPct)) {
    return {
      regar: true,
      segundos: maxSeconds,
      motivo: `Humedad ${Number(input.humidityPct).toFixed(0)}% bajo umbral ${input.thresholdPct}%`,
      code: 'auto',
    }
  }

  return { regar: false, segundos: 0, motivo: 'Sin riego', code: 'idle' }
}
