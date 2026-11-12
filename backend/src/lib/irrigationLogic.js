/**
 * Decisión de riego pura (sin DB), para tests.
 *
 * Orden:
 * 1. stop pendiente
 * 2. tanque bajo mínimo (solo si hay lectura válida)
 * 3. batería baja (auto bloqueado; manual solo si allowManualOnBattery)
 * 4. irrigate pendiente
 * 5. auto + humedad bajo umbral (bloqueado si no hay lectura de tanque)
 * 6. no regar
 *
 * @param {{
 *   pending?: { type: 'stop'|'irrigate', seconds?: number|null } | null,
 *   tankPct: number|null|undefined,
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
  const tankPct = input.tankPct
  const tankMissing = tankPct == null || !Number.isFinite(Number(tankPct))

  if (pending?.type === 'stop') {
    return { regar: false, segundos: 0, motivo: 'Comando detener', code: 'stop' }
  }

  if (!tankMissing && Number(tankPct) < Number(input.tankMinPct)) {
    return {
      regar: false,
      segundos: 0,
      motivo: `Tanque bajo (${Number(tankPct).toFixed(0)}% < ${input.tankMinPct}%)`,
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
    if (tankMissing) {
      return {
        regar: false,
        segundos: 0,
        motivo: 'Sin lectura de tanque: riego automático bloqueado',
        code: 'tank_sensor_missing',
      }
    }
    return {
      regar: true,
      segundos: maxSeconds,
      motivo: `Humedad ${Number(input.humidityPct).toFixed(0)}% bajo umbral ${input.thresholdPct}%`,
      code: 'auto',
    }
  }

  return { regar: false, segundos: 0, motivo: 'Sin riego', code: 'idle' }
}
