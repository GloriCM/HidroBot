# HidroBot

Prototipo de riego inteligente: sensor → ESP32 → Node-RED → API → bomba, con panel web.

## Levantar en local

```bash
cp .env.example .env
# Edita SESSION_SECRET e INGEST_TOKEN (mín. 32 y 16 caracteres).
# Para HTTP local: COOKIE_SECURE=false
# Opcional: SEED=1 para usuario demo

docker compose --profile local up -d --build
```

- Panel: http://localhost:8080  
- Salud (vía nginx, Uptime Kuma): http://localhost:8080/api/health  

Solo el servicio `web` publica puerto. `api` y `db` quedan en la red interna.

En producción el servidor usa `docker compose up -d --build` **sin** perfil `local` y un `docker-compose.override.yml` propio (no versionado) con `DATABASE_URL` externo.

## Variables de entorno

Ver [`.env.example`](.env.example). Todas las conexiones a Postgres usan `DATABASE_URL`.

| Variable | Uso |
|----------|-----|
| `DATABASE_URL` | Postgres |
| `SESSION_SECRET` | Firma/cookie de sesión |
| `INGEST_TOKEN` | Canal Node-RED → API |
| `COOKIE_SECURE` | Cookies Secure (true detrás de HTTPS/Cloudflare) |
| `COMMAND_TTL_MINUTES` | Caducidad de comandos pendientes (default 10) |
| `READINGS_RETENTION_DAYS` | Retención de lecturas (default 90) |
| `SEED` | `1` solo en local para crear demo; ignorado en `NODE_ENV=production` |

## Migraciones

Se aplican solas al arrancar el contenedor `api` (idempotentes).

Nueva migración (desde `backend/`, con `DATABASE_URL` apuntando a tu Postgres):

```bash
cd backend
npm run migrate:create -- nombre_descriptivo
# Edita el archivo en migrations/
# Nunca edites una migración ya aplicada en algún entorno.
```

Aplicar a mano:

```bash
cd backend
npm run migrate
```

## Semilla demo

```bash
# En .env: SEED=1 y NODE_ENV distinto de production
docker compose --profile local up -d --build
```

Usuario demo: `demo@hidrobot.local` / `cesped123` (solo si `SEED=1`).

## Autenticación

- `POST /api/auth/register` — crea usuario, jardín/zona por defecto y cookie de sesión
- `POST /api/auth/login` — cookie httpOnly; límite de intentos por IP (CF-Connecting-IP) + email
- `POST /api/auth/logout`
- `GET /api/auth/me` — requiere sesión

Las contraseñas usan argon2. Los tokens de sesión se guardan como SHA-256.

## Tests

```bash
cd backend
npm test
```

Los tests de auth/ingesta necesitan Postgres:

```bash
# Con el stack local arriba:
set DATABASE_URL=postgres://hidrobot:hidrobot@127.0.0.1:5432/hidrobot
# (en PowerShell: $env:DATABASE_URL="...")
# Publica temporalmente el puerto de db solo para tests locales, o usa un Postgres en el host.
npm test
```

## Probar telemetría (ESP32 / Node-RED)

1. Panel → Configuración → **Vincular ESP32** (`mqtt_id`, p. ej. `esp32-1`) y guarda la clave en `DEVICE_API_KEYS` de Node-RED.
2. Importa el flujo [`nodered/flows-hidrobot.json`](nodered/flows-hidrobot.json).
3. Prueba directa a la API:

```bash
curl -sS -X POST http://localhost:8080/api/ingest/telemetry \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Token: TU_INGEST_TOKEN" \
  -H "X-Device-Key: CLAVE_DEL_DISPOSITIVO" \
  -d '{"mqttId":"esp32-1","humedad_raw":2140,"distancia_cm":23.5,"v_red":12.1,"v_bat":11.8,"fuente":"red","bomba":false,"rssi":-67}'
```

Respuesta: `{ "regar": true|false, "segundos": n, "motivo": "...", "telemetry": {...} }`.

`POST /api/ingest/readings` está deprecado (410).

## Stack

- `frontend/`: React + Vite + nginx (proxy `/api` → `api:3000`)
- `backend/`: Node 22 + Fastify + `pg` + node-pg-migrate
- `db` (perfil `local`): PostgreSQL 17
