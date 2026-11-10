import { ackCommand, expirePendingCommands, nextPendingCommand } from '../repos/commands.js'
import { getZoneSettings } from '../repos/zones.js'
import { closeOpenIrrigation, insertIrrigationEvent, openIrrigation } from '../repos/irrigations.js'

/**
 * Decide riego tras una lectura. Nunca supera max_irrigation_seconds.
 * @returns {{ regar: boolean, segundos: number, motivo: string }}
 */
export async function decideIrrigation(db, { device, humidity }) {
  await expirePendingCommands(db, device.id)

  const settings = await getZoneSettings(db, device.zone_id)
  const maxSeconds = Number(settings?.max_irrigation_seconds ?? 60)
  const threshold = Number(settings?.threshold_pct ?? 35)
  const mode = settings?.mode || 'auto'

  const pending = await nextPendingCommand(db, device.id)
  if (pending?.type === 'stop') {
    await ackCommand(db, pending.id)
    await closeOpenIrrigation(db, device.zone_id, {
      reason: 'stopped',
      secondsActual: 0,
    })
    return { regar: false, segundos: 0, motivo: 'Comando detener' }
  }

  if (pending?.type === 'irrigate') {
    const seconds = Math.min(Number(pending.seconds || maxSeconds), maxSeconds)
    await ackCommand(db, pending.id)
    const open = await openIrrigation(db, device.zone_id)
    if (!open) {
      await insertIrrigationEvent(db, {
        zoneId: device.zone_id,
        deviceId: device.id,
        reason: 'manual',
        secondsRequested: seconds,
      })
    }
    return { regar: true, segundos: seconds, motivo: 'Comando manual' }
  }

  if (mode === 'auto' && humidity < threshold) {
    const open = await openIrrigation(db, device.zone_id)
    if (!open) {
      await insertIrrigationEvent(db, {
        zoneId: device.zone_id,
        deviceId: device.id,
        reason: 'automatic',
        secondsRequested: maxSeconds,
      })
    }
    return {
      regar: true,
      segundos: maxSeconds,
      motivo: `Humedad ${humidity}% bajo umbral ${threshold}%`,
    }
  }

  const open = await openIrrigation(db, device.zone_id)
  if (open && humidity >= threshold) {
    await closeOpenIrrigation(db, device.zone_id, {
      secondsActual: open.seconds_requested,
    })
  }

  return { regar: false, segundos: 0, motivo: 'Sin riego' }
}
