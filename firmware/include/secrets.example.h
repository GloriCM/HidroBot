// Copia este archivo como "secrets.h" (en esta misma carpeta) y rellena tus datos.
// secrets.h esta en .gitignore: nunca se sube a GitHub.
// El Wi-Fi NO va aqui: el usuario lo configura desde el celular (portal WiFiManager).
#pragma once

// Contrasena del usuario "esp32" de Mosquitto (la pone el fabricante, no el usuario)
const char* MQTT_PASS = "CLAVE_DEL_USUARIO_esp32";

// Clave de la red de configuracion "HidroBot-XXXX" (minimo 8 caracteres)
const char* AP_PASS = "hidrobot2026";
