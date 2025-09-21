const express = require("express");
const fs = require("fs");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const path = require("path");

dotenv.config();
const app = express();
const PORT = 4000;

app.use(bodyParser.json());

app.use(express.static(path.join(__dirname, 'public')));

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const WIFI_FILE = "./wifi.json";
const GPS_DATA_FILE = "./latest-gps.json";
const POI_FILE = "./poi.json";
const CONFIG_FILE = "./config.json";

let latestGPSData = null; // Will store extended structure

/*
 Extended latestGPSData structure:
 {
     lat: Number,
     lng: Number,
     speed: Number,
     alt: Number,
     fix: Boolean,           // whether the latest packet had a GPS fix
     sats: Number|null,      // satellites from latest packet if no fix (or with fix if provided)
     hdop: Number|null,      // hdop from latest packet if provided
     lastPacketTimestamp: ISOString, // when any packet (fix or no-fix) was received
     lastFixTimestamp: ISOString|null, // when last valid fix was received
     timestamp: ISOString    // kept for backwards compat (same as lastFixTimestamp when fix=true else still previous fix time)
 }
*/

function loadPOIData() {
    try {
        if (fs.existsSync(POI_FILE)) {
            return JSON.parse(fs.readFileSync(POI_FILE, "utf8"));
        }
    } catch (error) {
        console.error('Error loading POI data:', error);
    }
    return [];
}

function saveLatestGPS(packet) {
    const now = new Date().toISOString();

    // Initialize object if first time
    if (!latestGPSData) {
        latestGPSData = {
            lat: null,
            lng: null,
            speed: null,
            alt: null,
            fix: false,
            sats: null,
            hdop: null,
            lastPacketTimestamp: now,
            lastFixTimestamp: null,
            timestamp: null
        };
    }

    const { fix, lat, lng, speed, alt, sats, hdop } = packet;

    latestGPSData.lastPacketTimestamp = now;
    latestGPSData.fix = !!fix;
    if (typeof sats !== 'undefined') latestGPSData.sats = sats;
    if (typeof hdop !== 'undefined') latestGPSData.hdop = hdop;

    if (fix) {
        // Update positional data only on a valid fix
        latestGPSData.lat = lat;
        latestGPSData.lng = lng;
        latestGPSData.speed = speed;
        latestGPSData.alt = alt;
        latestGPSData.lastFixTimestamp = now;
        latestGPSData.timestamp = now; // maintain previous field for compatibility
    }

    try {
        fs.writeFileSync(GPS_DATA_FILE, JSON.stringify(latestGPSData, null, 2));
    } catch (error) {
        console.error('Error saving GPS data:', error);
    }
}

function loadLatestGPS() {
    if (latestGPSData) return latestGPSData;
    try {
        if (fs.existsSync(GPS_DATA_FILE)) {
            const raw = JSON.parse(fs.readFileSync(GPS_DATA_FILE, "utf8"));
            // Detect old format (no fix field)
            if (raw && typeof raw.fix === 'undefined') {
                latestGPSData = {
                    lat: raw.lat ?? null,
                    lng: raw.lng ?? null,
                    speed: raw.speed ?? null,
                    alt: raw.alt ?? null,
                    fix: true, // assume it was a fix snapshot
                    sats: null,
                    hdop: null,
                    lastPacketTimestamp: raw.timestamp || new Date().toISOString(),
                    lastFixTimestamp: raw.timestamp || null,
                    timestamp: raw.timestamp || null
                };
            } else {
                latestGPSData = raw;
            }
            return latestGPSData;
        }
    } catch (error) {
        console.error('Error loading GPS data:', error);
    }
    return null;
}

function loadWifiList() {
    if (!fs.existsSync(WIFI_FILE)) return [];
    return JSON.parse(fs.readFileSync(WIFI_FILE, "utf8"));
}

function saveWifiList(list) {
    fs.writeFileSync(WIFI_FILE, JSON.stringify(list, null, 2));
}

function checkKey(req, res, next) {
    if (req.query.key !== process.env.API_KEY) {
        return res.status(403).send("Invalid key");
    }
    next();
}

app.get("/receivedata", checkKey, (req, res) => {
    const { lat, lng, speed, alt, fix, sats, hdop } = req.query;

    const isFix = fix === 'true' || fix === '1';

    if (isFix) {
        console.log("GPS FIX received:");
        console.log("Latitude:", lat);
        console.log("Longitude:", lng);
        console.log("Speed:", speed, "km/h");
        console.log("Altitude:", alt, "m");
    } else {
        console.log("NO FIX packet received:");
        console.log("Satellites:", sats);
        console.log("HDOP:", hdop);
    }
    console.log("Fix flag:", isFix);
    console.log("---------------------");

    const packet = {
        fix: isFix,
        lat: isFix ? parseFloat(lat) : latestGPSData?.lat ?? null,
        lng: isFix ? parseFloat(lng) : latestGPSData?.lng ?? null,
        speed: isFix ? parseFloat(speed) : latestGPSData?.speed ?? null,
        alt: isFix ? parseFloat(alt) : latestGPSData?.alt ?? null,
        sats: typeof sats !== 'undefined' ? (sats === '' ? null : parseInt(sats)) : undefined,
        hdop: typeof hdop !== 'undefined' ? (hdop === '' ? null : parseFloat(hdop)) : undefined
    };

    saveLatestGPS(packet);

    res.json({ status: 'ok', fix: isFix });
});

app.get("/api/latest-gps", (req, res) => {
    const data = loadLatestGPS();
    if (data) {
        res.json(data);
    } else {
        res.status(404).json({ error: "No GPS data available" });
    }
});

app.get("/api/poi", (req, res) => {
    const pois = loadPOIData();
    res.json(pois);
});

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
        }
    } catch (error) {
        console.error('Error loading config:', error);
    }
    return null;
}

function saveConfig(config) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving config:', error);
        return false;
    }
}

app.get("/api/config", (req, res) => {
    const config = loadConfig();
    if (config) {
        res.json(config);
    } else {
        res.status(404).json({ error: "No configuration found" });
    }
});

app.post("/api/config", checkKey, (req, res) => {
    try {
        const success = saveConfig(req.body);
        if (success) {
            res.json({ message: "Configuration updated successfully" });
        } else {
            res.status(500).json({ error: "Failed to save configuration" });
        }
    } catch (error) {
        res.status(400).json({ error: "Invalid configuration data" });
    }
});

app.get("/wifi", checkKey, (req, res) => {
    res.json(loadWifiList());
});

app.put("/wifi", checkKey, (req, res) => {
    const { ssid, password } = req.body;
    if (!ssid || !password) {
        return res.status(400).send("Missing ssid or password");
    }

    let list = loadWifiList();
    const idx = list.findIndex(n => n.ssid === ssid);
    if (idx >= 0) {
        list[idx].password = password;
    } else {
        list.push({ ssid, password });
    }
    saveWifiList(list);
    res.json(list);
});

app.delete("/wifi/:ssid", checkKey, (req, res) => {
    let list = loadWifiList();
    list = list.filter(n => n.ssid !== req.params.ssid);
    saveWifiList(list);
    res.json(list);
});

app.listen(PORT, () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
});