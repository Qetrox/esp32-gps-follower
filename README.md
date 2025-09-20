# ESP32 GPS Follower

A minimal end‑to‑end GPS tracking setup consisting of:
- An ESP32 firmware sketch (`ESP32/client.c`) that reads NMEA data via a GPS module (TinyGPSPlus) and periodically uploads position, speed, and altitude to a backend.
- A lightweight Node.js/Express server (`Server/`) that receives GPS data, serves a live tracking web UI, exposes configuration and POI (points of interest) endpoints, and manages a remotely updateable WiFi credential list for the embedded device.

## Features
- Live GPS position ingest over simple HTTP GET endpoint with API key protection
- Persisted latest fix (lat, lng, speed, altitude, timestamp) on the server
- Web UI (Leaflet based) displaying current tracker position and POIs
- Configurable UI and tracker display via `config.json` (fetched at runtime)
- Points of Interest management through static JSON (`poi.json`)
- Remote WiFi network list distribution to the ESP32 (`/wifi` endpoint)
- Basic admin panel page (`/admin`) for WiFi and configuration management (served statically)
- Simple, dependency‑light stack (Express + vanilla JS frontend)

## Tech Stack
**Hardware / Firmware:** ESP32, GPS module (UART @ 9600 baud), TinyGPSPlus, Arduino core for ESP32, SPIFFS for persistence.

**Backend:** Node.js (Express 5), body-parser, dotenv, filesystem JSON storage (no database).

**Frontend:** Static HTML/CSS/JS + Leaflet (implied; tile layer from OpenStreetMap). Note: Leaflet scripts/styles must exist in the public HTML (not shown here if pulled from CDN).

## Repository Structure
```
ESP32/              # ESP32 firmware source (client.c)
Server/
  index.js          # Express server
  package.json      # Node dependencies
  config.json       # UI + API behavior configuration
  wifi.json         # Stored WiFi credentials list (server side)
  poi.json          # Points of Interest data
  latest-gps.json   # Persisted last GPS fix
  public/           # Static frontend assets (HTML, JS, CSS)
LICENSE
README.md
```

## Data Flow Overview
1. ESP32 parses GPS sentences using TinyGPSPlus.
2. Every loop (2s delay) while a recent valid fix (<2s old) is available and WiFi is connected, it performs an HTTP GET:
   `GET /receivedata?key=<API_KEY>&lat=..&lng=..&speed=..&alt=..`
3. Server validates `key` against `process.env.API_KEY`, logs data, stores it in memory and writes `latest-gps.json`.
4. Web UI polls `/api/latest-gps` (interval defined in `config.json` → `api.updateInterval`) to update the map marker and info panel.
5. UI also fetches `/api/config` and `/api/poi` for dynamic display and POIs.
6. ESP32 can fetch `/wifi?key=<API_KEY>` to update its stored dynamic WiFi networks (persisted to SPIFFS).

## Configuration Files
- `config.json`: Controls UI texts, tracker popup fields, map defaults, and API polling interval.
- `poi.json`: Array of POIs with fields: `id`, `title`, `description`, `latitude`, `longitude`, `category`, `icon`, `color`.
- `wifi.json`: Array of WiFi credential objects `{ ssid, password }` for distribution to the ESP32.
- `latest-gps.json`: Auto-written by the server; last known GPS fix with `timestamp`.

## Security Notes
- API key is required for data ingestion (`/receivedata`) and WiFi management endpoints (`/wifi*`, `POST /api/config`).
- Key is passed as a query string parameter

## Environment Variables
Create `Server/.env`:
```
API_KEY=change-me
```
(You may add others later as needed.)

## Hardware Requirements
- ESP32 development board (with WiFi)
- GPS module (e.g., NEO-6M) connected to ESP32 UART1 (pins configured as RX=16, TX=17 in code)
- Power supply adequate for both modules

## ESP32 Firmware Setup
1. Install Arduino IDE (or PlatformIO) with ESP32 core.
2. Install libraries: TinyGPSPlus, ArduinoJson, (HTTPClient is built-in with ESP32 Arduino core).
3. Adjust constants in `client.c`:
   - `serverBase` -> base URL to your server `/receivedata`
   - `wifiApi` -> URL to `/wifi?key=...`
   - Replace placeholder hostnames (`hostname`, `keyvalue`).
4. Optionally change fallback WiFi credentials (`defaultSSID`, `defaultPASS`).
5. Upload to the ESP32. Monitor serial at 115200 baud.
6. Ensure SPIFFS is enabled (code mounts with `SPIFFS.begin(true)`).

## Server Setup
From the `Server/` directory:
```powershell
# Install dependencies (pnpm, npm, or yarn)
pnpm install  # or: npm install

# Create environment file
New-Item -Path .env -ItemType File -Value "API_KEY=change-me" -Force

# Start server
pnpm start    # or: npm start
```
The server defaults to port 4000. Access: `http://localhost:4000/`.

## Frontend
- `GET /` serves `public/index.html` (live tracker)
- `GET /admin` serves `public/admin.html`
- Static assets under `/public` are auto-served by Express static middleware.

## API Endpoints
| Method | Path | Auth (API key) | Description |
|--------|------|----------------|-------------|
| GET | `/receivedata` | Query `key` | Ingest GPS data (`lat`,`lng`,`speed`,`alt`) |
| GET | `/api/latest-gps` | None | Latest stored GPS fix |
| GET | `/api/poi` | None | List POIs |
| GET | `/api/config` | None | UI + polling configuration |
| POST | `/api/config` | Query `key` | Overwrite config (JSON body) |
| GET | `/wifi` | Query `key` | Get WiFi credentials list |
| PUT | `/wifi` | Query `key` | Add/update WiFi network (JSON: `ssid`,`password`) |
| DELETE | `/wifi/:ssid` | Query `key` | Remove WiFi network |

Example ingestion request:
```
GET http://localhost:4000/receivedata?key=API_KEY&lat=52.1&lng=4.9&speed=3.2&alt=12.5
```

## Modifying POIs
Edit `Server/poi.json`. Each POI object supports:
```
{
  "id": 1,
  "title": "Name",
  "description": "Details",
  "latitude": <number>,
  "longitude": <number>,
  "category": "string",
  "icon": "unicode or short text",
  "color": "#RRGGBB"
}
```
Reload the page to reflect changes.

## Troubleshooting
- No data on map: Verify ESP32 request logs on server console and that `API_KEY` matches.
- 403 errors: Mismatched or missing `key` query parameter.
- ESP32 cannot connect: Check WiFi credentials, confirm server reachable (use IP instead of hostname).
- Timestamps missing or stale: Ensure server time is correct and ESP32 updates at expected interval (2s delay in loop).

## Deployment Notes
- For remote access, run behind Nginx or Caddy providing HTTPS.
- Use a process manager (PM2, systemd) to keep server alive.

## License
MIT License (see `LICENSE`).

## Disclaimer
This project is a minimal prototype for educational and hobby tracking use and does not include production-grade security or resilience features.
