export const steps = [
  {
    n: '01',
    title: 'La tierra habla',
    text: 'Un sensor capacitivo, puesto en el césped, lee qué tan húmeda está la tierra. No se desgasta como una sonda de metal.',
  },
  {
    n: '02',
    title: 'El ESP32 publica',
    text: 'El microcontrolador toma esa lectura y la envía por internet al servidor, usando el protocolo HTTP.',
  },
  {
    n: '03',
    title: 'Node-RED decide',
    text: 'El servidor guarda el dato, lo compara con lo que el jardín necesita y elige si toca regar o esperar.',
  },
  {
    n: '04',
    title: 'La bomba obedece',
    text: 'Si hace falta agua, se enciende una mini bomba. El agua sale de un tarro o tanque y llega a los aspersores.',
  },
  {
    n: '05',
    title: 'Tú también mandas',
    text: 'En el panel ves la humedad al momento. Un botón riega a mano. Telegram avisa si el césped pide atención.',
  },
  {
    n: '06',
    title: 'Se protege solo',
    text: 'Funciona con tomacorriente o con pilas. Si pierde la conexión, apaga la bomba para no vaciar el tanque.',
  },
]

export const cares = [
  {
    kicker: 'Panel web',
    title: 'Humedad en tiempo real',
    text: 'Cada lectura llega a la pantalla. Se ve si el césped está en equilibrio, en vigilancia o pidiendo agua.',
  },
  {
    kicker: 'Control',
    title: 'Riego manual',
    text: 'Un botón enciende la mini bomba cuando quieres regar, aunque el umbral todavía no lo haya pedido.',
  },
  {
    kicker: 'Avisos',
    title: 'Alertas por Telegram',
    text: 'Si la tierra se seca o el equipo necesita una mirada, el aviso llega al teléfono.',
  },
  {
    kicker: 'Protección',
    title: 'Falla segura',
    text: 'Sin conexión, la bomba no se queda encendida. El prototipo prefiere no regar antes que perder el tanque.',
  },
]

export const specs = [
  ['Microcontrolador', 'ESP32'],
  ['Sensor', 'Humedad capacitiva, en el césped'],
  ['Protocolo', 'HTTP, hacia un servidor propio'],
  ['Lógica', 'Node-RED guarda, decide y ordena'],
  ['Agua', 'Mini bomba, desde tarro o tanque, hacia aspersores'],
  ['Energía', 'Tomacorriente o pilas'],
  ['Personas', 'Panel web y alertas por Telegram'],
  ['Alcance', 'Jardines y zonas verdes pequeñas'],
]

export const rail = ['Césped', 'Sensor', 'ESP32', 'HTTP', 'Node-RED', 'Bomba', 'Aspersores']
