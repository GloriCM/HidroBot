# Flujo Node-RED — HidroBot

## Importar

1. Abre Node-RED → menú → Importar → selecciona `flows-hidrobot.json`.
2. Configura el broker MQTT `mosquitto` con `MQTT_USER` / `MQTT_PASS` (usuario `nodered` recomendado en servidor).
3. Define variables de entorno del contenedor Node-RED:

| Variable | Ejemplo |
|----------|---------|
| `API_URL` | `http://api:3000` |
| `INGEST_TOKEN` | mismo que la API |
| `NODERED_TOKEN` | token para que la API publique comandos |
| `CLEAR_RETAIN_MQTT_IDS` | `hb-542cfc` (opcional, borra retain legacy al desplegar) |
| `MQTT_USER` / `MQTT_PASS` | credenciales Mosquitto |

4. Despliega el flujo.

## Temas MQTT

| Tema | Dirección | API |
|------|-----------|-----|
| `hidrobot/+/hola` | ESP → NR → API | `POST /api/ingest/hola` |
| `hidrobot/+/telemetria` | ESP → API | `POST /api/ingest/telemetry` |
| `hidrobot/+/estado` | ESP → API | `POST /api/ingest/status` |
| `hidrobot/+/evento` | ESP → API | `POST /api/ingest/event` |
| `hidrobot/+/config/solicitar` | ESP → API | `POST /api/ingest/config/request` |
| `hidrobot/<id>/vinculacion` | API → ESP | kind `vinculacion` (sin retain) |
| `hidrobot/<id>/comando` | API → ESP | kind `comando` |
| `hidrobot/<id>/config` | API → ESP | kind `config` (sin retain) |

La ingesta usa solo el header `X-Ingest-Token`; el `mqttId` sale del tema.

## Endpoint interno

`POST /hidrobot/publish` (header `X-NodeRed-Token`)

```json
{ "mqttId": "hb-542cfc", "kind": "vinculacion", "payload": { "estado": "pendiente", "codigo": "7K2-P9Q" } }
{ "mqttId": "hb-542cfc", "kind": "comando", "payload": { "accion": "regar", "segundos": 60 } }
{ "mqttId": "hb-542cfc", "kind": "config", "payload": { "...": "..." } }
```

La API usa `NODERED_COMMAND_URL=http://nodered:1880/hidrobot/publish`.

## Mosquitto ACL

En producción aplica el archivo [`../mosquitto/acl`](../mosquitto/acl) (ver [`../mosquitto/README.md`](../mosquitto/README.md)). El ESP32 debe usar **client id = mqttId** (`hb-xxxxxx`).

## Config (sin retain)

El ESP32 vinculado publica `hidrobot/<mqttId>/config/solicitar` tras conectar. La API publica calibración en `hidrobot/<mqttId>/config` con QoS 1 y retain false.

Al conectar sin dueño, el ESP publica `hola` y recibe el código en `vinculacion` (sin retain).