# Mosquitto — ACL por dispositivo (HidroBot)

Los ESP32 comparten el usuario MQTT `esp32`. Sin ACL, cualquiera con esa contraseña podría suscribirse a `hidrobot/+/vinculacion` o publicar en temas ajenos.

## Fase 1 (este archivo)

1. Copia `acl` al servidor, por ejemplo `~/apps/mosquitto/acl`.
2. En `mosquitto.conf` (misma carpeta):

   ```conf
   acl_file /mosquitto/config/acl
   ```

   Ajusta la ruta según montes el volumen en Docker o la ruta real en el host.

3. Permisos (como el archivo de contraseñas):

   ```bash
   sudo chown 1883:1883 ~/apps/mosquitto/acl
   sudo chmod 0700 ~/apps/mosquitto/acl
   ```

4. El **client id** de cada ESP32 debe ser exactamente su `mqttId` (`hb-xxxxxx`, minúsculas). Mosquitto sustituye `%c` en `pattern readwrite hidrobot/%c/#`.

5. Reinicia Mosquitto:

   ```bash
   docker compose restart mosquitto
   # o: sudo systemctl restart mosquitto
   ```

6. Verifica: un ESP32 solo puede publicar/suscribir bajo `hidrobot/hb-su-id/...`; no puede leer `hidrobot/otro-id/vinculacion`.

## Fase 2 (documentación)

- Migrar a **credencial MQTT por dispositivo** con el plugin [Dynamic Security](https://mosquitto.org/documentation/dynamic-security/) de Mosquitto: usuario/clave o rol por `hb-xxxxxx`, revocación automática al desvincular, sin depender de `%c` compartido.

## Usuarios esperados

| Usuario   | Uso                          |
|-----------|------------------------------|
| `nodered` | Puente Node-RED ↔ API        |
| `esp32`   | Todos los firmwares (con ACL)  |