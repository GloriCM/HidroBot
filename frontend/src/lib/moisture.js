export function moistureState(value) {
  if (value < 35) {
    return {
      key: 'dry',
      title: 'La tierra pide agua',
      detail: 'La humedad está por debajo del umbral. Conviene regar.',
    }
  }
  if (value < 55) {
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
