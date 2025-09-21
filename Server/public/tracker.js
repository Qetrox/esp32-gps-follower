class GPSTracker {
    constructor() {
        this.map = null;
        this.currentMarker = null;
        this.lastPosition = null;
        this.isConnected = false; // whether we have any recent packet
        this.hasFix = false; // whether latest packet had a fix
        this.lastFixTime = null; // Date of last valid fix
        this.lastPacketTime = null; // Date of last packet (fix or not)
        this.pollInterval = null;
        this.poiMarkers = [];
        this.trackerPopupWasOpen = false;
        this.config = null;

        this.init();
    }

    async init() {
        await this.loadConfig();
        this.applyUIConfig();
        this.initializeMap();
        this.setupEventListeners();
        this.loadPOIs();
        this.startTracking();
        this.updateUI();
    }

    async loadConfig() {
        try {
            const response = await fetch('/api/config');
            if (response.ok) {
                this.config = await response.json();
            } else {
                console.warn('Using default configuration');
                this.config = this.getDefaultConfig();
            }
        } catch (error) {
            console.error('Error loading configuration:', error);
            this.config = this.getDefaultConfig();
        }
    }

    getDefaultConfig() {
        return {
            ui: {
                title: { tracker: "GPS Tracker" },
                dataPanel: {
                    labels: {
                        latitude: "Latitude:",
                        longitude: "Longitude:",
                        speed: "Speed:",
                        altitude: "Altitude:"
                    },
                    units: { speed: "km/h", altitude: "m" },
                    centerButtonText: "Center on Tracker"
                }
            },
            tracker: {
                useCustomIcon: false,
                customIconUrl: "",
                customIconSize: [32, 32],
                defaultIconColor: "#3388ff",
                description: "Live GPS position",
                popupData: {
                    showLatitude: true,
                    showLongitude: true,
                    showSpeed: true,
                    showAltitude: true,
                    showTimestamp: true,
                    showDescription: true
                }
            },
            map: {
                defaultZoom: 15,
                maxZoom: 19,
                tileLayer: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
                attribution: "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
            },
            api: { updateInterval: 2000 }
        };
    }

    applyUIConfig() {
        if (this.config.ui?.title?.webpage) {
            document.title = this.config.ui.title.webpage;
        }

        if (this.config.ui?.title?.navbar) {
            const navbarTitle = document.querySelector('.tracker-header h1');
            if (navbarTitle) navbarTitle.textContent = this.config.ui.title.navbar;
        }

        if (this.config.ui?.navigation) {
            const trackerLink = document.querySelector('a[href="/"]');
            const adminLink = document.querySelector('a[href="/admin"]');
            if (trackerLink && this.config.ui.navigation.trackerLink) {
                trackerLink.textContent = this.config.ui.navigation.trackerLink;
            }
            if (adminLink && this.config.ui.navigation.adminLink) {
                adminLink.textContent = this.config.ui.navigation.adminLink;
            }
        }

        if (this.config.ui?.dataPanel?.show === false) {
            const gpsPanel = document.getElementById('gpsPanel');
            if (gpsPanel) gpsPanel.style.display = 'none';
        }

        if (this.config.ui?.dataPanel?.labels) {
            const labels = this.config.ui.dataPanel.labels;
            Object.keys(labels).forEach(key => {
                const labelElement = document.querySelector(`#${key}`);
                if (labelElement) {
                    const parentDiv = labelElement.closest('.data-item');
                    if (parentDiv) {
                        const labelSpan = parentDiv.querySelector('.data-label');
                        if (labelSpan) labelSpan.textContent = labels[key];
                    }
                }
            });
        }

        if (this.config.ui?.dataPanel?.centerButtonText) {
            const centerButton = document.getElementById('centerButton');
            if (centerButton) centerButton.textContent = this.config.ui.dataPanel.centerButtonText;
        }

        if (this.config.ui?.statusBar) {
            const connectionLabel = document.querySelector('.status-item:first-child .status-label');
            const updateLabel = document.querySelector('.status-item:last-child .status-label');

            if (connectionLabel && this.config.ui.statusBar.connectionLabel) {
                connectionLabel.textContent = this.config.ui.statusBar.connectionLabel;
            }
            if (updateLabel && this.config.ui.statusBar.updateLabel) {
                updateLabel.textContent = this.config.ui.statusBar.updateLabel;
            }
        }
    }

    initializeMap() {
        // Initialize the map centered on a default location
        const zoom = this.config.map?.defaultZoom || 13;
        this.map = L.map('map').setView([52.3676, 4.9041], zoom);

        // Add tile layer from config
        const tileLayer = this.config.map?.tileLayer || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        const attribution = this.config.map?.attribution || '© OpenStreetMap contributors';
        const maxZoom = this.config.map?.maxZoom || 19;

        L.tileLayer(tileLayer, {
            attribution: attribution,
            maxZoom: maxZoom
        }).addTo(this.map);

        // Add a scale control
        L.control.scale().addTo(this.map);
    }

    setupEventListeners() {
        // Center on tracker button
        document.getElementById('centerButton').addEventListener('click', () => {
            this.centerOnTracker();
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            if (this.map) {
                this.map.invalidateSize();
            }
        });
    }

    async fetchLatestGPSData() {
        try {
            const response = await fetch('/api/latest-gps');
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            // silent
        }
    }

    async updateGPSData() {
        const data = await this.fetchLatestGPSData();
        if (data) {
            this.isConnected = true;
            // Parse timestamps
            this.hasFix = !!data.fix;
            if (data.lastPacketTimestamp) this.lastPacketTime = new Date(data.lastPacketTimestamp);
            if (data.lastFixTimestamp) this.lastFixTime = new Date(data.lastFixTimestamp);

            if (this.hasFix) {
                this.updatePosition(data);
                this.updateDataDisplay(data);
            } else {
                // No fix: keep previous position display, maybe show sats/hdop later
            }
        } else {
            this.isConnected = false;
        }
        this.updateConnectionStatus();
    }

    updatePosition(data) {
        const { lat, lng } = data;
        const newPosition = [lat, lng];

        // Check if current tracker marker has an open popup
        let popupWasOpen = false;
        if (this.currentMarker && this.currentMarker.isPopupOpen()) {
            popupWasOpen = true;
        }

        // Update current marker
        if (this.currentMarker) {
            this.map.removeLayer(this.currentMarker);
        }

        // Create custom marker based on configuration
        let customIcon;
        if (this.config.tracker?.useCustomIcon && this.config.tracker?.customIconUrl) {
            // Use custom image icon
            customIcon = L.icon({
                iconUrl: this.config.tracker.customIconUrl,
                iconSize: this.config.tracker.customIconSize || [32, 32],
                iconAnchor: [(this.config.tracker.customIconSize[0] || 32) / 2, (this.config.tracker.customIconSize[1] || 32) / 2]
            });
        } else {
            // Use default div icon
            customIcon = L.divIcon({
                className: 'tracker-marker',
                html: '<div class="tracker-icon"></div>',
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            });
        }

        this.currentMarker = L.marker(newPosition, { icon: customIcon })
            .addTo(this.map)
            .bindPopup(this.createPopupContent(data));

        // Restore popup state: open if it was open before, or auto-open on first position
        if (popupWasOpen || (!this.lastPosition)) {
            this.currentMarker.openPopup();
        }

        // Auto-center on first position or if no previous position
        if (!this.lastPosition) {
            this.map.setView(newPosition, 16);
        }

        this.lastPosition = newPosition;
    }

    createPopupContent(data) {
        const displaySpeed = data.speed < 2 ? 0 : data.speed.toFixed(2);
        const config = this.config.tracker?.popupData || {};
        const trackerTitle = this.config.ui?.title?.tracker || "GPS Tracker";
        const description = this.config.tracker?.description || "";

        let content = `<div class="tracker-popup">`;
        content += `<div class="popup-title">${trackerTitle}</div>`;
        content += `<div class="popup-data">`;

        if (config.showDescription && description) {
            content += `<div style="margin-bottom: 8px; font-style: italic;">${description}</div>`;
        }

        if (config.showLatitude || config.showLongitude) {
            content += `<strong>Coordinates:</strong><br>`;
            if (config.showLatitude && config.showLongitude) {
                content += `${data.lat.toFixed(6)}, ${data.lng.toFixed(6)}<br><br>`;
            } else if (config.showLatitude) {
                content += `Lat: ${data.lat.toFixed(6)}<br><br>`;
            } else if (config.showLongitude) {
                content += `Lng: ${data.lng.toFixed(6)}<br><br>`;
            }
        }

        if (config.showSpeed) {
            const speedUnit = this.config.ui?.dataPanel?.units?.speed || "km/h";
            content += `<strong>Speed:</strong> ${displaySpeed} ${speedUnit}<br>`;
        }

        if (config.showAltitude) {
            const altUnit = this.config.ui?.dataPanel?.units?.altitude || "m";
            content += `<strong>Altitude:</strong> ${data.alt.toFixed(1)} ${altUnit}<br>`;
        }

        if (config.showTimestamp) {
            const ts = this.lastFixTime ? this.lastFixTime.toLocaleTimeString() : '—';
            content += `<strong>Last Fix:</strong> ${ts}`;
        }

        content += `</div></div>`;
        return content;
    }

    updateDataDisplay(data) {
        const displaySpeed = data.speed < 2 ? 0 : data.speed.toFixed(2);
        const speedUnit = this.config.ui?.dataPanel?.units?.speed || "km/h";
        const altUnit = this.config.ui?.dataPanel?.units?.altitude || "m";

        document.getElementById('latitude').textContent = data.lat.toFixed(6);
        document.getElementById('longitude').textContent = data.lng.toFixed(6);
        document.getElementById('speed').textContent = `${displaySpeed} ${speedUnit}`;
        document.getElementById('altitude').textContent = `${data.alt.toFixed(1)} ${altUnit}`;
    }

    updateConnectionStatus() {
        const statusElement = document.getElementById('connectionStatus');
        const lastUpdateElement = document.getElementById('lastUpdate');

        // Determine staleness (no packet for > 60s)
        const now = Date.now();
        const stale = this.lastPacketTime ? (now - this.lastPacketTime.getTime() > 60000) : false;

        if (!this.isConnected || stale) {
            statusElement.textContent = 'Offline';
            statusElement.className = 'status-value offline';
            if (!this.lastPacketTime) {
                lastUpdateElement.textContent = 'Never';
            } else {
                lastUpdateElement.textContent = this.lastPacketTime.toLocaleTimeString();
            }
            return;
        }

        if (this.isConnected && !this.hasFix) {
            statusElement.textContent = 'No GPS Signal';
            statusElement.className = 'status-value no-gps';
        } else if (this.isConnected && this.hasFix) {
            statusElement.textContent = 'Online';
            statusElement.className = 'status-value online';
        }

        if (this.lastPacketTime) {
            lastUpdateElement.textContent = this.lastPacketTime.toLocaleTimeString();
        } else {
            lastUpdateElement.textContent = '—';
        }
    }

    updateUI() {
        // No UI updates needed for simplified tracker
    }

    centerOnTracker() {
        if (this.lastPosition) {
            this.map.setView(this.lastPosition, 16);
            this.showNotification('Centered on tracker location', 'info');
        } else {
            this.showNotification('No tracker position available', 'error');
        }
    }

    startTracking() {
        // Initial update
        this.updateGPSData();

        // Set up polling interval using configured interval
        const updateInterval = this.config.api?.updateInterval || 2000;
        this.pollInterval = setInterval(() => {
            this.updateGPSData();
        }, updateInterval);
    }

    stopTracking() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    showNotification(message, type = 'info') {
        // Create notification element if it doesn't exist
        let notification = document.getElementById('trackerNotification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'trackerNotification';
            notification.className = 'tracker-notification';
            document.body.appendChild(notification);
        }

        notification.textContent = message;
        notification.className = `tracker-notification ${type}`;
        notification.classList.add('show');

        // Auto-hide after 3 seconds
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }

    async loadPOIs() {
        try {
            const response = await fetch('/api/poi');
            if (response.ok) {
                const pois = await response.json();
                this.displayPOIs(pois);
                this.showNotification(`Loaded ${pois.length} points of interest`, 'success');
            }
        } catch (error) {
            console.error('Error loading POIs:', error);
            this.showNotification('Failed to load points of interest', 'error');
        }
    }

    displayPOIs(pois) {
        // Clear existing POI markers
        this.clearPOIMarkers();

        pois.forEach(poi => {
            const poiIcon = L.divIcon({
                className: 'poi-marker',
                html: `<div class="poi-icon" style="background-color: ${poi.color}">${poi.icon}</div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 16],
                popupAnchor: [0, -16]
            });

            const marker = L.marker([poi.latitude, poi.longitude], { icon: poiIcon })
                .addTo(this.map)
                .bindPopup(this.createPOIPopupContent(poi));

            // Store marker reference for later cleanup
            this.poiMarkers.push(marker);
        });
    }

    createPOIPopupContent(poi) {
        return `
            <div class="poi-popup">
                <div class="poi-popup-header">
                    <span class="poi-popup-icon">${poi.icon}</span>
                    <h3 class="poi-popup-title">${poi.title}</h3>
                </div>
                <div class="poi-popup-content">
                    <p class="poi-popup-description">${poi.description}</p>
                    <div class="poi-popup-details">
                        <div class="poi-detail">
                            <strong>Category:</strong> <span class="poi-category">${poi.category}</span>
                        </div>
                        <div class="poi-detail">
                            <strong>Coordinates:</strong> ${poi.latitude.toFixed(6)}, ${poi.longitude.toFixed(6)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    clearPOIMarkers() {
        this.poiMarkers.forEach(marker => {
            this.map.removeLayer(marker);
        });
        this.poiMarkers = [];
    }
}

// Initialize the GPS tracker when the page loads
let gpsTracker;
document.addEventListener('DOMContentLoaded', () => {
    gpsTracker = new GPSTracker();

    // Handle page visibility changes to pause/resume tracking
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            console.log('Page hidden, maintaining tracking...');
        } else {
            console.log('Page visible, ensuring tracking is active...');
            if (gpsTracker && !gpsTracker.pollInterval) {
                gpsTracker.startTracking();
            }
        }
    });
});

// Cleanup when page unloads
window.addEventListener('beforeunload', () => {
    if (gpsTracker) {
        gpsTracker.stopTracking();
    }
});