// --- Supabase: Dynamic import so login never breaks if CDN is down ---
let supabase = null;
let _supabaseReady = false;
const _supabaseReadyPromise = (async () => {
    try {
        const module = await import('./supabase-config.js');
        supabase = module.supabase;
        _supabaseReady = true;
        console.log('Supabase connected successfully.');
    } catch (e) {
        console.warn('Supabase module failed to load. Running in offline/local mode.', e);
        _supabaseReady = true; // Mark as ready even on failure so we don't hang
    }
})();

// Helper: wait for Supabase to finish loading (or fail)
function waitForSupabase(timeout = 5000) {
    return Promise.race([
        _supabaseReadyPromise,
        new Promise(resolve => setTimeout(resolve, timeout))
    ]);
}

const ADMIN_HASH = 'edb4c656c930a9681dd2599f9b842b5bfa6548d196c507d4a80c087d4535a580'; // SHA-256 of Pablopablopablo$
const SESSION_KEY = 'transrapid_admin_auth';

// --- Global Variables ---
const STORE_KEY = 'transrapid_shipments';
let map = null;
let waypointsData = [];
let routePolylines = []; // Array to store ALL polyline layers so they can all be removed
let currentTracking = '';
let currentPin = '';
let previewMarker = null;
const markers = [];
let currentPositionIndex = -1; // -1 means not set; will default to last waypoint
let destinationIndex = -1; // -1 means not set; will auto-calculate as last stop-type waypoint
let googleApiValid = null; // null=unchecked, true=working, false=not activated
let googleApiCheckPromise = null; // Promise for async API validation

// --- Geocoding Helpers ---
// Build a readable short location name from Nominatim address object
function buildLocationName(addr, displayName) {
    if (!addr) return displayName || 'Unknown Location';
    const parts = [];
    if (addr.house_number && addr.road) parts.push(addr.house_number + ' ' + addr.road);
    else if (addr.road) parts.push(addr.road);
    else if (addr.suburb) parts.push(addr.suburb);
    else if (addr.neighbourhood) parts.push(addr.neighbourhood);
    const city = addr.city || addr.town || addr.village || addr.hamlet || addr.municipality;
    if (city) parts.push(city);
    if (addr.state) parts.push(addr.state);
    if (addr.country_code !== 'us' && addr.country) parts.push(addr.country);
    if (addr.postcode) parts.push(addr.postcode);
    return parts.length > 0 ? parts.join(', ') : (displayName || 'Unknown Location');
}

// Determine appropriate zoom level from Nominatim result type
function getZoomForType(type) {
    const zoomMap = {
        'house': 18, 'building': 18, 'residential': 17, 'apartment': 18,
        'street': 17, 'street_address': 18, 'address': 18,
        'suburb': 14, 'neighbourhood': 15, 'quarter': 15,
        'city': 12, 'town': 12, 'village': 13, 'hamlet': 14,
        'county': 10, 'state': 7, 'country': 5
    };
    return zoomMap[type] || 14;
}

// --- Google Maps Geocoding Helpers ---
// Build a readable location name from a Google Geocoding result
function buildGoogleLocationName(geoResult) {
    if (!geoResult || !geoResult.address_components) return geoResult?.formatted_address || 'Unknown Location';
    const addr = {};
    geoResult.address_components.forEach(c => { addr[c.types[0]] = c; });
    const parts = [];
    // Street address
    if (addr.street_number && addr.route) parts.push(addr.street_number.short_name + ' ' + addr.route.short_name);
    else if (addr.route) parts.push(addr.route.short_name);
    else if (addr.subpremise) parts.push(addr.subpremise.short_name);
    // City
    const cityComp = addr.locality || addr.postal_town || addr.administrative_area_level_2 || addr.political;
    if (cityComp) parts.push(cityComp.short_name || cityComp.long_name);
    // State/region
    if (addr.administrative_area_level_1) parts.push(addr.administrative_area_level_1.short_name);
    // Country
    if (addr.country) {
        const cc = addr.country.short_name;
        if (cc !== 'US') parts.push(addr.country.long_name);
    }
    // Postcode
    if (addr.postal_code) parts.push(addr.postal_code.short_name);
    return parts.length > 0 ? parts.join(', ') : (geoResult.formatted_address || 'Unknown Location');
}

// Build a readable location name from a Google Places Autocomplete result
function buildPlaceLocationName(place) {
    if (place.name && place.formatted_address) {
        // Use name + first part of address (usually city)
        const addrParts = place.formatted_address.split(',');
        if (addrParts.length > 1) return place.name + ', ' + addrParts.slice(1).join(',').trim();
        return place.name;
    }
    return place.name || place.formatted_address || 'Unknown Location';
}

// --- Google Maps API Validation ---
// Checks if the Google Maps API key is actually working by doing a test geocode.
// This prevents us from hooking onto a "lifeless" API key that blocks the UI.
async function validateGoogleMapsApi() {
    if (googleApiValid !== null) return googleApiValid; // Already checked
    if (googleApiCheckPromise) return googleApiCheckPromise;

    googleApiCheckPromise = (async () => {
        try {
            if (!window.google || !window.google.maps || !window.google.maps.places) {
                console.warn('Google Maps JS API not loaded or Places library missing.');
                googleApiValid = false;
                return false;
            }
            // Test with AutocompleteService (lightweight, no UI attachment)
            const service = new google.maps.places.AutocompleteService();
            return new Promise((resolve) => {
                service.getPlacePredictions({ input: 'London' }, (predictions, status) => {
                    if (status === google.maps.places.PlacesServiceStatus.OK && predictions && predictions.length > 0) {
                        console.log('Google Maps API key is VALID — worldwide search enabled.');
                        googleApiValid = true;
                        resolve(true);
                    } else {
                        console.warn('Google Maps API key is NOT activated. Status:', status);
                        console.warn('Enable these APIs in Google Cloud Console:');
                        console.warn('  → Geocoding API');
                        console.warn('  → Places API');
                        console.warn('  → Maps JavaScript API');
                        console.warn('Falling back to Nominatim (OpenStreetMap) search.');
                        googleApiValid = false;
                        resolve(false);
                    }
                });
            });
        } catch (e) {
            console.warn('Google Maps API validation failed:', e);
            googleApiValid = false;
            return false;
        } finally {
            googleApiCheckPromise = null;
        }
    })();

    return googleApiCheckPromise;
}

// Google Geocoding — returns array of results (only called if API is validated)
async function googleGeocode(query) {
    if (googleApiValid !== true) return [];
    if (!window.google || !window.google.maps) return [];
    return new Promise((resolve) => {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ address: query }, (results, status) => {
            if (status === google.maps.GeocoderStatus.OK && results && results.length > 0) {
                resolve(results);
            } else {
                resolve([]);
            }
        });
    });
}

// Google Places Autocomplete predictions — returns predictions (only called if API is validated)
async function googleAutocompleteSearch(query) {
    if (googleApiValid !== true) return [];
    if (!window.google || !window.google.maps) return [];
    return new Promise((resolve) => {
        const service = new google.maps.places.AutocompleteService();
        service.getPlacePredictions({ input: query, types: ['geocode', 'establishment'] }, (predictions, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
                resolve(predictions);
            } else {
                resolve([]);
            }
        });
    });
}

// Google Places Details — gets full details including geometry for a place_id
async function googlePlaceDetails(placeId) {
    if (googleApiValid !== true) return null;
    if (!window.google || !window.google.maps) return null;
    return new Promise((resolve) => {
        const service = new google.maps.places.PlacesService(document.createElement('div'));
        service.getDetails({ placeId: placeId, fields: ['name', 'formatted_address', 'geometry', 'address_components', 'type'] }, (place, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && place) {
                resolve(place);
            } else {
                resolve(null);
            }
        });
    });
}

// --- Mapbox Geocoding Helpers ---
const MAPBOX_TOKEN = 'pk.eyJ1IjoicGFibG9wYWJsbzEyMyIsImEiOiJjbW9wa21ucHUwaDExMnFzZWIweGt4NGw0In0.FsaVIX0zLxDyqiuJOi3Big';
let mapboxApiValid = null;

// Validate Mapbox API by doing a test geocode
async function validateMapboxApi() {
    if (mapboxApiValid !== null) return mapboxApiValid;
    try {
        const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/London.json?access_token=${MAPBOX_TOKEN}&limit=1`);
        if (res.ok) {
            const data = await res.json();
            if (data && data.features && data.features.length > 0) {
                console.log('Mapbox API is VALID — high-precision search enabled.');
                mapboxApiValid = true;
                return true;
            }
        }
        console.warn('Mapbox API not working. Falling back to other providers.');
        mapboxApiValid = false;
        return false;
    } catch (e) {
        console.warn('Mapbox API validation failed:', e);
        mapboxApiValid = false;
        return false;
    }
}

// Mapbox Geocoding — forward geocode an address
async function mapboxGeocode(query) {
    try {
        const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&limit=10&types=address,place,locality,neighborhood,poi`);
        if (res.ok) {
            const data = await res.json();
            return data.features || [];
        }
    } catch (e) {
        console.warn('Mapbox geocoding error:', e);
    }
    return [];
}

// Mapbox Search API (newer, more precise for addresses)
async function mapboxSearch(query) {
    try {
        const res = await fetch(`https://api.mapbox.com/search/searchbox/v1?q=${encodeURIComponent(query)}&access_token=${MAPBOX_TOKEN}&limit=10`);
        if (res.ok) {
            const data = await res.json();
            return data.features || [];
        }
    } catch (e) {
        console.warn('Mapbox Search API error:', e);
    }
    return [];
}

// Build a readable location name from a Mapbox feature
function buildMapboxLocationName(feature) {
    if (!feature) return 'Unknown Location';
    // Use place_name if available, otherwise build from context
    if (feature.place_name) {
        // place_name is usually well-formatted, just use it
        return feature.place_name;
    }
    return feature.text || feature.address || 'Unknown Location';
}

// Show a found location on the map with Add as Stop / Add as Transit buttons
function showLocationOnMap(lat, lon, locName, zoomLevel) {
    if (!map) return;
    map.flyTo([lat, lon], zoomLevel || 16, { duration: 1.5 });
    if (previewMarker) map.removeLayer(previewMarker);
    previewMarker = L.marker([lat, lon]).addTo(map);
    const popupContent = document.createElement('div');
    popupContent.innerHTML = `<b>${locName}</b><br><small style="color:rgba(26,29,38,0.55);">${lat.toFixed(4)}, ${lon.toFixed(4)}</small><br>`;
    const btnRow = document.createElement('div');
    btnRow.style.marginTop = '8px';
    btnRow.style.display = 'flex';
    btnRow.style.gap = '6px';
    btnRow.style.flexWrap = 'wrap';

    const stopBtn = document.createElement('button');
    stopBtn.className = 'btn-primary';
    stopBtn.style.fontSize = '0.8rem';
    stopBtn.style.padding = '6px 12px';
    stopBtn.innerHTML = '<i class="fa-solid fa-location-dot"></i> Add as Stop';
    stopBtn.onclick = () => {
        waypointsData.push({ lat, lng: lon, name: locName, time: new Date().toLocaleString(), status: waypointsData.length === 0 ? "Shipment Started" : "Transit Update", stopType: 'stop' });
        currentPositionIndex = waypointsData.length - 1;
        map.removeLayer(previewMarker); previewMarker = null;
        updateMapDrawings();
    };

    const transitBtn = document.createElement('button');
    transitBtn.className = 'btn-outline';
    transitBtn.style.fontSize = '0.8rem';
    transitBtn.style.padding = '6px 12px';
    transitBtn.innerHTML = '<i class="fa-solid fa-circle" style="font-size:0.5rem;"></i> Add as Transit';
    transitBtn.onclick = () => {
        waypointsData.push({ lat, lng: lon, name: locName, time: new Date().toLocaleString(), status: "In transit", stopType: 'transit' });
        map.removeLayer(previewMarker); previewMarker = null;
        updateMapDrawings();
    };

    btnRow.appendChild(stopBtn);
    btnRow.appendChild(transitBtn);
    popupContent.appendChild(btnRow);
    previewMarker.bindPopup(popupContent).openPopup();
}

// --- Security Helpers ---
async function hashString(str) {
    // Try native crypto.subtle first (requires HTTPS or localhost)
    if (window.crypto && window.crypto.subtle) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(str);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) {
            console.warn('crypto.subtle failed, using fallback:', e);
        }
    }
    // Fallback: pure JS SHA-256 for non-secure contexts (HTTP)
    // This ensures login works even without HTTPS
    function sha256Fallback(message) {
        function rightRotate(value, amount) { return (value >>> amount) | (value << (32 - amount)); }
        const mathPow = Math.pow;
        const maxWord = mathPow(2, 32);
        let H = [];
        let K = [];
        let primeCounter = 0;
        const isComposite = {};
        for (let candidate = 2; primeCounter < 64; candidate++) {
            if (!isComposite[candidate]) {
                for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
                H[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
                K[primeCounter++] = (mathPow(candidate, 1/3) * maxWord) | 0;
            }
        }
        let hash = H.slice(0, 8);
        const words = [];
        const asciiBitLength = message.length * 8;
        message += '\x80';
        while (message.length % 64 - 56) message += '\x00';
        for (let i = 0; i < message.length; i++) {
            const j = message.charCodeAt(i);
            if (j >> 8) return; // ASCII only
            words[i >> 2] |= j << ((3 - i) % 4) * 8;
        }
        words[words.length] = (asciiBitLength / maxWord) | 0;
        words[words.length] = asciiBitLength;
        for (let j = 0; j < words.length;) {
            const w = words.slice(j, j += 16);
            const oldHash = hash.slice(0);
            for (let i = 0; i < 64; i++) {
                const w15 = w[i - 15], w2 = w[i - 2];
                const a = hash[0], e = hash[4];
                const temp1 = hash[7] + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
                    + ((e & hash[5]) ^ ((~e) & hash[6])) + K[i]
                    + (w[i] = (i < 16) ? w[i] : (
                        w[i - 16] + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
                        + w[i - 7] + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
                    ) | 0);
                const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
                    + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
                hash = [(temp1 + temp2) | 0].concat(hash);
                hash[4] = (hash[4] + temp1) | 0;
            }
            for (let i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
        }
        let hex = '';
        for (let i = 0; i < 8; i++)
            for (let j = 3; j >= 0; j--)
                hex += ((hash[i] >> (j * 8)) & 255).toString(16).padStart(2, '0');
        return hex;
    }
    return sha256Fallback(str);
}

// --- Database Logic ---
function getShipments() {
    try {
        const data = localStorage.getItem(STORE_KEY);
        return data ? JSON.parse(data) : {};
    } catch (e) { return {}; }
}

async function saveShipment(trackingCode, data) {
    if (supabase) {
        const { error } = await supabase.from('shipments').upsert({ tracking_code: trackingCode, data: data });
        if (error) {
            console.error("Supabase Error:", error);
            alert("Database Error! " + error.message);
        }
    } else {
        const db = getShipments();
        db[trackingCode] = data;
        localStorage.setItem(STORE_KEY, JSON.stringify(db));
    }
}

async function deleteShipment(trackingCode) {
    if (supabase) {
        const { error } = await supabase.from('shipments').delete().eq('tracking_code', trackingCode);
        if (error) {
            console.error("Supabase Delete Error:", error);
            return false;
        }
    } else {
        const db = getShipments();
        delete db[trackingCode];
        localStorage.setItem(STORE_KEY, JSON.stringify(db));
    }
    return true;
}

// --- Main Initialization ---
// Module scripts are deferred, so DOMContentLoaded may have already fired.
// Use readyState check to handle both cases.
function initApp() {
    // 1. Safe Element Selectors
    const elements = {
        authOverlay: document.getElementById('authOverlay'),
        appLayout: document.getElementById('appLayout'),
        loginBtn: document.getElementById('loginBtn'),
        logoutBtn: document.getElementById('logoutBtn'),
        adminPassphrase: document.getElementById('adminPassphrase'),
        authError: document.getElementById('authError'),
        sidebar: document.querySelector('.sidebar'),
        sidebarOverlay: document.getElementById('sidebarOverlay'),
        menuToggle: document.getElementById('menuToggle'),
        navItems: document.querySelectorAll('.nav-item[data-tab]'),
        viewSections: document.querySelectorAll('.view-section'),
        generateTracking: document.getElementById('generateTrackingBtn'),
        saveShipment: document.getElementById('saveShipmentBtn'),
        clearMap: document.getElementById('clearMapBtn'),
        undoMap: document.getElementById('undoMapBtn'),
        mapSearchBtn: document.getElementById('mapSearchBtn'),
        mapSearchInput: document.getElementById('mapSearchInput'),
        wipeDbBtn: document.getElementById('wipeDbBtn')
    };

    // --- Authentication Logic ---
    const checkSession = () => {
        if (sessionStorage.getItem(SESSION_KEY) === 'true') {
            elements.authOverlay.style.display = 'none';
            elements.appLayout.style.display = 'flex';
            setupMap();
            loadDashboardStats(elements);
            loadManageRecords(elements);
            setTimeout(() => { if(map) map.invalidateSize(); }, 500);
        }
    };
    checkSession();

    if (elements.loginBtn) {
        // Allow Enter key on passphrase input
        if (elements.adminPassphrase) {
            elements.adminPassphrase.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); elements.loginBtn.click(); }
            });
        }

        elements.loginBtn.addEventListener('click', async () => {
            const inputVal = elements.adminPassphrase.value.trim();

            if (!inputVal) {
                if (elements.authError) {
                    elements.authError.textContent = "Please enter the passphrase.";
                    elements.authError.style.display = 'block';
                }
                return;
            }

            try {
                const inputHash = await hashString(inputVal);

                if (inputHash && inputHash === ADMIN_HASH) {
                    sessionStorage.setItem(SESSION_KEY, 'true');
                    elements.authOverlay.style.display = 'none';
                    elements.appLayout.style.display = 'flex';

                    // CRITICAL: Initialize Map ONLY after it's visible
                    setupMap();
                    loadDashboardStats(elements);
                    loadManageRecords(elements);

                    // UI Fix for Leaflet
                    setTimeout(() => { if(map) map.invalidateSize(); }, 500);
                } else {
                    if (elements.authError) {
                        elements.authError.textContent = "Invalid passphrase. Access denied.";
                        elements.authError.style.display = 'block';
                    }
                }
            } catch (err) {
                console.error('Login error:', err);
                if (elements.authError) {
                    elements.authError.textContent = "Authentication error. Please try again.";
                    elements.authError.style.display = 'block';
                }
            }
        });
    }

    if (elements.logoutBtn) {
        elements.logoutBtn.addEventListener('click', () => {
            sessionStorage.removeItem(SESSION_KEY);
            window.location.reload();
        });
    }

    // --- Mobile Sidebar Toggle ---
    if (elements.menuToggle && elements.sidebar && elements.sidebarOverlay) {
        elements.menuToggle.addEventListener('click', () => {
            elements.sidebar.classList.add('active');
            elements.sidebarOverlay.classList.add('active');
        });
        elements.sidebarOverlay.addEventListener('click', () => {
            elements.sidebar.classList.remove('active');
            elements.sidebarOverlay.classList.remove('active');
        });
    }

    // --- Tab Switching ---
    elements.navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = item.getAttribute('data-tab');

            elements.navItems.forEach(n => n.classList.remove('active'));
            elements.viewSections.forEach(v => v.style.display = 'none');

            item.classList.add('active');
            const targetView = document.getElementById(`view-${tabId}`);
            if (targetView) targetView.style.display = 'block';

            // Close mobile sidebar
            elements.sidebar.classList.remove('active');
            elements.sidebarOverlay.classList.remove('active');

            if (tabId === 'create-shipment' && map) {
                setTimeout(() => map.invalidateSize(), 200);
            }
            if (tabId === 'dashboard') {
                loadDashboardStats(elements);
            }
            if (tabId === 'manage-shipments') {
                loadManageRecords(elements);
            }
        });
    });

    if (document.getElementById('goToCreateBtn')) {
        document.getElementById('goToCreateBtn').addEventListener('click', () => {
            const createTab = document.querySelector('.nav-item[data-tab="create-shipment"]');
            if (createTab) createTab.click();
        });
    }

    // --- Tracking & Form Operations ---
    if (elements.generateTracking) {
        elements.generateTracking.addEventListener('click', (e) => {
            e.preventDefault();
            const prefix = "TR-";
            const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
            let rand = "";
            for(let i=0; i<10; i++) rand += chars.charAt(Math.floor(Math.random() * chars.length));

            currentTracking = prefix + rand;
            currentPin = Math.floor(1000 + Math.random() * 9000).toString();

            document.getElementById('displayTrk').textContent = currentTracking;
            document.getElementById('displayPin').textContent = currentPin;
            document.getElementById('genResultBox').classList.remove('hidden');
        });
    }

    if (elements.saveShipment) {
        elements.saveShipment.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!currentTracking) {
                alert("Please Generate Tracking Number first.");
                return;
            }

            elements.saveShipment.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

            const shipmentData = {
                pkgName: document.getElementById('pkgName').value,
                pkgBarcode: document.getElementById('pkgBarcode').value,
                pkgWeight: document.getElementById('pkgWeight').value,
                pkgValue: document.getElementById('pkgValue').value,
                pkgDesc: document.getElementById('pkgDesc').value,
                pkgCircumstance: document.getElementById('pkgCircumstance').value,
                pkgTransport: document.getElementById('pkgTransport').value,
                pkgAgency: document.getElementById('pkgAgency').value,
                pkgStatus: document.getElementById('pkgStatus').value,
                pkgEstDelivery: document.getElementById('pkgEstDelivery').value,
                senderName: document.getElementById('senderName').value,
                senderEmail: document.getElementById('senderEmail').value,
                senderPhone: document.getElementById('senderPhone').value,
                receiverName: document.getElementById('receiverName').value,
                receiverEmail: document.getElementById('receiverEmail').value,
                receiverPhone: document.getElementById('receiverPhone').value,
                pin: currentPin,
                waypoints: waypointsData,
                currentPositionIndex: currentPositionIndex,
                destinationIndex: destinationIndex,
                lastUpdated: new Date().toISOString()
            };

            await saveShipment(currentTracking, shipmentData);

            elements.saveShipment.innerHTML = `<i class="fa-solid fa-check"></i> Saved successfully!`;
            elements.saveShipment.style.background = '#2ecc71';

            setTimeout(() => {
                elements.saveShipment.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Save & Sync Globally`;
                elements.saveShipment.style.background = '';
            }, 2000);
        });
    }

    // --- Settings Operations ---
    if (elements.wipeDbBtn) {
        elements.wipeDbBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (confirm('CRITICAL: Permanently delete ALL shipment records?')) {
                if(supabase) {
                    const { error } = await supabase.from('shipments').delete().neq('tracking_code', 'WIPE_ALL');
                    if(!error) alert('Cloud Database wiped!');
                } else {
                    localStorage.removeItem(STORE_KEY);
                    alert('Local cache cleared.');
                }
                loadDashboardStats(elements);
                loadManageRecords(elements);
            }
        });
    }
}

// Run initialization — works whether DOM is already loaded or not
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// --- Map Logic Function ---
function setupMap() {
    if (map) return; // Already initialized

    const mapContainer = document.getElementById('adminMap');
    if (!mapContainer) return;

    map = L.map('adminMap').setView([39.8283, -98.5795], 6);
    // Use CARTO Voyager tiles for detailed, clean street-level mapping
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19
    }).addTo(map);

    // Map Search — custom autocomplete dropdown (Google if API valid, else Nominatim)
    const searchBtn = document.getElementById('mapSearchBtn');
    const searchInput = document.getElementById('mapSearchInput');
    if (searchBtn && searchInput) {

        // --- Validate Google Maps API on first map setup ---
        // This runs ONCE and caches the result. If the key is dead, we skip all Google calls.
        validateGoogleMapsApi();
        validateMapboxApi();

        // --- API status indicator (inserted AFTER the map-search row, not inside it) ---
        const searchRow = searchInput.parentElement; // .map-search div
        const apiIndicator = document.createElement('div');
        apiIndicator.id = 'apiStatusIndicator';
        apiIndicator.style.cssText = 'font-size:0.65rem;padding:3px 8px;border-radius:4px;margin-top:2px;display:none;';
        // Insert after the .map-search row (as a sibling, not a child)
        searchRow.parentNode.insertBefore(apiIndicator, searchRow.nextSibling);

        // Show API status after validation completes
        Promise.all([validateGoogleMapsApi(), validateMapboxApi()]).then(([googleValid, mapboxValid]) => {
            if (mapboxValid) {
                apiIndicator.textContent = 'Mapbox: Connected (High Precision)';
                apiIndicator.style.cssText = 'font-size:0.65rem;padding:3px 8px;border-radius:4px;margin-top:2px;display:block;background:rgba(46,204,113,0.12);color:#059669;';
            } else if (googleValid) {
                apiIndicator.textContent = 'Google Maps: Connected';
                apiIndicator.style.cssText = 'font-size:0.65rem;padding:3px 8px;border-radius:4px;margin-top:2px;display:block;background:rgba(46,204,113,0.12);color:#059669;';
            } else {
                apiIndicator.innerHTML = 'Using OpenStreetMap (limited precision). <a href="https://console.cloud.google.com/apis/library?filter=category:maps" target="_blank" style="color:#D97706;text-decoration:underline;">Enable APIs</a>';
                apiIndicator.style.cssText = 'font-size:0.65rem;padding:3px 8px;border-radius:4px;margin-top:2px;display:block;background:rgba(217,119,6,0.08);color:#B45309;';
            }
        });

        // --- Custom Autocomplete Dropdown ---
        // Shows as user types — NEVER hijacks the input like Google's Autocomplete widget
        let autocompleteTimer = null;
        let autocompleteDropdown = null;

        function removeAutocompleteDropdown() {
            if (autocompleteDropdown) {
                autocompleteDropdown.remove();
                autocompleteDropdown = null;
            }
        }

        function showAutocompleteDropdown(items) {
            removeAutocompleteDropdown();
            if (!items || items.length === 0) return;

            autocompleteDropdown = document.createElement('div');
            autocompleteDropdown.id = 'liveAutocompleteDropdown';
            autocompleteDropdown.style.cssText = 'position:absolute;bottom:100%;left:0;z-index:10000;background:rgba(255,255,255,0.98);backdrop-filter:blur(12px);border:1px solid rgba(217,119,6,0.3);border-radius:10px;max-height:250px;overflow-y:auto;width:100%;margin-bottom:4px;box-shadow:0 -4px 24px rgba(0,0,0,0.12);';

            items.forEach(item => {
                const el = document.createElement('div');
                el.style.cssText = 'padding:10px 14px;cursor:pointer;border-bottom:1px solid rgba(0,0,0,0.04);transition:background 0.15s;display:flex;align-items:center;gap:10px;';
                el.onmouseover = () => el.style.background = 'rgba(217,119,6,0.08)';
                el.onmouseout = () => el.style.background = 'transparent';

                const isGoogle = !!item.isGoogle;
                const isMapbox = !!item.isMapbox;
                const icon = document.createElement('span');
                icon.style.cssText = 'color:#FF9F1C;font-size:0.85rem;min-width:20px;';
                icon.innerHTML = isMapbox ? '<i class="fa-solid fa-map-location-dot"></i>' : (isGoogle ? '<i class="fa-solid fa-globe"></i>' : '<i class="fa-solid fa-location-dot"></i>');

                const textDiv = document.createElement('div');
                const shortName = isMapbox ? ((item.place_name || item.text || '').split(',').slice(0, 2).join(',')) : (isGoogle ? (item.description || '').split(',').slice(0, 2).join(',') : (item.display_name || '').split(',').slice(0, 2).join(','));
                const fullName = isMapbox ? (item.place_name || item.text || '') : (isGoogle ? (item.description || '') : (item.display_name || ''));
                const typeLabel = isMapbox ? 'Mapbox' : (isGoogle ? 'Google' : (item.type || 'OSM'));
                textDiv.innerHTML = `<div style="font-size:0.85rem;font-weight:500;color:#1A1D26;">${shortName}</div><div style="font-size:0.7rem;color:rgba(26,29,38,0.55);">${fullName} <span style="color:rgba(217,119,6,0.7);text-transform:uppercase;font-size:0.6rem;">${typeLabel}</span></div>`;

                el.appendChild(icon);
                el.appendChild(textDiv);

                el.onclick = async () => {
                    removeAutocompleteDropdown();
                    if (isMapbox) {
                        // Mapbox feature — extract coordinates from center array [lng, lat]
                        const coords = item.geometry && item.geometry.coordinates;
                        if (coords) {
                            const mLon = coords[0];
                            const mLat = coords[1];
                            const mName = buildMapboxLocationName(item);
                            searchInput.value = mName;
                            showLocationOnMap(mLat, mLon, mName, 16);
                        } else if (item.center) {
                            const mLon = item.center[0];
                            const mLat = item.center[1];
                            const mName = buildMapboxLocationName(item);
                            searchInput.value = mName;
                            showLocationOnMap(mLat, mLon, mName, 16);
                        }
                    } else if (isGoogle && item.place_id) {
                        // Google Autocomplete prediction — fetch details then show on map
                        searchInput.value = item.description || '';
                        const place = await googlePlaceDetails(item.place_id);
                        if (place && place.geometry && place.geometry.location) {
                            const pLat = typeof place.geometry.location.lat === 'function' ? place.geometry.location.lat() : place.geometry.location.lat;
                            const pLon = typeof place.geometry.location.lng === 'function' ? place.geometry.location.lng() : place.geometry.location.lng;
                            const pName = buildPlaceLocationName(place);
                            showLocationOnMap(pLat, pLon, pName, 16);
                        }
                    } else if (isGoogle && item.geometry) {
                        // Google Geocode result — show directly
                        const lat = typeof item.geometry.location.lat === 'function' ? item.geometry.location.lat() : item.geometry.location.lat;
                        const lon = typeof item.geometry.location.lng === 'function' ? item.geometry.location.lng() : item.geometry.location.lng;
                        const locName = buildGoogleLocationName(item);
                        searchInput.value = locName;
                        showLocationOnMap(lat, lon, locName, 16);
                    } else {
                        // Nominatim result
                        const lat = parseFloat(item.lat);
                        const lon = parseFloat(item.lon);
                        const locName = buildLocationName(item.address, item.display_name);
                        searchInput.value = locName;
                        const zoom = getZoomForType(item.type) || getZoomForType(item.class) || 16;
                        showLocationOnMap(lat, lon, locName, zoom);
                    }
                };

                autocompleteDropdown.appendChild(el);
            });

            searchInput.parentElement.style.position = 'relative';
            searchInput.parentElement.style.zIndex = '100';
            searchInput.parentElement.appendChild(autocompleteDropdown);

            // Close on outside click
            setTimeout(() => {
                const closeHandler = (e) => {
                    if (autocompleteDropdown && !autocompleteDropdown.contains(e.target) && e.target !== searchInput) {
                        removeAutocompleteDropdown();
                        document.removeEventListener('click', closeHandler);
                    }
                };
                document.addEventListener('click', closeHandler);
            }, 50);
        }

        // Live autocomplete as user types (debounced)
        searchInput.addEventListener('input', () => {
            clearTimeout(autocompleteTimer);
            const query = searchInput.value.trim();
            if (query.length < 3) {
                removeAutocompleteDropdown();
                return;
            }
            autocompleteTimer = setTimeout(async () => {
                try {
                    // STRATEGY 1: Mapbox Search API (most precise for addresses)
                    if (mapboxApiValid === null) await validateMapboxApi();
                    if (mapboxApiValid) {
                        const mapboxResults = await mapboxSearch(query);
                        if (mapboxResults && mapboxResults.length > 0) {
                            const items = mapboxResults.map(f => ({ ...f, isMapbox: true }));
                            showAutocompleteDropdown(items);
                            return;
                        }
                        // Also try Mapbox Geocoding API
                        const mapboxGeoResults = await mapboxGeocode(query);
                        if (mapboxGeoResults && mapboxGeoResults.length > 0) {
                            const items = mapboxGeoResults.map(f => ({ ...f, isMapbox: true }));
                            showAutocompleteDropdown(items);
                            return;
                        }
                    }
                    // STRATEGY 2: Google Places Autocomplete
                    if (googleApiValid === true) {
                        const predictions = await googleAutocompleteSearch(query);
                        if (predictions && predictions.length > 0) {
                            const items = predictions.map(p => ({ ...p, isGoogle: true }));
                            showAutocompleteDropdown(items);
                            return;
                        }
                    }
                    // STRATEGY 3: Nominatim fallback
                    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=8&q=${encodeURIComponent(query)}`, {
                        headers: { 'Accept-Language': 'en', 'User-Agent': 'TransrapidExpressAdmin/1.0' }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        if (data && data.length > 0) {
                            const items = data.map(d => ({ ...d, isGoogle: false }));
                            showAutocompleteDropdown(items);
                        }
                    }
                } catch (e) {
                    console.warn('Autocomplete error:', e);
                }
            }, 350); // Reduced debounce for Mapbox (faster API)
        });

        // Allow Enter key to search
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                removeAutocompleteDropdown();
                searchBtn.click();
            }
        });

        // --- Search Button: Google Geocoding first, then Nominatim fallback ---
        searchBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const query = searchInput.value.trim();
            if(!query) return;
            searchBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            searchBtn.disabled = true;
            removeAutocompleteDropdown();
            try {
                // ========= STRATEGY 0: Mapbox Search API (highest precision) =========
                if (mapboxApiValid === null) await validateMapboxApi();
                if (mapboxApiValid) {
                    let mapboxResults = await mapboxSearch(query);
                    if (mapboxResults && mapboxResults.length > 0) {
                        if (mapboxResults.length === 1) {
                            const feature = mapboxResults[0];
                            const coords = feature.geometry && feature.geometry.coordinates;
                            if (coords) {
                                const mName = buildMapboxLocationName(feature);
                                showLocationOnMap(coords[1], coords[0], mName, 16);
                                return;
                            } else if (feature.center) {
                                const mName = buildMapboxLocationName(feature);
                                showLocationOnMap(feature.center[1], feature.center[0], mName, 16);
                                return;
                            }
                        } else {
                            const items = mapboxResults.map(f => ({ ...f, isMapbox: true }));
                            showAutocompleteDropdown(items);
                            return;
                        }
                    }
                    // Also try Mapbox Geocoding API
                    let mapboxGeoResults = await mapboxGeocode(query);
                    if (mapboxGeoResults && mapboxGeoResults.length > 0) {
                        if (mapboxGeoResults.length === 1) {
                            const feature = mapboxGeoResults[0];
                            const coords = feature.center || (feature.geometry && feature.geometry.coordinates);
                            if (coords) {
                                const mName = buildMapboxLocationName(feature);
                                showLocationOnMap(coords[1], coords[0], mName, 16);
                                return;
                            }
                        } else {
                            const items = mapboxGeoResults.map(f => ({ ...f, isMapbox: true }));
                            showAutocompleteDropdown(items);
                            return;
                        }
                    }
                }

                // ========= STRATEGY 1: Google Geocoding API (only if validated) =========
                if (googleApiValid === true) {
                    let googleResults = await googleGeocode(query);
                    if (googleResults && googleResults.length > 0) {
                        if (googleResults.length === 1) {
                            const result = googleResults[0];
                            const lat = typeof result.geometry.location.lat === 'function' ? result.geometry.location.lat() : result.geometry.location.lat;
                            const lon = typeof result.geometry.location.lng === 'function' ? result.geometry.location.lng() : result.geometry.location.lng;
                            const locName = buildGoogleLocationName(result);
                            showLocationOnMap(lat, lon, locName, 16);
                            return;
                        } else {
                            const items = googleResults.map(r => ({ ...r, isGoogle: true }));
                            showAutocompleteDropdown(items);
                            return;
                        }
                    }

                    // ========= STRATEGY 2: Google Places Autocomplete predictions =========
                    let predictions = await googleAutocompleteSearch(query);
                    if (predictions && predictions.length > 0) {
                        const items = predictions.map(p => ({ ...p, isGoogle: true }));
                        showAutocompleteDropdown(items);
                        return;
                    }
                }

                // ========= STRATEGY 3: Nominatim fallback =========
                const headers = {
                    'Accept-Language': 'en',
                    'User-Agent': 'TransrapidExpressAdmin/1.0'
                };
                const delay = ms => new Promise(r => setTimeout(r, ms));
                let data = [];

                // Address abbreviation expansion
                const abbreviations = {
                    'CRES': 'Crescent', 'CR': 'Crescent',
                    'RD': 'Road', 'Rd': 'Road',
                    'ST': 'Street', 'STR': 'Street',
                    'AVE': 'Avenue', 'AV': 'Avenue',
                    'LN': 'Lane', 'LA': 'Lane',
                    'DR': 'Drive', 'DRV': 'Drive',
                    'PL': 'Place', 'PLC': 'Place',
                    'CT': 'Court', 'CRT': 'Court',
                    'SQ': 'Square',
                    'TCE': 'Terrace', 'TER': 'Terrace', 'TERR': 'Terrace',
                    'PK': 'Park', 'PRK': 'Park',
                    'CL': 'Close',
                    'GDNS': 'Gardens', 'GDN': 'Garden', 'GARDENS': 'Gardens',
                    'MEWS': 'Mews',
                    'BLVD': 'Boulevard', 'BVLD': 'Boulevard',
                    'HWY': 'Highway', 'HIWAY': 'Highway',
                    'FWY': 'Freeway', 'EXPY': 'Expressway',
                    'CIR': 'Circle', 'WAY': 'Way'
                };
                function expandAbbreviations(q) {
                    let expanded = q;
                    for (const [abbr, full] of Object.entries(abbreviations)) {
                        const regex = new RegExp('\\b' + abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
                        expanded = expanded.replace(regex, full);
                    }
                    return expanded;
                }
                const expandedQuery = expandAbbreviations(query);

                // UK postcode detection
                const ukPostcodeRegex = /\b([A-Z]{1,2}\d{1,2}[A-Z]?\s+\d[A-Z]{2})\b/i;
                let detectedCC = null;
                const pcMatch = query.match(ukPostcodeRegex);
                if (pcMatch) { detectedCC = 'gb'; }
                if (!detectedCC && /\b\d{5}(?:-\d{4})?\b/.test(query)) detectedCC = 'us';

                // Build Nominatim search strategies
                const searchStrategies = [
                    `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=15&dedupe=1&q=${encodeURIComponent(query)}`,
                    expandedQuery !== query ? `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=15&dedupe=1&q=${encodeURIComponent(expandedQuery)}` : null,
                    detectedCC ? `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=15&dedupe=1&countrycodes=${detectedCC}&q=${encodeURIComponent(query)}` : null,
                    `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=15&dedupe=1&q=${encodeURIComponent(query.replace(/[,\.\-#\/]/g, ' ').replace(/\s+/g, ' ').trim())}`,
                    `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=25&q=${encodeURIComponent(expandedQuery !== query ? expandedQuery : query)}`
                ].filter(Boolean);

                let allResults = [];
                for (let si = 0; si < searchStrategies.length; si++) {
                    try {
                        if (si > 0) await delay(1100);
                        const res = await fetch(searchStrategies[si], { headers });
                        if (!res.ok) continue;
                        const results = await res.json();
                        if (results && results.length > 0) {
                            for (const r of results) {
                                if (!allResults.some(existing => existing.place_id === r.place_id)) {
                                    allResults.push(r);
                                }
                            }
                            if (allResults.length >= 3) break;
                        }
                    } catch(e) { continue; }
                }

                data = allResults;

                if (data && data.length > 0) {
                    if (data.length > 1) {
                        const items = data.map(d => ({ ...d, isGoogle: false }));
                        showAutocompleteDropdown(items);
                        return;
                    }
                    const result = data[0];
                    const lat = parseFloat(result.lat);
                    const lon = parseFloat(result.lon);
                    const zoom = getZoomForType(result.type) || getZoomForType(result.class) || 16;
                    const locName = buildLocationName(result.address, result.display_name);
                    showLocationOnMap(lat, lon, locName, zoom);
                } else {
                    alert('Location not found. Try:\n\u2022 Be more specific with the full address\n\u2022 Include the city and country\n\u2022 Or click directly on the map to place a point');
                }
            } catch(err) {
                console.error(err);
                alert('Search failed. Please check your connection and try again.');
            } finally {
                searchBtn.innerHTML = '<i class="fa-solid fa-search"></i>';
                searchBtn.disabled = false;
            }
        });
    }

    // Map Click Logic
    map.on('click', async (e) => {
        const { lat, lng } = e.latlng;
        if(previewMarker) map.removeLayer(previewMarker);

        previewMarker = L.marker([lat, lng]).addTo(map);
        previewMarker.bindPopup('Analyzing...').openPopup();

        let locName = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&zoom=18`, {
                headers: { 'Accept-Language': 'en', 'User-Agent': 'TransrapidExpressAdmin/1.0' }
            });
            const data = await res.json();
            if (data && data.display_name) {
                locName = buildLocationName(data.address, data.display_name);
            }
        } catch(err) {
            console.warn('Reverse geocoding failed:', err);
        }

        const popupContent = document.createElement('div');
        popupContent.innerHTML = `<b>${locName}</b><br><small style="color:rgba(26,29,38,0.55);">${lat.toFixed(4)}, ${lng.toFixed(4)}</small><br>`;
        // Two confirm buttons: one for Stop (bold), one for Transit (subtle)
        const btnRow = document.createElement('div');
        btnRow.style.marginTop = '8px';
        btnRow.style.display = 'flex';
        btnRow.style.gap = '6px';
        btnRow.style.flexWrap = 'wrap';

        const stopBtn = document.createElement('button');
        stopBtn.className = 'btn-primary';
        stopBtn.style.fontSize = '0.8rem';
        stopBtn.style.padding = '6px 12px';
        stopBtn.innerHTML = '<i class="fa-solid fa-location-dot"></i> Add as Stop';
        stopBtn.onclick = () => {
            waypointsData.push({
                lat, lng,
                name: locName,
                time: new Date().toLocaleString(),
                status: waypointsData.length === 0 ? "Shipment Started" : "Transit Update",
                stopType: 'stop'
            });
            currentPositionIndex = waypointsData.length - 1;
            map.removeLayer(previewMarker);
            previewMarker = null;
            updateMapDrawings();
        };

        const transitBtn = document.createElement('button');
        transitBtn.className = 'btn-outline';
        transitBtn.style.fontSize = '0.8rem';
        transitBtn.style.padding = '6px 12px';
        transitBtn.innerHTML = '<i class="fa-solid fa-circle" style="font-size:0.5rem;"></i> Add as Transit';
        transitBtn.onclick = () => {
            waypointsData.push({
                lat, lng,
                name: locName,
                time: new Date().toLocaleString(),
                status: "In transit",
                stopType: 'transit'
            });
            // Don't move current position to a transit point
            map.removeLayer(previewMarker);
            previewMarker = null;
            updateMapDrawings();
        };

        btnRow.appendChild(stopBtn);
        btnRow.appendChild(transitBtn);
        popupContent.appendChild(btnRow);
        previewMarker.bindPopup(popupContent).openPopup();
    });

    // Drawing Helpers
    const undoBtn = document.getElementById('undoMapBtn');
    if (undoBtn) undoBtn.onclick = (e) => {
        e.preventDefault();
        waypointsData.pop();
        // Adjust currentPositionIndex after undo
        if (waypointsData.length === 0) {
            currentPositionIndex = -1;
            destinationIndex = -1;
        } else if (currentPositionIndex >= waypointsData.length) {
            currentPositionIndex = waypointsData.length - 1;
        }
        // Adjust destinationIndex if the removed point was the destination
        if (destinationIndex >= waypointsData.length) {
            destinationIndex = -1;
        }
        updateMapDrawings();
    };

    const clearBtn = document.getElementById('clearMapBtn');
    if (clearBtn) clearBtn.onclick = (e) => {
        e.preventDefault();
        waypointsData = [];
        currentPositionIndex = -1;
        destinationIndex = -1;
        if (previewMarker) { map.removeLayer(previewMarker); previewMarker = null; }
        updateMapDrawings();
    };
}

// Global: Set current position — accessible from onclick in dynamically generated HTML
window.setCurrentPosition = function(index) {
    if (index < 0 || index >= waypointsData.length) return;
    // If this point is already the destination, clear destination
    if (index === destinationIndex) destinationIndex = -1;
    currentPositionIndex = index;
    updateMapDrawings();
};

// Global: Set destination — accessible from onclick in dynamically generated HTML
window.setDestination = function(index) {
    if (index < 0 || index >= waypointsData.length) return;
    const wp = waypointsData[index];
    if (wp.stopType !== 'stop') {
        alert('Only stops can be set as Destination. Make this point a Stop first.');
        return;
    }
    if (index === 0) {
        alert('The first point (Origin) cannot be set as Destination.');
        return;
    }
    if (index === currentPositionIndex) {
        alert('Current Position and Destination cannot be the same point.');
        return;
    }
    destinationIndex = index;
    updateMapDrawings();
};

function updateMapDrawings() {
    markers.forEach(m => map.removeLayer(m));
    markers.length = 0;

    // Remove ALL polylines
    routePolylines.forEach(p => map.removeLayer(p));
    routePolylines = [];

    // Determine which stop-type waypoints are origin, current, dest
    const stopWaypoints = waypointsData.map((wp, i) => ({ ...wp, origIndex: i })).filter(wp => wp.stopType === 'stop');

    // Destination: use explicit destinationIndex if set, otherwise auto-calculate as last stop-type waypoint
    let effectiveDestIdx = -1;
    if (destinationIndex >= 0 && destinationIndex < waypointsData.length && waypointsData[destinationIndex].stopType === 'stop') {
        effectiveDestIdx = destinationIndex;
    } else {
        // Auto-calculate: last stop-type waypoint that isn't origin or current
        for (let si = stopWaypoints.length - 1; si >= 0; si--) {
            const idx = stopWaypoints[si].origIndex;
            if (idx !== 0 && idx !== currentPositionIndex) {
                effectiveDestIdx = idx;
                break;
            }
        }
    }

    waypointsData.forEach((wp, i) => {
        const isStop = wp.stopType === 'stop';
        const isOrigin = (i === 0 && isStop);
        const isCurrent = (i === currentPositionIndex && isStop);
        const isDest = (i === effectiveDestIdx && isStop);

        let iconClass;
        let iconSize;
        let label = wp.name.split(',')[0];

        if (isCurrent && waypointsData.length > 1) {
            iconClass = 'pulse-marker';
            iconSize = [20, 20];
        } else if (isOrigin) {
            iconClass = 'standard-marker origin-marker';
            iconSize = [14, 14];
        } else if (isDest) {
            iconClass = 'standard-marker dest-marker';
            iconSize = [14, 14];
        } else if (isStop) {
            iconClass = 'standard-marker stop-marker';
            iconSize = [14, 14];
        } else {
            // Transit point — subtle small dot
            iconClass = 'transit-marker';
            iconSize = [8, 8];
        }

        const m = L.marker([wp.lat, wp.lng], {
            icon: L.divIcon({
                className: 'custom-div-icon',
                html: `<div class="${iconClass}"></div>`,
                iconSize: iconSize,
                iconAnchor: [iconSize[0] / 2, iconSize[1] / 2] // Center anchor so lines align with point centers
            })
        }).addTo(map);

        // Only show tooltip for stops; transit points get a minimal label on hover
        let tooltipLabel = label;
        let tooltipClass = 'sophisticated-label';
        if (isOrigin) {
            tooltipLabel = 'ORIGIN: ' + label;
            tooltipClass += ' label-origin';
        } else if (isCurrent) {
            tooltipLabel = 'CURRENT: ' + label;
            tooltipClass += ' label-current';
        } else if (isDest) {
            tooltipLabel = 'DESTINATION: ' + label;
            tooltipClass += ' label-dest';
        } else if (isStop) {
            tooltipLabel = 'STOP: ' + label;
        } else {
            tooltipLabel = label; // transit
            tooltipClass += ' transit-label';
        }
        m.bindTooltip(tooltipLabel, { direction: 'top', className: tooltipClass, offset: [0,-10] });
        markers.push(m);
    });

    // Two-color route line: Traveled (origin→current) = light blue dashed, Remaining (current→dest) = gray solid
    if (waypointsData.length > 1 && currentPositionIndex >= 0) {
        const traveledPoints = waypointsData.slice(0, currentPositionIndex + 1).map(w => [w.lat, w.lng]);
        const remainingPoints = waypointsData.slice(currentPositionIndex).map(w => [w.lat, w.lng]);

        // Traveled segment: light blue dashed — more broken pattern
        if (traveledPoints.length > 1) {
            const traveledLine = L.polyline(traveledPoints, { color: '#3B82F6', weight: 1.5, dashArray: '4, 8', opacity: 0.9, lineCap: 'round', lineJoin: 'round' }).addTo(map);
            routePolylines.push(traveledLine);
        }
        // Remaining segment: gray dotted
        if (remainingPoints.length > 1) {
            const remainingLine = L.polyline(remainingPoints, { color: '#78909C', weight: 1.5, dashArray: '3, 7', opacity: 0.7, lineCap: 'round', lineJoin: 'round' }).addTo(map);
            routePolylines.push(remainingLine);
        }
    } else if (waypointsData.length > 1) {
        const defaultLine = L.polyline(waypointsData.map(w => [w.lat, w.lng]), {color: '#3B82F6', weight: 1.5, dashArray: '4, 8', lineCap: 'round', lineJoin: 'round'}).addTo(map);
        routePolylines.push(defaultLine);
    }

    const stopCount = waypointsData.filter(wp => wp.stopType === 'stop').length;
    const transitCount = waypointsData.filter(wp => wp.stopType === 'transit').length;
    document.getElementById('waypointsCount').textContent = `${stopCount} stop${stopCount !== 1 ? 's' : ''}, ${transitCount} transit point${transitCount !== 1 ? 's' : ''}`;

    const list = document.getElementById('timelineList');
    list.innerHTML = '';

    waypointsData.forEach((wp, i) => {
        const isStop = wp.stopType === 'stop';
        const isCurrentPos = (i === currentPositionIndex && isStop);
        const isOrigin = (i === 0 && isStop);
        const isDest = (i === effectiveDestIdx && isStop);

        let positionTag = '';
        if (isOrigin) positionTag = '<span style="font-size:0.7em;color:#4CAF50;border:1px solid #4CAF50;padding:2px 6px;border-radius:10px;margin-left:8px;">ORIGIN</span>';
        if (isCurrentPos) positionTag = '<span style="font-size:0.7em;color:#2196F3;border:1px solid #2196F3;padding:2px 6px;border-radius:10px;margin-left:8px;">CURRENT</span>';
        if (isDest) positionTag = '<span style="font-size:0.7em;color:#F44336;border:1px solid #F44336;padding:2px 6px;border-radius:10px;margin-left:8px;">DEST</span>';
        if (!isStop) positionTag = '<span style="font-size:0.65em;color:#8892b0;border:1px solid rgba(136,146,176,0.4);padding:2px 6px;border-radius:10px;margin-left:8px;">TRANSIT</span>';

        const setAsCurrentBtn = (isStop && !isCurrentPos && i !== 0) ? `<button onclick="setCurrentPosition(${i})" style="margin-top:6px;font-size:0.75rem;background:rgba(33,150,243,0.2);color:#2196F3;border:1px solid rgba(33,150,243,0.4);padding:3px 10px;border-radius:6px;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.background='rgba(33,150,243,0.4)'" onmouseout="this.style.background='rgba(33,150,243,0.2)'"><i class="fa-solid fa-location-crosshairs"></i> Set as Current</button>` : '';

        const setAsDestBtn = (isStop && !isDest && i !== 0 && i !== currentPositionIndex) ? `<button onclick="setDestination(${i})" style="margin-top:4px;font-size:0.75rem;background:rgba(244,67,54,0.2);color:#F44336;border:1px solid rgba(244,67,54,0.4);padding:3px 10px;border-radius:6px;cursor:pointer;transition:all 0.2s;margin-left:4px;" onmouseover="this.style.background='rgba(244,67,54,0.4)'" onmouseout="this.style.background='rgba(244,67,54,0.2)'"><i class="fa-solid fa-flag-checkered"></i> Set as Destination</button>` : '';

        // Toggle stop type button
        const toggleBtn = isStop
            ? `<button onclick="toggleStopType(${i})" style="margin-top:4px;font-size:0.7rem;background:rgba(136,146,176,0.15);color:#8892b0;border:1px solid rgba(136,146,176,0.3);padding:2px 8px;border-radius:6px;cursor:pointer;margin-left:4px;" onmouseover="this.style.background='rgba(136,146,176,0.3)'" onmouseout="this.style.background='rgba(136,146,176,0.15)'"><i class="fa-solid fa-minus"></i> Make Transit</button>`
            : `<button onclick="toggleStopType(${i})" style="margin-top:4px;font-size:0.7rem;background:rgba(255,159,28,0.15);color:#FF9F1C;border:1px solid rgba(255,159,28,0.3);padding:2px 8px;border-radius:6px;cursor:pointer;margin-left:4px;" onmouseover="this.style.background='rgba(255,159,28,0.3)'" onmouseout="this.style.background='rgba(255,159,28,0.15)'"><i class="fa-solid fa-plus"></i> Make Stop</button>`;

        const itemStyle = isCurrentPos
            ? 'border-left-color:#2196F3;background:rgba(33,150,243,0.08);'
            : isStop
                ? 'border-left-color:var(--accent-gold);'
                : 'border-left-color:rgba(136,146,176,0.3);background:rgba(0,0,0,0.1);opacity:0.75;';

        const nameStyle = isStop ? 'font-weight:600;' : 'font-weight:400;color:#8892b0;';

        list.innerHTML += `<div class="stop-item" style="${itemStyle}"><span style="${nameStyle}">${wp.name}</span>${positionTag}<br><small>${wp.time}</small><br><small style="color:#8892b0;">${wp.status || 'Location updated'}</small><br>${setAsCurrentBtn}${setAsDestBtn}${toggleBtn}</div>`;
    });

    // Auto-fit map to show all waypoints with comfortable padding
    if (waypointsData.length > 1 && map) {
        const allPoints = waypointsData.map(w => [w.lat, w.lng]);
        const bounds = L.latLngBounds(allPoints);
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    }
}

// Global: Toggle a waypoint between 'stop' and 'transit'
window.toggleStopType = function(index) {
    if (index < 0 || index >= waypointsData.length) return;
    const wp = waypointsData[index];
    wp.stopType = wp.stopType === 'stop' ? 'transit' : 'stop';

    // If changing FROM stop to transit and this was the current position,
    // move current position to the nearest stop before this one
    if (wp.stopType === 'transit' && index === currentPositionIndex) {
        let found = -1;
        for (let i = waypointsData.length - 1; i >= 0; i--) {
            if (i !== index && waypointsData[i].stopType === 'stop') {
                found = i;
                break;
            }
        }
        currentPositionIndex = found;
    }

    // If changing FROM stop to transit and this was the destination, clear destination
    if (wp.stopType === 'transit' && index === destinationIndex) {
        destinationIndex = -1;
    }

    // If the first waypoint is changed to transit, force it back to stop (origin is always a stop)
    if (index === 0 && wp.stopType === 'transit') {
        wp.stopType = 'stop';
        alert('The first point (Origin) must always be a Stop.');
    }

    updateMapDrawings();
};

// --- Status Loader ---
async function loadDashboardStats(elements) {
    // Wait for Supabase import to complete before querying
    await waitForSupabase();
    let shipmentsDB = {};
    if (supabase) {
        try {
            const { data, error } = await supabase.from('shipments').select('*');
            if (error) console.error('Supabase fetch error:', error);
            if (data) data.forEach(row => shipmentsDB[row.tracking_code] = row.data);
        } catch(e) {
            console.error('Supabase query failed:', e);
        }
    }
    // Always merge localStorage data as fallback/supplement
    const localDB = getShipments();
    for (const [code, data] of Object.entries(localDB)) {
        if (!shipmentsDB[code]) shipmentsDB[code] = data;
    }

    const codes = Object.keys(shipmentsDB);
    document.getElementById('stat-total').textContent = codes.length;

    let inTransit = 0;
    const tbody = document.querySelector('#recentTable tbody');
    if(tbody) {
        tbody.innerHTML = '';
        codes.reverse().slice(0, 5).forEach(code => {
            const s = shipmentsDB[code];
            if (s.pkgStatus === 'In Transit') inTransit++;
            // Determine current location from currentPositionIndex
            const cpIdx = s.currentPositionIndex !== undefined ? s.currentPositionIndex : (s.waypoints ? s.waypoints.length - 1 : -1);
            const currentLoc = (s.waypoints && s.waypoints[cpIdx]) ? s.waypoints[cpIdx].name : 'N/A';
            const tr = document.createElement('tr');
            tr.innerHTML = `<td><strong>${code}</strong></td><td>${s.receiverName || 'N/A'}</td><td>${currentLoc}</td><td><span class="status-badge ${getStatusClass(s.pkgStatus)}">${s.pkgStatus}</span></td><td><button class="btn-outline btn-sm" onclick="editShipment('${code}')">Edit</button></td>`;
            tbody.appendChild(tr);
        });
    }
    document.getElementById('stat-transit').textContent = inTransit;
}

function getStatusClass(status) {
    switch(status) {
        case 'In Transit': return 'transit';
        case 'Delivered': return 'delivered';
        case 'Pending': return 'pending';
        case 'On Hold': return 'pending';
        default: return '';
    }
}

// --- Manage Records ---
async function loadManageRecords(elements) {
    // Wait for Supabase import to complete before querying
    await waitForSupabase();
    let shipmentsDB = {};
    if (supabase) {
        try {
            const { data, error } = await supabase.from('shipments').select('*');
            if (error) console.error('Supabase fetch error:', error);
            if (data) data.forEach(row => shipmentsDB[row.tracking_code] = row.data);
        } catch(e) {
            console.error('Supabase query failed:', e);
        }
    }
    // Always merge localStorage data as fallback/supplement
    const localDB = getShipments();
    for (const [code, data] of Object.entries(localDB)) {
        if (!shipmentsDB[code]) shipmentsDB[code] = data;
    }

    const tbody = document.querySelector('#manageTable tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    const codes = Object.keys(shipmentsDB);

    if (codes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:2rem;">No shipment records found. Create your first shipment to get started.</td></tr>';
        return;
    }

    codes.forEach(code => {
        const s = shipmentsDB[code];
        const cpIdx = s.currentPositionIndex !== undefined ? s.currentPositionIndex : (s.waypoints ? s.waypoints.length - 1 : -1);
        const currentLoc = (s.waypoints && s.waypoints[cpIdx]) ? s.waypoints[cpIdx].name : 'N/A';
        const receiverName = s.receiverName || 'N/A';
        const pkgName = s.pkgName || 'N/A';
        const lastUpdated = s.lastUpdated ? new Date(s.lastUpdated).toLocaleDateString() : 'N/A';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong style="font-family:monospace;letter-spacing:1px;color:var(--accent-gold);">${code}</strong></td>
            <td>${pkgName}</td>
            <td>${receiverName}</td>
            <td>${currentLoc}</td>
            <td><span class="status-badge ${getStatusClass(s.pkgStatus)}">${s.pkgStatus || 'Pending'}</span></td>
            <td>${lastUpdated}</td>
            <td style="white-space:nowrap;">
                <button class="btn-outline btn-sm" onclick="editShipment('${code}')" style="margin-right:4px;"><i class="fa-solid fa-pen-to-square"></i></button>
                <button class="btn-outline btn-sm" onclick="deleteShipmentRecord('${code}')" style="border-color:var(--danger);color:var(--danger);"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Make globally accessible for onclick handlers
window.loadManageRecords = function() { loadManageRecords(); };

// Global function: Delete a shipment record
window.deleteShipmentRecord = async function(trackingCode) {
    if (!confirm(`Delete shipment ${trackingCode}? This action cannot be undone.`)) return;
    const success = await deleteShipment(trackingCode);
    if (success) {
        alert(`Shipment ${trackingCode} deleted successfully.`);
        loadDashboardStats();
        loadManageRecords();
    } else {
        alert('Failed to delete shipment.');
    }
};

// Global function: Edit shipment — pre-fills the create form with existing data
window.editShipment = async function(trackingCode) {
    await waitForSupabase();
    let shipment = null;
    if (supabase) {
        try {
            const { data, error } = await supabase.from('shipments').select('data').eq('tracking_code', trackingCode).single();
            if (error) console.error('Supabase fetch error:', error);
            if (data) shipment = data.data;
        } catch(e) {
            console.error('Supabase query failed:', e);
        }
    }
    if (!shipment) {
        const db = getShipments();
        shipment = db[trackingCode];
    }

    if (!shipment) {
        alert('Shipment not found.');
        return;
    }

    // Switch to Create Shipment tab
    const createTab = document.querySelector('.nav-item[data-tab="create-shipment"]');
    if (createTab) createTab.click();

    // Wait for map to be visible then populate form
    setTimeout(() => {
        // Set the tracking code
        currentTracking = trackingCode;
        currentPin = shipment.pin || '';

        document.getElementById('displayTrk').textContent = trackingCode;
        document.getElementById('displayPin').textContent = shipment.pin || '--';
        document.getElementById('genResultBox').classList.remove('hidden');

        // Fill in form fields
        document.getElementById('pkgName').value = shipment.pkgName || '';
        document.getElementById('pkgBarcode').value = shipment.pkgBarcode || '';
        document.getElementById('pkgWeight').value = shipment.pkgWeight || '';
        document.getElementById('pkgValue').value = shipment.pkgValue || '';
        document.getElementById('pkgDesc').value = shipment.pkgDesc || '';
        document.getElementById('pkgCircumstance').value = shipment.pkgCircumstance || '';
        document.getElementById('pkgTransport').value = shipment.pkgTransport || 'LAND';
        document.getElementById('pkgAgency').value = shipment.pkgAgency || '';
        document.getElementById('pkgStatus').value = shipment.pkgStatus || 'Pending';
        document.getElementById('pkgEstDelivery').value = shipment.pkgEstDelivery || '';
        document.getElementById('senderName').value = shipment.senderName || '';
        document.getElementById('senderEmail').value = shipment.senderEmail || '';
        document.getElementById('senderPhone').value = shipment.senderPhone || '';
        document.getElementById('receiverName').value = shipment.receiverName || '';
        document.getElementById('receiverEmail').value = shipment.receiverEmail || '';
        document.getElementById('receiverPhone').value = shipment.receiverPhone || '';

        // Restore waypoints (ensure backward compatibility: default stopType to 'stop' for old data)
        waypointsData = shipment.waypoints ? shipment.waypoints.map(wp => ({ ...wp, stopType: wp.stopType || 'stop' })) : [];
        currentPositionIndex = shipment.currentPositionIndex !== undefined ? shipment.currentPositionIndex : (waypointsData.length > 0 ? waypointsData.length - 1 : -1);
        destinationIndex = shipment.destinationIndex !== undefined ? shipment.destinationIndex : -1;

        updateMapDrawings();

        // Fit map to show all waypoints
        if (waypointsData.length > 0 && map) {
            const bounds = L.latLngBounds(waypointsData.map(wp => [wp.lat, wp.lng]));
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }, 400);
};
