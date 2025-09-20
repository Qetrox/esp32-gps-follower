class WiFiManager {
    constructor() {
        this.apiKey = '';
        this.currentEditingSSID = null;
        this.baseURL = window.location.origin;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadAPIKey();
        this.loadNetworks();
    }

    setupEventListeners() {
        document.getElementById('wifiForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleFormSubmit();
        });

        document.getElementById('cancelBtn').addEventListener('click', () => {
            this.cancelEdit();
        });

        document.getElementById('showPassword').addEventListener('click', () => {
            this.togglePasswordVisibility('password');
        });

        document.getElementById('showApiKey').addEventListener('click', () => {
            this.togglePasswordVisibility('apiKey');
        });

        document.getElementById('apiKey').addEventListener('input', (e) => {
            this.apiKey = e.target.value;
            localStorage.setItem('wifiManagerApiKey', this.apiKey);
            if (this.apiKey) {
                this.loadNetworks();
            }
        });
    }

    loadAPIKey() {
        const savedKey = localStorage.getItem('wifiManagerApiKey');
        if (savedKey) {
            this.apiKey = savedKey;
            document.getElementById('apiKey').value = savedKey;
        }
    }

    togglePasswordVisibility(inputId) {
        const input = document.getElementById(inputId);
        const button = input.nextElementSibling;
        
        if (input.type === 'password') {
            input.type = 'text';
            button.textContent = 'Hide';
        } else {
            input.type = 'password';
            button.textContent = 'Show';
        }
    }

    async makeAPICall(endpoint, options = {}) {
        if (!this.apiKey) {
            this.showNotification('Please enter your API key first', 'error');
            return null;
        }

        const url = new URL(endpoint, this.baseURL);
        url.searchParams.append('key', this.apiKey);

        try {
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                if (response.status === 403) {
                    throw new Error('Invalid API key');
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            this.showNotification(`Error: ${error.message}`, 'error');
            return null;
        }
    }

    async loadNetworks() {
        if (!this.apiKey) {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('emptyState').style.display = 'block';
            return;
        }

        document.getElementById('loading').style.display = 'block';
        document.getElementById('emptyState').style.display = 'none';

        const networks = await this.makeAPICall('/wifi');
        
        document.getElementById('loading').style.display = 'none';

        if (networks !== null) {
            this.renderNetworks(networks);
        }
    }

    renderNetworks(networks) {
        const container = document.getElementById('networksContainer');
        const emptyState = document.getElementById('emptyState');

        if (networks.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';
        
        container.innerHTML = networks.map(network => `
            <div class="network-card" data-ssid="${this.escapeHtml(network.ssid)}">
                <div class="network-header">
                    <span class="network-ssid">${this.escapeHtml(network.ssid)}</span>
                    <div class="network-actions">
                        <button class="edit-btn" onclick="wifiManager.editNetwork('${this.escapeHtml(network.ssid)}', '${this.escapeHtml(network.password)}')">
                            ✏️ Edit
                        </button>
                        <button class="delete-btn" onclick="wifiManager.deleteNetwork('${this.escapeHtml(network.ssid)}')">
                            🗑️ Delete
                        </button>
                    </div>
                </div>
                <div class="network-password">
                    Password: ${'•'.repeat(network.password.length)}
                </div>
            </div>
        `).join('');
    }

    async handleFormSubmit() {
        const ssid = document.getElementById('ssid').value.trim();
        const password = document.getElementById('password').value;

        if (!ssid || !password) {
            this.showNotification('Please fill in both SSID and password', 'error');
            return;
        }

        const isEditing = this.currentEditingSSID !== null;
        const buttonText = document.getElementById('submitBtn').textContent;
        document.getElementById('submitBtn').textContent = isEditing ? 'Updating...' : 'Adding...';
        document.getElementById('submitBtn').disabled = true;

        const result = await this.makeAPICall('/wifi', {
            method: 'PUT',
            body: JSON.stringify({ ssid, password })
        });

        document.getElementById('submitBtn').disabled = false;
        document.getElementById('submitBtn').textContent = buttonText;

        if (result !== null) {
            this.showNotification(
                isEditing ? 'Network updated successfully!' : 'Network added successfully!',
                'success'
            );
            this.resetForm();
            this.renderNetworks(result);
        }
    }

    editNetwork(ssid, password) {
        this.currentEditingSSID = ssid;
        document.getElementById('ssid').value = ssid;
        document.getElementById('password').value = password;
        document.getElementById('submitBtn').textContent = 'Update Network';
        document.getElementById('cancelBtn').style.display = 'inline-block';
        
        document.querySelector('.form-section').scrollIntoView({ behavior: 'smooth' });
        
        this.showNotification('Editing network: ' + ssid, 'info');
    }

    async deleteNetwork(ssid) {
        if (!confirm(`Are you sure you want to delete the network "${ssid}"?`)) {
            return;
        }

        const result = await this.makeAPICall(`/wifi/${encodeURIComponent(ssid)}`, {
            method: 'DELETE'
        });

        if (result !== null) {
            this.showNotification('Network deleted successfully!', 'success');
            this.renderNetworks(result);
            
            if (this.currentEditingSSID === ssid) {
                this.cancelEdit();
            }
        }
    }

    cancelEdit() {
        this.currentEditingSSID = null;
        this.resetForm();
        document.getElementById('submitBtn').textContent = 'Add Network';
        document.getElementById('cancelBtn').style.display = 'none';
        this.showNotification('Edit cancelled', 'info');
    }

    resetForm() {
        document.getElementById('wifiForm').reset();
        const passwordField = document.getElementById('password');
        const showPasswordBtn = document.getElementById('showPassword');
        passwordField.type = 'password';
        showPasswordBtn.textContent = 'Show';
    }

    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.classList.add('show');

        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

class UIConfigManager {
    constructor() {
        this.config = null;
        this.apiKey = '';
        this.setupEventListeners();
        this.loadConfig();
    }

    setupEventListeners() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        document.getElementById('useCustomIcon').addEventListener('change', (e) => {
            this.toggleCustomIconFields(e.target.checked);
        });

        document.getElementById('defaultZoom').addEventListener('input', (e) => {
            document.getElementById('zoomValue').textContent = e.target.value;
        });

        document.getElementById('loadConfig').addEventListener('click', () => {
            this.loadConfig();
        });

        document.getElementById('saveConfig').addEventListener('click', () => {
            this.saveConfig();
        });

        document.getElementById('resetConfig').addEventListener('click', () => {
            this.resetConfig();
        });
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');
    }

    toggleCustomIconFields(show) {
        const iconGroup = document.getElementById('customIconGroup');
        const sizeGroup = document.getElementById('iconSizeGroup');
        iconGroup.style.display = show ? 'block' : 'none';
        sizeGroup.style.display = show ? 'block' : 'none';
    }

    async loadConfig() {
        try {
            const response = await fetch('/api/config');
            if (response.ok) {
                this.config = await response.json();
                this.populateForm();
                this.showNotification('Configuration loaded successfully', 'success');
            } else {
                this.showNotification('Failed to load configuration', 'error');
            }
        } catch (error) {
            console.error('Error loading config:', error);
            this.showNotification('Error loading configuration', 'error');
        }
    }

    populateForm() {
        if (!this.config) return;

        document.getElementById('webpageTitle').value = this.config.ui?.title?.webpage || '';
        document.getElementById('navbarTitle').value = this.config.ui?.title?.navbar || '';
        document.getElementById('trackerTitle').value = this.config.ui?.title?.tracker || '';
        document.getElementById('trackerDescription').value = this.config.tracker?.description || '';

        const useCustomIcon = this.config.tracker?.useCustomIcon || false;
        document.getElementById('useCustomIcon').checked = useCustomIcon;
        this.toggleCustomIconFields(useCustomIcon);
        document.getElementById('customIconUrl').value = this.config.tracker?.customIconUrl || '';
        document.getElementById('iconWidth').value = this.config.tracker?.customIconSize?.[0] || 32;
        document.getElementById('iconHeight').value = this.config.tracker?.customIconSize?.[1] || 32;

        document.getElementById('showDataPanel').checked = this.config.ui?.dataPanel?.show !== false;
        
        const popupData = this.config.tracker?.popupData || {};
        document.getElementById('showLatitude').checked = popupData.showLatitude !== false;
        document.getElementById('showLongitude').checked = popupData.showLongitude !== false;
        document.getElementById('showSpeed').checked = popupData.showSpeed !== false;
        document.getElementById('showAltitude').checked = popupData.showAltitude !== false;
        document.getElementById('showTimestamp').checked = popupData.showTimestamp !== false;
        document.getElementById('showDescription').checked = popupData.showDescription !== false;

        const labels = this.config.ui?.dataPanel?.labels || {};
        document.getElementById('latLabel').value = labels.latitude || 'Latitude:';
        document.getElementById('lngLabel').value = labels.longitude || 'Longitude:';
        document.getElementById('speedLabel').value = labels.speed || 'Speed:';
        document.getElementById('altLabel').value = labels.altitude || 'Altitude:';

        document.getElementById('defaultZoom').value = this.config.map?.defaultZoom || 15;
        document.getElementById('zoomValue').textContent = this.config.map?.defaultZoom || 15;
        document.getElementById('updateInterval').value = this.config.api?.updateInterval || 2000;
    }

    collectFormData() {
        return {
            ui: {
                title: {
                    webpage: document.getElementById('webpageTitle').value,
                    navbar: document.getElementById('navbarTitle').value,
                    tracker: document.getElementById('trackerTitle').value
                },
                navigation: {
                    trackerLink: "Live Tracker",
                    adminLink: "Admin Panel"
                },
                statusBar: {
                    connectionLabel: "Connection:",
                    updateLabel: "Last Update:",
                    offlineText: "Offline",
                    onlineText: "Online",
                    neverText: "Never"
                },
                dataPanel: {
                    show: document.getElementById('showDataPanel').checked,
                    labels: {
                        latitude: document.getElementById('latLabel').value,
                        longitude: document.getElementById('lngLabel').value,
                        speed: document.getElementById('speedLabel').value,
                        altitude: document.getElementById('altLabel').value
                    },
                    units: {
                        speed: "km/h",
                        altitude: "m"
                    },
                    centerButtonText: "Center on Tracker"
                }
            },
            tracker: {
                useCustomIcon: document.getElementById('useCustomIcon').checked,
                customIconUrl: document.getElementById('customIconUrl').value,
                customIconSize: [
                    parseInt(document.getElementById('iconWidth').value),
                    parseInt(document.getElementById('iconHeight').value)
                ],
                defaultIconColor: "#3388ff",
                description: document.getElementById('trackerDescription').value,
                popupData: {
                    showLatitude: document.getElementById('showLatitude').checked,
                    showLongitude: document.getElementById('showLongitude').checked,
                    showSpeed: document.getElementById('showSpeed').checked,
                    showAltitude: document.getElementById('showAltitude').checked,
                    showTimestamp: document.getElementById('showTimestamp').checked,
                    showDescription: document.getElementById('showDescription').checked
                }
            },
            poi: {
                popupData: {
                    showName: true,
                    showDescription: true,
                    showCategory: true,
                    showCoordinates: false
                }
            },
            map: {
                defaultZoom: parseInt(document.getElementById('defaultZoom').value),
                maxZoom: 19,
                tileLayer: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
                attribution: "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
            },
            admin: {
                title: {
                    webpage: "ESP32 GPS Follower - Admin Panel",
                    navbar: "🛜 WiFi Network Manager"
                },
                configSection: {
                    title: "🎨 UI Configuration",
                    description: "Customize the appearance and behavior of the GPS tracker interface"
                }
            },
            api: {
                updateInterval: parseInt(document.getElementById('updateInterval').value),
                apiKey: "your-api-key-here"
            }
        };
    }

    async saveConfig() {
        if (!wifiManager.apiKey) {
            this.showNotification('Please enter API key first', 'error');
            return;
        }

        try {
            const configData = this.collectFormData();
            const response = await fetch(`/api/config?key=${wifiManager.apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(configData)
            });

            if (response.ok) {
                this.showNotification('Configuration saved successfully! Refresh the tracker page to see changes.', 'success');
            } else {
                this.showNotification('Failed to save configuration', 'error');
            }
        } catch (error) {
            console.error('Error saving config:', error);
            this.showNotification('Error saving configuration', 'error');
        }
    }

    resetConfig() {
        if (confirm('Are you sure you want to reset to default configuration? This cannot be undone.')) {
            document.getElementById('webpageTitle').value = 'ESP32 GPS Follower - Live Tracker';
            document.getElementById('navbarTitle').value = 'ESP32 GPS Tracker';
            document.getElementById('trackerTitle').value = 'GPS Tracker';
            document.getElementById('trackerDescription').value = 'Live GPS position from ESP32 device';
            
            document.getElementById('useCustomIcon').checked = false;
            this.toggleCustomIconFields(false);
            document.getElementById('customIconUrl').value = '';
            document.getElementById('iconWidth').value = 32;
            document.getElementById('iconHeight').value = 32;
            
            document.getElementById('showDataPanel').checked = true;
            document.getElementById('showLatitude').checked = true;
            document.getElementById('showLongitude').checked = true;
            document.getElementById('showSpeed').checked = true;
            document.getElementById('showAltitude').checked = true;
            document.getElementById('showTimestamp').checked = true;
            document.getElementById('showDescription').checked = true;
            
            document.getElementById('latLabel').value = 'Latitude:';
            document.getElementById('lngLabel').value = 'Longitude:';
            document.getElementById('speedLabel').value = 'Speed:';
            document.getElementById('altLabel').value = 'Altitude:';
            
            document.getElementById('defaultZoom').value = 15;
            document.getElementById('zoomValue').textContent = '15';
            document.getElementById('updateInterval').value = 2000;
            
            this.showNotification('Form reset to defaults', 'info');
        }
    }

    showNotification(message, type) {
        if (wifiManager) {
            wifiManager.showNotification(message, type);
        }
    }
}

let wifiManager;
let configManager;
document.addEventListener('DOMContentLoaded', () => {
    wifiManager = new WiFiManager();
    configManager = new UIConfigManager();
});

setInterval(() => {
    if (wifiManager && wifiManager.apiKey) {
        wifiManager.loadNetworks();
    }
}, 30000);