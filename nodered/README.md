# Flujo Node-RED — HidroBot

## Importar

1. Abre Node-RED → menú → Importar → selecciona `flows-hidrobot.json`.
2. Configura el broker MQTT `mosquitto` con `MQTT_USER` / `MQTT_PASS`.
3. Define variables de entorno del contenedor Node-RED:

| Variable | Ejemplo |
|----------|---------|
| `API_URL` | `http://api:3000` |
| `INGEST_TOKEN` | mismo que la API |
| `NODERED_TOKEN` | token para que la API publique comandos |
| `DEVICE_API_KEYS` | `{"esp32-1":"clave-del-dispositivo"}` |
| `MQTT_USER` / `MQTT_PASS` | credenciales Mosquitto |

4. Despliega el flujo.

## Endpoint interno

`POST /hidrobot/publish` (header `X-NodeRed-Token`)

```json
{ "mqttId": "esp32-1", "kind": "comando", "payload": { "accion": "regar", "segundos": 60 } }
{ "mqttId": "esp32-1", "kind": "config", "payload": { "...": "..." } }
```

La API usa `NODERED_COMMAND_URL=http://nodered:1880/hidrobot/publish`.

## Config retenida

`kind: "config"` se publica en `hidrobot/<mqttId>/config` con **QoS 1** y **retain = true**
(nodo MQTT dedicado, no depende de `msg.retain`). Al arrancar, la API republica la
config de todos los dispositivos. Tras guardar calibración/ajustes en el panel también.
