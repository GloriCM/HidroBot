/**
 * Criterio único de “en línea” para panel e lista de dispositivos.
 * @param {{ online?: boolean, last_seen_at?: string | Date | null }} device
 * @param {number} offlineMinutes
 */
export function isDeviceOnline(device, offlineMinutes) {
  if (device?.online === false) return false
  if (!device?.last_seen_at) return false
  const ageMs = Date.now() - new Date(device.last_seen_at).getTime()
  return ageMs <= offlineMinutes * 60 * 1000
}