#include <TinyGPSPlus.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <FS.h>
#include <SPIFFS.h>

HardwareSerial GPSserial(1);
TinyGPSPlus gps;

const char *serverBase = "http://hostname/receivedata";
const char *wifiApi = "http://hostname/wifi?key=keyvalue";

// Fallback WiFi (always available)
const char *defaultSSID = "TP-Link_2.4GHz";
const char *defaultPASS = "password123";

struct WifiNetwork {
  String ssid;
  String password;
};
std::vector<WifiNetwork> dynamicNetworks;

unsigned long lastReconnectAttempt = 0;
bool inBackoff = false;

const char *wifiFile = "/wifi.json";

// Save WiFi list to SPIFFS
void saveWifiList() {
  DynamicJsonDocument doc(1024);
  JsonArray arr = doc.to<JsonArray>();

  for (auto &net : dynamicNetworks) {
    JsonObject obj = arr.createNestedObject();
    obj["ssid"] = net.ssid;
    obj["password"] = net.password;
  }

  File f = SPIFFS.open(wifiFile, "w");
  if (!f) {
    Serial.println("Failed to open WiFi file for writing");
    return;
  }
  serializeJson(doc, f);
  f.close();
  Serial.println("Saved WiFi list to SPIFFS");
}

// Load WiFi list from SPIFFS
void loadWifiList() {
  if (!SPIFFS.exists(wifiFile)) {
    Serial.println("No saved WiFi list");
    return;
  }
  File f = SPIFFS.open(wifiFile, "r");
  if (!f) {
    Serial.println("Failed to open WiFi file");
    return;
  }

  DynamicJsonDocument doc(1024);
  DeserializationError error = deserializeJson(doc, f);
  f.close();

  if (!error && doc.is<JsonArray>()) {
    dynamicNetworks.clear();
    for (JsonObject obj : doc.as<JsonArray>()) {
      WifiNetwork net;
      net.ssid = obj["ssid"].as<String>();
      net.password = obj["password"].as<String>();
      dynamicNetworks.push_back(net);
    }
    Serial.printf("Loaded %d WiFi networks from SPIFFS\n", dynamicNetworks.size());
  } else {
    Serial.println("Failed to parse WiFi JSON");
  }
}

// Fetch WiFi list from API
void fetchWifiList() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(wifiApi);
  int httpCode = http.GET();

  if (httpCode == 200) {
    String payload = http.getString();

    DynamicJsonDocument doc(1024);
    DeserializationError error = deserializeJson(doc, payload);
    if (!error && doc.is<JsonArray>()) {
      dynamicNetworks.clear();
      for (JsonObject obj : doc.as<JsonArray>()) {
        WifiNetwork net;
        net.ssid = obj["ssid"].as<String>();
        net.password = obj["password"].as<String>();
        dynamicNetworks.push_back(net);
      }
      Serial.printf("Fetched %d networks from API\n", dynamicNetworks.size());
      saveWifiList();
    }
  } else {
    Serial.printf("Failed to fetch WiFi list: %d\n", httpCode);
  }
  http.end();
}

// Try to connect to one WiFi
bool tryConnect(const char* ssid, const char* pass) {
  Serial.printf("Trying WiFi: %s\n", ssid);
  WiFi.disconnect(true);
  WiFi.begin(ssid, pass);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 10000) {
    Serial.print(".");
    delay(500);
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\nConnected to %s\n", ssid);
    return true;
  }
  return false;
}

// Connect logic
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  for (auto &net : dynamicNetworks) {
    if (tryConnect(net.ssid.c_str(), net.password.c_str())) {
      inBackoff = false;
      return;
    }
  }

  if (tryConnect(defaultSSID, defaultPASS)) {
    inBackoff = false;
    fetchWifiList();
    return;
  }

  Serial.println("No WiFi connection, entering backoff...");
  inBackoff = true;
  lastReconnectAttempt = millis();
}

void setup() {
  Serial.begin(115200);
  GPSserial.begin(9600, SERIAL_8N1, 16, 17);

  if (!SPIFFS.begin(true)) {   // true = format if corrupted
    Serial.println("SPIFFS Mount Failed");
  }

  WiFi.mode(WIFI_STA);
  loadWifiList();
  connectWiFi();
  fetchWifiList();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    if (!inBackoff) {
      connectWiFi();
    } else if (millis() - lastReconnectAttempt > 30000) {
      connectWiFi();
    }
  }

  while (GPSserial.available() > 0) {
    gps.encode(GPSserial.read());
  }

  if (gps.location.isValid() && gps.location.age() < 2000) {
    double lat = gps.location.lat();
    double lng = gps.location.lng();
    double speed = gps.speed.kmph();
    double alt = gps.altitude.meters();

    Serial.printf("Lat: %.6f, Lng: %.6f, Speed: %.2f km/h, Alt: %.2f m\n",
                  lat, lng, speed, alt);

    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      String url = String(serverBase) +
                   "?key=keyvalue" +
                   "&lat=" + String(lat, 6) +
                   "&lng=" + String(lng, 6) +
                   "&speed=" + String(speed, 2) +
                   "&alt=" + String(alt, 2);

      http.begin(url);
      int httpCode = http.GET();
      if (httpCode > 0) {
        Serial.printf("Server response: %d\n", httpCode);
      } else {
        Serial.printf("HTTP error: %s\n", http.errorToString(httpCode).c_str());
      }
      http.end();
    }
  }

  delay(2000);
}