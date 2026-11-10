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
}) {
  await expirePendingCommands(db, device.id)

  const settings = await getZoneSettings(db, device.zone_id)
  const maxSeconds = Number(settings?.max_irrigation_seconds ?? 60)
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
  })

  if (decision.code === 'stop' && pending) {
    await ackCommand(db, pending.id)
    await closeOpenIrrigation(db, device.zone_id, {
      reason: 'stopped',
      secondsActual: 0,
    })
    return decision
  }

  if (decision.code === 'tank_low') {
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
  const threshold = Number(settings?.threshold_pct ?? 35)
  if (open && humidityPct >= threshold) {
    await closeOpenIrrigation(db, device.zone_id, {
      secondsActual: open.seconds_requested,
    })
  }

  return decision
}
