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

## Config (sin retain)

El ESP32, al conectar, publica `hidrobot/<mqttId>/config/solicitar`. Node-RED llama a
`POST /api/ingest/config/request` y la API responde publicando `hidrobot/<mqttId>/config`
con **QoS 1** y **retain = false**.

También se publica config (sin retain) al guardar calibración/ajustes y al arrancar la API.

Al desplegar el flujo, un inject borra el mensaje retenido antiguo publicando payload vacío
con retain=true en `hidrobot/<id>/config` para cada clave de `DEVICE_API_KEYS`.
