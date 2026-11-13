/*
  HidroBot - Firmware del ESP32 (proyecto PlatformIO)
  -------------------------------------------------------------
  Envia la telemetria por MQTT sobre WebSockets seguros
  (wss://mqtt.jelabs.net:443/mqtt) y obedece las ordenes de riego.

  Las librerias se instalan solas desde platformio.ini.
  El Wi-Fi se configura desde el celular (portal WiFiManager):
    - Sin Wi-Fi guardado, el ESP32 crea la red "HidroBot-XXXX".
    - Al conectarse, se abre una pagina para elegir la red y su clave.
    - Mantener el boton BOOT 5 segundos borra el Wi-Fi y abre el portal.
  La contrasena MQTT y la del portal van en include/secrets.h,
  que no se sube a GitHub. Copia include/secrets.example.h y rellenalo.
*/

#include <Arduino.h>
#include "secrets.h"
#include <WiFi.h>
#include <WiFiManager.h>
#include <Wire.h>
#include <WebSocketsClient.h>   // debe ir antes de MQTTPubSubClient.h
#include <MQTTPubSubClient.h>
#include <ArduinoJson.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Preferences.h>

// ===================== 1. DATOS PRIVADOS =====================
// MQTT_PASS y AP_PASS vienen de include/secrets.h (el Wi-Fi se configura por el portal)

// ===================== 2. CONEXION =====================
const char* MQTT_HOST = "mqtt.jelabs.net";
const uint16_t MQTT_PORT = 443;
const char* MQTT_PATH = "/mqtt";
const char* MQTT_USER = "esp32";
const char* DEVICE_ID = "esp32-1";

// ===================== 3. PINES (segun el diagrama) =====================
const int PIN_V_RED = 36;      // divisor 100k/22k de la red
const int PIN_V_BAT = 35;      // divisor 100k/22k de la bateria
const int PIN_SUELO = 34;      // salida AO del YL-69
const int PIN_SUELO_VCC = 25;  // alimenta el YL-69 solo al medir
const int PIN_RELE1 = 26;      // K1: bomba
const int PIN_RELE2 = 27;      // K2: libre
const int PIN_TRIG = 18;       // HC-SR04 Trig
const int PIN_ECHO = 19;       // HC-SR04 Echo (con divisor 5,1k/10k)
const int PIN_BOTON_CONFIG = 0; // boton BOOT: 5 s pulsado = reconfigurar Wi-Fi

// ===================== 4. AJUSTES =====================
const bool RELE_ACTIVO_BAJO = true;          // la mayoria de modulos se activan con LOW
const float FACTOR_DIVISOR = 122.0 / 22.0;   // (100k + 22k) / 22k
const float UMBRAL_HAY_RED_V = 9.0;          // por encima de esto: hay red
const unsigned long INTERVALO_TELEMETRIA_MS = 10000;  // envio al servidor
const unsigned long INTERVALO_LECTURA_MS = 10000;     // lectura local de sensores
const unsigned long RIEGO_MAX_SEG = 120;     // tope de seguridad local
const unsigned long MQTT_CMD_TIMEOUT_MS = 10000;      // connect/publish/subscribe (latencia alta)
const unsigned long WS_ESPERA_MS = 15000;             // esperar a que el WebSocket abra
const unsigned long MQTT_REINTENTO_MS = 4000;         // pausa entre intentos fallidos
const unsigned long MQTT_REINICIO_MS = 5UL * 60UL * 1000UL;  // sin MQTT con Wi-Fi → reinicio
const int RSSI_DEBIL_DBM = -80;                      // por debajo = Wi-Fi débil
// Defectos alineados con device_calibration de la API (hasta recibir /config).
const float TANQUE_VACIO_CM_DEF = 40.0;
const float TANQUE_LLENO_CM_DEF = 5.0;
const int SUELO_RAW_SECO_DEF = 3000;
const int SUELO_RAW_MOJADO_DEF = 1200;

// ===================== OBJETOS Y ESTADO =====================
WebSocketsClient wsClient;
MQTTPubSubClient mqtt;
Adafruit_SSD1306 pantalla(128, 64, &Wire, -1);
Preferences prefs;
bool hayPantalla = false;

String TOPIC_TELEMETRIA, TOPIC_ESTADO, TOPIC_EVENTO, TOPIC_COMANDO, TOPIC_CONFIG;

bool bombaEncendida = false;
unsigned long bombaInicioMs = 0;
unsigned long bombaDuracionMs = 0;

unsigned long ultimaTelemetriaMs = 0;
unsigned long ultimaLecturaMs = 0;
unsigned long ultimaPantallaMs = 0;
unsigned long ultimoChequeoTanqueMs = 0;
unsigned long wifiOkDesdeMs = 0;          // desde cuándo hay Wi-Fi sin MQTT
unsigned long connFaseDesdeMs = 0;
unsigned long mqttReintentoEnMs = 0;
unsigned intentosMqtt = 0;
String motivoFalloMqtt = "";

enum ConnFase : uint8_t {
  CONN_WIFI = 0,
  CONN_WS_INICIO,
  CONN_WS_ESPERA,
  CONN_MQTT,
  CONN_OK,
  CONN_PAUSA,
};
ConnFase connFase = CONN_WIFI;

int sueloRaw = 0;
float distanciaCm = -1;   // -1 = sin lectura valida todavia
float vRed = 0;
float vBat = 0;
String fuente = "red";
String comandoPendiente = "";
String configPendiente = "";

// Calibracion (NVS). Misma formula que la API: interpolacion lineal 0–100.
int sueloRawSeco = SUELO_RAW_SECO_DEF;
int sueloRawMojado = SUELO_RAW_MOJADO_DEF;
float distanciaLlenoCm = TANQUE_LLENO_CM_DEF;
float distanciaVacioCm = TANQUE_VACIO_CM_DEF;

void cargarCalibracionNvs() {
  prefs.begin("hidrobot", true);
  sueloRawSeco = prefs.getInt("suelo_seco", SUELO_RAW_SECO_DEF);
  sueloRawMojado = prefs.getInt("suelo_mojado", SUELO_RAW_MOJADO_DEF);
  distanciaLlenoCm = prefs.getFloat("dist_lleno", TANQUE_LLENO_CM_DEF);
  distanciaVacioCm = prefs.getFloat("dist_vacio", TANQUE_VACIO_CM_DEF);
  prefs.end();
  Serial.printf("Calibracion NVS: seco=%d mojado=%d lleno=%.1f vacio=%.1f\n",
                sueloRawSeco, sueloRawMojado, distanciaLlenoCm, distanciaVacioCm);
}

void guardarCalibracionNvs() {
  prefs.begin("hidrobot", false);
  prefs.putInt("suelo_seco", sueloRawSeco);
  prefs.putInt("suelo_mojado", sueloRawMojado);
  prefs.putFloat("dist_lleno", distanciaLlenoCm);
  prefs.putFloat("dist_vacio", distanciaVacioCm);
  prefs.end();
}

// Misma formula que humidityPctFromRaw en la API.
float humedadPctDesdeRaw(int raw) {
  if (sueloRawSeco == sueloRawMojado) return 0.0f;
  float pct = 100.0f * (float)(sueloRawSeco - raw) / (float)(sueloRawSeco - sueloRawMojado);
  if (pct < 0.0f) return 0.0f;
  if (pct > 100.0f) return 100.0f;
  return pct;
}

// ===================== PANTALLA =====================
void mostrarMensaje(const char* texto) {
  Serial.println(texto);
  if (!hayPantalla) return;
  pantalla.clearDisplay();
  pantalla.setTextSize(1);
  pantalla.setTextColor(SSD1306_WHITE);
  pantalla.setCursor(0, 0);
  pantalla.println("HidroBot");
  pantalla.println();
  pantalla.println(texto);
  pantalla.display();
}

void actualizarPantalla() {
  if (!hayPantalla) return;
  float pct = humedadPctDesdeRaw(sueloRaw);
  pantalla.clearDisplay();
  pantalla.setTextSize(1);
  pantalla.setTextColor(SSD1306_WHITE);
  pantalla.setCursor(0, 0);
  pantalla.println("HidroBot");
  pantalla.printf("Suelo: %.1f%% (%d)\n", pct, sueloRaw);
  if (distanciaCm >= 0) pantalla.printf("Tanque: %.1f cm\n", distanciaCm);
  else pantalla.println("Tanque: --");
  pantalla.printf("%s R:%.1fV B:%.1fV\n", fuente == "red" ? "RED" : "BAT", vRed, vBat);
  if (bombaEncendida) {
    unsigned long restante = (bombaDuracionMs - (millis() - bombaInicioMs)) / 1000;
    pantalla.printf("Bomba: ON (%lus)\n", restante);
  } else {
    pantalla.println("Bomba: OFF");
  }
  if (mqtt.isConnected()) {
    pantalla.printf("WiFi:%s MQTT:ok\n", WiFi.status() == WL_CONNECTED ? "ok" : "--");
  } else {
    pantalla.printf("MQTT x%d RSSI:%d\n", intentosMqtt, WiFi.RSSI());
    if (motivoFalloMqtt.length()) {
      pantalla.println(motivoFalloMqtt.c_str());
    } else {
      pantalla.println("Conectando MQTT...");
    }
  }
  pantalla.display();
}

// ===================== SENSORES =====================
float leerVoltaje(int pin) {
  uint32_t suma = 0;
  for (int i = 0; i < 16; i++) {
    suma += analogReadMilliVolts(pin);
    delay(2);
  }
  return (suma / 16.0) / 1000.0 * FACTOR_DIVISOR;
}

int leerSuelo() {
  digitalWrite(PIN_SUELO_VCC, HIGH);
  delay(100);
  uint32_t suma = 0;
  for (int i = 0; i < 16; i++) {
    suma += analogRead(PIN_SUELO);
    delay(2);
  }
  digitalWrite(PIN_SUELO_VCC, LOW);  // apagado para que se oxide menos
  return suma / 16;
}

float leerDistancia() {
  float medidas[5];
  int n = 0;
  for (int i = 0; i < 5; i++) {
    digitalWrite(PIN_TRIG, LOW);
    delayMicroseconds(3);
    digitalWrite(PIN_TRIG, HIGH);
    delayMicroseconds(10);
    digitalWrite(PIN_TRIG, LOW);
    unsigned long duracion = pulseIn(PIN_ECHO, HIGH, 30000);
    if (duracion > 0) medidas[n++] = duracion * 0.0343 / 2.0;
    delay(30);
  }
  if (n == 0) return -1;
  // mediana, para descartar lecturas raras
  for (int i = 1; i < n; i++) {
    float v = medidas[i];
    int j = i - 1;
    while (j >= 0 && medidas[j] > v) { medidas[j + 1] = medidas[j]; j--; }
    medidas[j + 1] = v;
  }
  return medidas[n / 2];
}

void leerSensores() {
  sueloRaw = leerSuelo();
  float d = leerDistancia();
  if (d >= 0) distanciaCm = d;  // si falla, conserva la ultima valida
  vRed = leerVoltaje(PIN_V_RED);
  vBat = leerVoltaje(PIN_V_BAT);
  fuente = (vRed >= UMBRAL_HAY_RED_V) ? "red" : "bateria";
}

// ===================== MQTT: PUBLICAR =====================
void publicarEvento(const char* tipo, unsigned long segundos) {
  JsonDocument doc;
  doc["tipo"] = tipo;
  doc["segundos"] = segundos;
  String s;
  serializeJson(doc, s);
  if (mqtt.isConnected()) mqtt.publish(TOPIC_EVENTO, s);
  Serial.printf("Evento: %s\n", s.c_str());
}

void enviarTelemetria() {
  JsonDocument doc;
  doc["humedad_raw"] = sueloRaw;
  if (distanciaCm >= 0) doc["distancia_cm"] = roundf(distanciaCm * 10) / 10.0;
  doc["v_red"] = roundf(vRed * 100) / 100.0;
  doc["v_bat"] = roundf(vBat * 100) / 100.0;
  doc["fuente"] = fuente;
  doc["bomba"] = bombaEncendida;
  doc["rssi"] = WiFi.RSSI();
  String s;
  serializeJson(doc, s);
  bool ok = mqtt.isConnected() && mqtt.publish(TOPIC_TELEMETRIA, s);
  Serial.printf("Telemetria %s: %s\n", ok ? "enviada" : "NO enviada", s.c_str());
}

// ===================== BOMBA =====================
void escribirRele(int pin, bool encender) {
  bool nivelAlto = RELE_ACTIVO_BAJO ? !encender : encender;
  digitalWrite(pin, nivelAlto ? HIGH : LOW);
}

void apagarBomba(const char* motivo) {
  if (!bombaEncendida) return;
  escribirRele(PIN_RELE1, false);
  bombaEncendida = false;
  unsigned long seg = (millis() - bombaInicioMs) / 1000;
  Serial.printf("Bomba apagada (%s) tras %lu s\n", motivo, seg);
  publicarEvento("riego_fin", seg);
}

void encenderBomba(unsigned long segundos) {
  if (distanciaCm < 0 || distanciaCm >= distanciaVacioCm) {
    Serial.println("Riego bloqueado: tanque vacio o sin lectura del nivel");
    publicarEvento("bloqueo_tanque_vacio", 0);
    return;
  }
  segundos = constrain(segundos, 1UL, RIEGO_MAX_SEG);
  escribirRele(PIN_RELE1, true);
  bombaEncendida = true;
  bombaInicioMs = millis();
  bombaDuracionMs = segundos * 1000UL;
  Serial.printf("Bomba encendida por %lu s\n", segundos);
  publicarEvento("riego_inicio", segundos);
}

// ===================== MQTT: RECIBIR =====================
// Los mensajes se guardan y se procesan en loop(), fuera del callback.
void alRecibirComando(const String& payload, const size_t size) {
  comandoPendiente = payload;
}

void alRecibirConfig(const String& payload, const size_t size) {
  configPendiente = payload;
}

void procesarConfigPendiente() {
  if (configPendiente.isEmpty()) return;
  String p = configPendiente;
  configPendiente = "";
  Serial.print("Config recibida: ");
  Serial.println(p);

  JsonDocument doc;
  if (deserializeJson(doc, p)) {
    Serial.println("Config con formato invalido");
    return;
  }

  JsonVariant cal = doc["calibracion"];
  if (cal.isNull() || !cal.is<JsonObject>()) {
    Serial.println("Config sin calibracion; se mantienen valores NVS/defecto");
    return;
  }

  if (!cal["humedad_raw_seco"].isNull()) {
    sueloRawSeco = cal["humedad_raw_seco"].as<int>();
  }
  if (!cal["humedad_raw_mojado"].isNull()) {
    sueloRawMojado = cal["humedad_raw_mojado"].as<int>();
  }
  if (!cal["distancia_lleno_cm"].isNull()) {
    distanciaLlenoCm = cal["distancia_lleno_cm"].as<float>();
  }
  if (!cal["distancia_vacio_cm"].isNull()) {
    distanciaVacioCm = cal["distancia_vacio_cm"].as<float>();
  }

  guardarCalibracionNvs();
  Serial.printf("Calibracion guardada: seco=%d mojado=%d lleno=%.1f vacio=%.1f\n",
                sueloRawSeco, sueloRawMojado, distanciaLlenoCm, distanciaVacioCm);
  actualizarPantalla();
}

void procesarComandoPendiente() {
  if (comandoPendiente.isEmpty()) return;
  String p = comandoPendiente;
  comandoPendiente = "";
  Serial.print("Comando recibido: ");
  Serial.println(p);

  JsonDocument doc;
  if (deserializeJson(doc, p)) {
    Serial.println("Comando con formato invalido");
    return;
  }
  const char* accion = doc["accion"] | "";
  if (strcmp(accion, "regar") == 0) {
    unsigned long seg = doc["segundos"] | 30;
    float d = leerDistancia();
    if (d >= 0) distanciaCm = d;
    encenderBomba(seg);
  } else if (strcmp(accion, "detener") == 0) {
    apagarBomba("orden detener");
  }
  enviarTelemetria();
}

// ===================== CONEXION (no bloqueante desde loop) =====================
void registrarFalloMqtt(const String& motivo) {
  intentosMqtt++;
  motivoFalloMqtt = motivo;
  Serial.printf("MQTT fallo #%u: %s (RSSI %d)\n", intentosMqtt, motivo.c_str(), WiFi.RSSI());
  String msg = motivo + "\nIntento " + String(intentosMqtt);
  mostrarMensaje(msg.c_str());
  mqttReintentoEnMs = millis() + MQTT_REINTENTO_MS;
  connFase = CONN_PAUSA;
}

String clasificarFalloMqtt(bool wsListo) {
  int rssi = WiFi.RSSI();
  if (WiFi.status() != WL_CONNECTED) return "Sin WiFi";
  if (!wsListo || rssi <= RSSI_DEBIL_DBM) {
    if (rssi <= RSSI_DEBIL_DBM) return "WiFi debil (RSSI)";  // OLED sin tilde
  }
  lwmqtt_err_t err = mqtt.getLastError();
  if (err == LWMQTT_CONNECTION_DENIED) {
    return "Usuario/clave MQTT incorrectos";
  }
  if (!wsListo || err == LWMQTT_NETWORK_TIMEOUT || err == LWMQTT_NETWORK_FAILED_READ ||
      err == LWMQTT_NETWORK_FAILED_WRITE || err == LWMQTT_MISSING_OR_WRONG_PACKET ||
      err == LWMQTT_NETWORK_FAILED_CONNECT) {
    return "Servidor tarda en responder";
  }
  if (rssi <= RSSI_DEBIL_DBM) return "WiFi debil (RSSI)";
  return "Servidor tarda en responder";
}

void mqttListo() {
  mqtt.subscribe(TOPIC_COMANDO, alRecibirComando);
  mqtt.subscribe(TOPIC_CONFIG, alRecibirConfig);
  mqtt.publish(TOPIC_ESTADO, "online", true, 1);
  motivoFalloMqtt = "";
  wifiOkDesdeMs = 0;
  connFase = CONN_OK;
  Serial.printf("MQTT conectado (intentos previos: %u, RSSI %d)\n", intentosMqtt, WiFi.RSSI());
  mostrarMensaje("Conectado!");
  enviarTelemetria();
  ultimaTelemetriaMs = millis();
}

void prepararBrokerWs() {
  wsClient.disconnect();
  wsClient.beginSSL(MQTT_HOST, MQTT_PORT, MQTT_PATH, "", "mqtt");
  wsClient.setReconnectInterval(2000);
  mqtt.setTimeout(MQTT_CMD_TIMEOUT_MS);
  mqtt.setWill(TOPIC_ESTADO, "offline", true, 1);
  connFaseDesdeMs = millis();
  connFase = CONN_WS_ESPERA;
  Serial.println("Esperando WebSocket MQTT...");
}

// Avanza la conexion en trozos cortos; loop() sigue atendiendo bomba/BOOT/OLED.
void tickConexion() {
  const unsigned long ahora = millis();

  if (WiFi.status() == WL_CONNECTED) {
    WiFi.setSleep(false);
    if (wifiOkDesdeMs == 0 && !mqtt.isConnected()) wifiOkDesdeMs = ahora;
  } else {
    wifiOkDesdeMs = 0;
  }

  // Con Wi-Fi OK pero sin MQTT demasiado tiempo → reinicio (red universitaria inestable).
  if (WiFi.status() == WL_CONNECTED && !mqtt.isConnected() &&
      wifiOkDesdeMs != 0 && (ahora - wifiOkDesdeMs) >= MQTT_REINICIO_MS) {
    Serial.println("Mas de 5 min sin MQTT con WiFi: reiniciando ESP32");
    mostrarMensaje("Sin MQTT 5 min\nReiniciando...");
    delay(500);
    ESP.restart();
  }

  if (mqtt.isConnected()) {
    if (connFase != CONN_OK) connFase = CONN_OK;
    return;
  }

  // Sin MQTT: bomba apagada por seguridad (idempotente).
  if (bombaEncendida) apagarBomba("sin conexion");

  switch (connFase) {
    case CONN_OK:
      connFase = CONN_WIFI;
      // fallthrough
    case CONN_WIFI:
      if (WiFi.status() != WL_CONNECTED) {
        static unsigned long ultimoWifiBeginMs = 0;
        if (ahora - ultimoWifiBeginMs > 5000) {
          ultimoWifiBeginMs = ahora;
          mostrarMensaje("Conectando WiFi...");
          WiFi.begin();  // credenciales del portal
          Serial.println("WiFi.begin() (red guardada)");
        }
        return;
      }
      Serial.printf("WiFi OK IP:%s RSSI:%d\n",
                    WiFi.localIP().toString().c_str(), WiFi.RSSI());
      WiFi.setSleep(false);
      connFase = CONN_WS_INICIO;
      break;

    case CONN_WS_INICIO:
      prepararBrokerWs();
      break;

    case CONN_WS_ESPERA:
      wsClient.loop();
      if (wsClient.isConnected()) {
        Serial.println("WebSocket listo; conectando MQTT...");
        connFase = CONN_MQTT;
        break;
      }
      if (ahora - connFaseDesdeMs >= WS_ESPERA_MS) {
        String motivo = (WiFi.RSSI() <= RSSI_DEBIL_DBM)
                            ? String("WiFi debil (RSSI)")
                            : String("Servidor tarda en responder");
        registrarFalloMqtt(motivo);  // OLED ASCII-safe: sin tilde
      }
      break;

    case CONN_MQTT: {
      // Una sola llamada: puede tardar hasta MQTT_CMD_TIMEOUT_MS (necesario por TLS/túnel).
      bool ok = mqtt.connect(DEVICE_ID, MQTT_USER, MQTT_PASS);
      if (ok) {
        mqttListo();
      } else {
        bool wsOk = wsClient.isConnected();
        registrarFalloMqtt(clasificarFalloMqtt(wsOk));
        Serial.printf("lastError=%d returnCode=%d\n",
                      (int)mqtt.getLastError(), (int)mqtt.getReturnCode());
      }
      break;
    }

    case CONN_PAUSA:
      if ((long)(ahora - mqttReintentoEnMs) >= 0) {
        connFase = CONN_WS_INICIO;
      } else {
        wsClient.loop();  // mantener el stack WS vivo durante la pausa
      }
      break;
  }
}

// ===================== WI-FI DESDE EL CELULAR =====================
String nombreRedConfig() {
  uint64_t mac = ESP.getEfuseMac();
  char nombre[24];
  snprintf(nombre, sizeof(nombre), "HidroBot-%04X", (uint16_t)(mac >> 32));
  return String(nombre);
}

// CSS + marca compactos (sin imágenes externas: el portal no tiene internet).
static const char HIDROBOT_PORTAL_HEAD[] PROGMEM = R"CSS(
<style>
body{margin:0;min-height:100vh;background:linear-gradient(160deg,#3aa0e8 0%,#7ed0ff 36%,#b6ef8a 72%,#3dae55 100%);font-family:system-ui,-apple-system,sans-serif;color:#07182b}
.wrap{margin:18px auto!important;padding:18px 16px;background:linear-gradient(165deg,rgba(255,255,255,.82),rgba(255,255,255,.55));border:1px solid rgba(255,255,255,.85);border-radius:22px;box-shadow:0 16px 36px rgba(16,40,30,.14);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
h1,h3{text-align:center;margin:.2rem 0}
h1{font-size:1.35rem;font-weight:800}
h3{font-size:.95rem;font-weight:600;color:#0a3d6b}
input:not([type=checkbox]),select{border:1px solid #d7e3ee!important;background:#f7fafc!important;border-radius:12px!important;padding:10px 12px!important}
button,input[type=submit]{background:linear-gradient(90deg,#1d4ed8,#22c55e)!important;border:0!important;border-radius:999px!important;font-weight:800!important;box-shadow:0 8px 18px rgba(16,40,30,.16)}
.msg{border-radius:14px!important;background:rgba(255,255,255,.75)!important}
.hb-brand{display:flex;align-items:center;justify-content:center;gap:8px;margin:0 0 10px;font-weight:800;font-size:1.05rem}
.hb-brand svg{width:28px;height:28px}
.hb-note{margin:0 0 12px;padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.55);border:1px solid rgba(255,255,255,.8);font-size:.82rem;line-height:1.35;color:#0a3d6b;text-align:left}
</style>
)CSS";

static const char HIDROBOT_PORTAL_MENU_HTML[] PROGMEM =
"<div class='hb-brand'>"
"<svg viewBox='0 0 64 64' aria-hidden='true'>"
"<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>"
"<stop offset='0%' stop-color='#1d6eab'/><stop offset='100%' stop-color='#22c55e'/>"
"</linearGradient></defs>"
"<path fill='url(#g)' d='M32 6C32 6 14 28 14 40a18 18 0 0 0 36 0C50 28 32 6 32 6z'/>"
"</svg>"
"<span>HidroBot · Configura tu Wi-Fi</span>"
"</div>"
"<div class='hb-note'>"
"<b>Dispositivo:</b> esp32-1<br/>"
"Solo redes <b>2,4 GHz</b> (el ESP32 no usa 5 GHz)."
"</div>";

// Si hay una red guardada, se conecta. Si no (o si se fuerza),
// abre el portal durante 5 minutos para configurarla desde el celular.
void configurarWifi(bool forzarPortal) {
  WiFiManager wm;
  wm.setTitle("HidroBot");
  wm.setConfigPortalTimeout(300);
  wm.setCustomHeadElement(HIDROBOT_PORTAL_HEAD);
  wm.setCustomMenuHTML(HIDROBOT_PORTAL_MENU_HTML);
  // Solo lo necesario: Wi-Fi, información y salir (sin update/erase).
  const char* menu[3] = {"wifi", "info", "exit"};
  wm.setMenu(menu, 3);

  String red = nombreRedConfig();
  wm.setAPCallback([red](WiFiManager*) {
    String msg = "Configura el WiFi\nRed: " + red + "\nClave: " + AP_PASS +
                 "\nWeb: 192.168.4.1";
    mostrarMensaje(msg.c_str());
  });
  bool ok = forzarPortal ? wm.startConfigPortal(red.c_str(), AP_PASS)
                         : wm.autoConnect(red.c_str(), AP_PASS);
  if (ok) {
    Serial.printf("WiFi conectado a %s\n", WiFi.SSID().c_str());
  } else {
    mostrarMensaje("Sin WiFi configurado");
  }
}

// Mantener BOOT 5 segundos: borra el Wi-Fi guardado y reinicia en modo portal
void revisarBotonConfig() {
  static unsigned long pulsadoDesde = 0;
  if (digitalRead(PIN_BOTON_CONFIG) == LOW) {
    if (pulsadoDesde == 0) pulsadoDesde = millis();
    else if (millis() - pulsadoDesde > 5000) {
      apagarBomba("reconfigurar WiFi");
      mostrarMensaje("Borrando WiFi...\nReiniciando");
      WiFiManager wm;
      wm.resetSettings();
      delay(1000);
      ESP.restart();
    }
  } else {
    pulsadoDesde = 0;
  }
}

// ===================== SETUP Y LOOP =====================
void setup() {
  // Reles apagados antes de cualquier otra cosa
  digitalWrite(PIN_RELE1, RELE_ACTIVO_BAJO ? HIGH : LOW);
  digitalWrite(PIN_RELE2, RELE_ACTIVO_BAJO ? HIGH : LOW);
  pinMode(PIN_RELE1, OUTPUT);
  pinMode(PIN_RELE2, OUTPUT);
  escribirRele(PIN_RELE1, false);
  escribirRele(PIN_RELE2, false);

  Serial.begin(115200);
  delay(200);

  pinMode(PIN_SUELO_VCC, OUTPUT);
  digitalWrite(PIN_SUELO_VCC, LOW);
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  analogReadResolution(12);

  Wire.begin(21, 22);
  hayPantalla = pantalla.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  if (!hayPantalla) Serial.println("Pantalla OLED no encontrada (prueba la direccion 0x3D)");

  cargarCalibracionNvs();

  String base = String("hidrobot/") + DEVICE_ID + "/";
  TOPIC_TELEMETRIA = base + "telemetria";
  TOPIC_ESTADO = base + "estado";
  TOPIC_EVENTO = base + "evento";
  TOPIC_COMANDO = base + "comando";
  TOPIC_CONFIG = base + "config";

  mqtt.begin(wsClient);
  mqtt.setTimeout(MQTT_CMD_TIMEOUT_MS);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.setSleep(false);  // menos latencia en redes débiles / túnel TLS
  pinMode(PIN_BOTON_CONFIG, INPUT_PULLUP);

  leerSensores();
  configurarWifi(false);
  WiFi.setSleep(false);
  connFase = CONN_WIFI;
  wifiOkDesdeMs = (WiFi.status() == WL_CONNECTED) ? millis() : 0;
}

void loop() {
  unsigned long ahora = millis();
  revisarBotonConfig();

  // Conexion Wi-Fi / WebSocket / MQTT en pasos (no bloquea BOOT ni la bomba).
  tickConexion();

  if (mqtt.isConnected()) {
    mqtt.update();
  } else {
    wsClient.loop();
  }
  procesarComandoPendiente();
  procesarConfigPendiente();

  // Seguridad local de la bomba
  if (bombaEncendida) {
    if (millis() - bombaInicioMs >= bombaDuracionMs) {
      apagarBomba("tiempo cumplido");
      enviarTelemetria();
    } else if (millis() - ultimoChequeoTanqueMs > 2000) {
      ultimoChequeoTanqueMs = millis();
      float d = leerDistancia();
      if (d >= 0) distanciaCm = d;
      if (distanciaCm >= distanciaVacioCm) {
        apagarBomba("tanque vacio");
        publicarEvento("bloqueo_tanque_vacio", 0);
        enviarTelemetria();
      }
    }
  }

  // Lectura local y envio periodico
  if (millis() - ultimaLecturaMs >= INTERVALO_LECTURA_MS) {
    ultimaLecturaMs = millis();
    leerSensores();
  }
  if (millis() - ultimaTelemetriaMs >= INTERVALO_TELEMETRIA_MS) {
    ultimaTelemetriaMs = millis();
    enviarTelemetria();
  }

  // Pantalla
  if (millis() - ultimaPantallaMs >= 1000) {
    ultimaPantallaMs = millis();
    actualizarPantalla();
  }
}
