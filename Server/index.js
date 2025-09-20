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

let latestGPSData = null;

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

function saveLatestGPS(data) {
    latestGPSData = {
        ...data,
        timestamp: new Date().toISOString()
    };
    // Optionally save to file for persistence
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
            latestGPSData = JSON.parse(fs.readFileSync(GPS_DATA_FILE, "utf8"));
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
    const { lat, lng, speed, alt } = req.query;

    console.log("GPS data received:");
    console.log("Latitude:", lat);
    console.log("Longitude:", lng);
    console.log("Speed:", speed, "km/h");
    console.log("Altitude:", alt, "m");
    console.log("---------------------");

    const gpsData = {
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        speed: parseFloat(speed),
        alt: parseFloat(alt)
    };
    saveLatestGPS(gpsData);

    res.send("Data received!");
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
