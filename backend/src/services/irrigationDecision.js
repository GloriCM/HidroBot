import { IRRIGATION_HARD_MAX_SECONDS, IRRIGATION_STOP_HUMIDITY_PCT } from '../lib/irrigationLimits.js'
import { decideIrrigationLogic } from '../lib/irrigationLogic.js'
import { ackCommand, expirePendingCommands, nextPendingCommand } from '../repos/commands.js'
import { closeOpenIrrigation, insertIrrigationEvent, openIrrigation } from '../repos/irrigations.js'
import { getZoneSettings } from '../repos/zones.js'

/**
 * Decide riego tras telemetría. Nunca supera max_irrigation_seconds.
 * @returns {Promise<{ regar: boolean, segundos: number, motivo: string, code: string }>}
 */
export async function decideIrrigation(db, {
  device,
  humidityPct,
  tankPct,
  batteryPct,
  source,
  pumpOn = false,
}) {
  await expirePendingCommands(db, device.id)

  const settings = await getZoneSettings(db, device.zone_id)
  const maxSeconds = Math.min(
    Number(settings?.max_irrigation_seconds ?? 60),
    IRRIGATION_HARD_MAX_SECONDS,
  )

  if (pumpOn && Number(humidityPct) >= IRRIGATION_STOP_HUMIDITY_PCT) {
    await closeOpenIrrigation(db, device.zone_id, {
      reason: 'humidity_target',
      secondsActual: null,
    })
    return {
      regar: false,
      segundos: 0,
      motivo: `Comando detener: humedad ${Number(humidityPct).toFixed(0)}% ≥ ${IRRIGATION_STOP_HUMIDITY_PCT}%`,
      code: 'stop',
    }
  }
  const pending = await nextPendingCommand(db, device.id)

  const decision = decideIrrigationLogic({
    pending: pending ? { type: pending.type, seconds: pending.seconds } : null,
    tankPct,
    tankMinPct: Number(settings?.tank_min_pct ?? 10),
    source,
    batteryPct,
    batteryMinPct: Number(settings?.battery_min_pct ?? 30),
    allowManualOnBattery: Boolean(settings?.allow_manual_on_battery),
    humidityPct,
    thresholdPct: Number(settings?.threshold_pct ?? 35),
    mode: settings?.mode || 'auto',
    maxSeconds,
    pumpOn,
  })

  if (decision.code === 'stop' && pending) {
    await ackCommand(db, pending.id)
    await closeOpenIrrigation(db, device.zone_id, {
      reason: 'stopped',
      secondsActual: 0,
    })
    return decision
  }

  if (decision.code === 'tank_low' || decision.code === 'tank_sensor_missing') {
    return decision
  }

  if (decision.code === 'battery_block_manual' || decision.code === 'battery_low') {
    return decision
  }

  if (decision.code === 'manual' && pending) {
    await ackCommand(db, pending.id)
    const open = await openIrrigation(db, device.zone_id)
    if (!open) {
      await insertIrrigationEvent(db, {
        zoneId: device.zone_id,
        deviceId: device.id,
        reason: 'manual',
        secondsRequested: decision.segundos,
      })
    }
    return decision
  }

  if (decision.code === 'auto') {
    const open = await openIrrigation(db, device.zone_id)
    if (!open) {
      await insertIrrigationEvent(db, {
        zoneId: device.zone_id,
        deviceId: device.id,
        reason: 'automatic',
        secondsRequested: decision.segundos,
      })
    }
    return decision
  }

  const open = await openIrrigation(db, device.zone_id)
  if (open && Number(humidityPct) >= IRRIGATION_STOP_HUMIDITY_PCT) {
    await closeOpenIrrigation(db, device.zone_id, {
      reason: 'humidity_target',
      secondsActual: open.seconds_requested,
    })
    return {
      regar: false,
      segundos: 0,
      motivo: `Comando detener: humedad ≥ ${IRRIGATION_STOP_HUMIDITY_PCT}%`,
      code: 'stop',
    }
  }

  return decision
}
