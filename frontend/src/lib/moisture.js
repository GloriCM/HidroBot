export function moistureState(value, threshold = 35, watch = 55) {
  if (value == null || Number.isNaN(Number(value))) {
    return {
      key: 'unknown',
      title: 'Sin lectura',
      detail: 'Todavía no hay datos del sensor.',
    }
  }
  const humidity = Number(value)
  if (humidity < threshold) {
    return {
      key: 'dry',
      title: 'La tierra pide agua',
      detail: 'La humedad está por debajo del umbral. Conviene regar.',
    }
  }
  if (humidity < watch) {
    return {
      key: 'watch',
      title: 'Humedad en vigilancia',
      detail: 'Todavía hay reserva. HidroBot sigue midiendo.',
    }
  }
  return {
    key: 'ok',
    title: 'Naturaleza en equilibrio',
    detail: 'El césped tiene el agua que necesita.',
  }
}
