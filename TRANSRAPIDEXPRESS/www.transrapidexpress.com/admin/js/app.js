import { supabase } from './supabase-config.js';
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
let originIndex = 0; // Index of the Origin waypoint (default: 0, first stop)
let currentPositionIndex = -1; // -1 means not set; will default to last waypoint
let destinationIndex = -1; // -1 means not set; will auto-calculate as last stop-type waypoint

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

// --- Security Helpers ---
async function hashString(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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
document.addEventListener('DOMContentLoaded', () => {
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
        elements.loginBtn.addEventListener('click', async () => {
            const inputVal = elements.adminPassphrase.value.trim();
            const inputHash = await hashString(inputVal);

            if (inputHash === ADMIN_HASH) {
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
                originIndex: originIndex,
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
});

// --- Map Logic Function ---
function setupMap() {
    if (map) return; // Already initialized

    const mapContainer = document.getElementById('adminMap');
    if (!mapContainer) return;

    map = L.map('adminMap').setView([39.8283, -98.5795], 4);
    // Use CARTO Voyager tiles for detailed, clean street-level mapping
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19
    }).addTo(map);

    // Map Search
    const searchBtn = document.getElementById('mapSearchBtn');
    const searchInput = document.getElementById('mapSearchInput');
    if (searchBtn && searchInput) {
        // Allow Enter key to search
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); searchBtn.click(); }
        });

        searchBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const query = searchInput.value.trim();
            if(!query) return;
            searchBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            searchBtn.disabled = true;
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&dedupe=1&q=${encodeURIComponent(query)}`, {
                    headers: { 'Accept-Language': 'en' }
                });
                const data = await res.json();
                if (data && data.length > 0) {
                    const result = data[0];
                    const lat = parseFloat(result.lat);
                    const lon = parseFloat(result.lon);
                    const zoom = getZoomForType(result.type) || getZoomForType(result.class) || 16;
                    map.flyTo([lat, lon], zoom, { duration: 1.5 });
                    if(previewMarker) map.removeLayer(previewMarker);
                    previewMarker = L.marker([lat, lon]).addTo(map);
                    const locName = buildLocationName(result.address, result.display_name);
                    showAddPointPopup(lat, lon, locName);
                } else {
                    alert('Location not found. Try a different search term or be more specific (e.g., "123 Main St, Dallas, TX").');
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
                headers: { 'Accept-Language': 'en' }
            });
            const data = await res.json();
            if (data && data.display_name) {
                locName = buildLocationName(data.address, data.display_name);
            }
        } catch(err) {
            console.warn('Reverse geocoding failed:', err);
        }

        showAddPointPopup(lat, lng, locName);
    });

    // Shared function to show the "Add as Stop" / "Add as Transit" popup
    function showAddPointPopup(lat, lng, locName) {
        const popupContent = document.createElement('div');
        popupContent.innerHTML = `<b>${locName}</b><br><small style="color:#8892b0;">${lat.toFixed(4)}, ${lng.toFixed(4)}</small><br>`;
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
            // If this is the first waypoint, set it as origin and current
            if (waypointsData.length === 1) {
                originIndex = 0;
                currentPositionIndex = 0;
            } else {
                currentPositionIndex = waypointsData.length - 1;
            }
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
            map.removeLayer(previewMarker);
            previewMarker = null;
            updateMapDrawings();
        };

        btnRow.appendChild(stopBtn);
        btnRow.appendChild(transitBtn);
        popupContent.appendChild(btnRow);
        previewMarker.bindPopup(popupContent).openPopup();
    }

    // Drawing Helpers
    const undoBtn = document.getElementById('undoMapBtn');
    if (undoBtn) undoBtn.onclick = (e) => {
        e.preventDefault();
        waypointsData.pop();
        // Adjust indices after undo
        if (waypointsData.length === 0) {
            originIndex = 0;
            currentPositionIndex = -1;
            destinationIndex = -1;
        } else {
            if (originIndex >= waypointsData.length) originIndex = 0;
            if (currentPositionIndex >= waypointsData.length) currentPositionIndex = waypointsData.length - 1;
            if (destinationIndex >= waypointsData.length) destinationIndex = -1;
        }
        updateMapDrawings();
    };

    const clearBtn = document.getElementById('clearMapBtn');
    if (clearBtn) clearBtn.onclick = (e) => {
        e.preventDefault();
        waypointsData = [];
        originIndex = 0;
        currentPositionIndex = -1;
        destinationIndex = -1;
        if (previewMarker) { map.removeLayer(previewMarker); previewMarker = null; }
        updateMapDrawings();
    };
}

// Global: Set origin — accessible from onclick in dynamically generated HTML
window.setOrigin = function(index) {
    if (index < 0 || index >= waypointsData.length) return;
    const wp = waypointsData[index];
    if (wp.stopType !== 'stop') {
        alert('Only stops can be set as Origin. Make this point a Stop first.');
        return;
    }
    if (index === destinationIndex) {
        alert('Origin and Destination cannot be the same point.');
        return;
    }
    originIndex = index;
    updateMapDrawings();
};

// Global: Set current position — accessible from onclick in dynamically generated HTML
window.setCurrentPosition = function(index) {
    if (index < 0 || index >= waypointsData.length) return;
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
    if (index === originIndex) {
        alert('Origin and Destination cannot be the same point.');
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

    // Ensure originIndex points to a valid stop
    if (originIndex < 0 || originIndex >= waypointsData.length || waypointsData[originIndex]?.stopType !== 'stop') {
        // Default: first stop-type waypoint
        if (stopWaypoints.length > 0) originIndex = stopWaypoints[0].origIndex;
        else originIndex = 0;
    }

    // Destination: use explicit destinationIndex if set, otherwise auto-calculate as last stop-type waypoint
    let effectiveDestIdx = -1;
    if (destinationIndex >= 0 && destinationIndex < waypointsData.length && waypointsData[destinationIndex].stopType === 'stop') {
        effectiveDestIdx = destinationIndex;
    } else {
        // Auto-calculate: last stop-type waypoint that isn't origin or current
        for (let si = stopWaypoints.length - 1; si >= 0; si--) {
            const idx = stopWaypoints[si].origIndex;
            if (idx !== originIndex && idx !== currentPositionIndex) {
                effectiveDestIdx = idx;
                break;
            }
        }
    }

    waypointsData.forEach((wp, i) => {
        const isStop = wp.stopType === 'stop';
        const isOrigin = (i === originIndex && isStop);
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
        if (isOrigin) tooltipLabel = 'ORIGIN: ' + label;
        else if (isCurrent) tooltipLabel = 'CURRENT: ' + label;
        else if (isDest) tooltipLabel = 'DESTINATION: ' + label;
        else if (isStop) tooltipLabel = 'STOP: ' + label;
        else tooltipLabel = label; // transit

        const tooltipClass = isStop ? 'sophisticated-label' : 'sophisticated-label transit-label';
        m.bindTooltip(tooltipLabel, { direction: 'top', className: tooltipClass, offset: [0,-10] });
        markers.push(m);
    });

    // Two-color route line: Traveled (origin→current) = light blue dashed, Remaining (current→dest) = gray solid
    if (waypointsData.length > 1 && currentPositionIndex >= 0) {
        const traveledPoints = waypointsData.slice(0, currentPositionIndex + 1).map(w => [w.lat, w.lng]);
        const remainingPoints = waypointsData.slice(currentPositionIndex).map(w => [w.lat, w.lng]);

        // Traveled segment: light blue dashed
        if (traveledPoints.length > 1) {
            const traveledLine = L.polyline(traveledPoints, { color: '#64B5F6', weight: 3, dashArray: '8, 12', opacity: 0.9 }).addTo(map);
            routePolylines.push(traveledLine);
        }
        // Remaining segment: gray solid
        if (remainingPoints.length > 1) {
            const remainingLine = L.polyline(remainingPoints, { color: '#78909C', weight: 3, opacity: 0.7 }).addTo(map);
            routePolylines.push(remainingLine);
        }
    } else if (waypointsData.length > 1) {
        const defaultLine = L.polyline(waypointsData.map(w => [w.lat, w.lng]), {color: '#64B5F6', weight: 3, dashArray: '8, 12'}).addTo(map);
        routePolylines.push(defaultLine);
    }

    const stopCount = waypointsData.filter(wp => wp.stopType === 'stop').length;
    const transitCount = waypointsData.filter(wp => wp.stopType === 'transit').length;
    document.getElementById('waypointsCount').textContent = `${stopCount} stop${stopCount !== 1 ? 's' : ''}, ${transitCount} transit point${transitCount !== 1 ? 's' : ''}`;

    // Update the timeline list
    const list = document.getElementById('timelineList');
    list.innerHTML = '';

    waypointsData.forEach((wp, i) => {
        const isStop = wp.stopType === 'stop';
        const isCurrentPos = (i === currentPositionIndex && isStop);
        const isOrigin = (i === originIndex && isStop);
        const isDest = (i === effectiveDestIdx && isStop);

        // Position tag (badge)
        let positionTag = '';
        if (isOrigin) positionTag = '<span class="position-tag origin-tag"><i class="fa-solid fa-house" style="font-size:0.6em;"></i> ORIGIN</span>';
        else if (isCurrentPos) positionTag = '<span class="position-tag current-tag"><i class="fa-solid fa-location-crosshairs" style="font-size:0.6em;"></i> CURRENT</span>';
        else if (isDest) positionTag = '<span class="position-tag dest-tag"><i class="fa-solid fa-flag-checkered" style="font-size:0.6em;"></i> DESTINATION</span>';
        else if (!isStop) positionTag = '<span class="position-tag transit-tag">TRANSIT</span>';

        // Action buttons: Set as Origin, Set as Current, Set as Destination
        let actionBtns = '';

        // "Set as Origin" button — available for stops that aren't already origin
        if (isStop && !isOrigin) {
            actionBtns += `<button class="wp-action-btn set-origin" onclick="setOrigin(${i})"><i class="fa-solid fa-house"></i> Set as Origin</button>`;
        }

        // "Set as Current" button — available for stops that aren't already current
        if (isStop && !isCurrentPos) {
            actionBtns += `<button class="wp-action-btn set-current" onclick="setCurrentPosition(${i})"><i class="fa-solid fa-location-crosshairs"></i> Set as Current</button>`;
        }

        // "Set as Destination" button — available for stops that aren't already destination
        if (isStop && !isDest) {
            actionBtns += `<button class="wp-action-btn set-dest" onclick="setDestination(${i})"><i class="fa-solid fa-flag-checkered"></i> Set as Destination</button>`;
        }

        // Toggle stop type button
        if (isStop) {
            actionBtns += `<button class="wp-action-btn toggle-type" onclick="toggleStopType(${i})"><i class="fa-solid fa-minus"></i> Make Transit</button>`;
        } else {
            actionBtns += `<button class="wp-action-btn make-stop" onclick="toggleStopType(${i})"><i class="fa-solid fa-plus"></i> Make Stop</button>`;
        }

        // Item style
        let itemClasses = 'stop-item';
        if (isCurrentPos) itemClasses += ' is-current';
        else if (isOrigin) itemClasses += ' is-origin';
        else if (isDest) itemClasses += ' is-dest';
        else if (!isStop) itemClasses += ' is-transit';

        const nameStyle = isStop ? 'font-weight:600;' : 'font-weight:400;color:#8892b0;';

        list.innerHTML += `<div class="${itemClasses}">
            <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;">
                <span style="${nameStyle}">${wp.name}</span>
                ${positionTag}
            </div>
            <small style="color:var(--text-muted);">${wp.time}</small><br>
            <small style="color:#8892b0;">${wp.status || 'Location updated'}</small>
            <div class="wp-actions">${actionBtns}</div>
        </div>`;
    });
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

    // If changing FROM stop to transit and this was the origin, move origin to first stop
    if (wp.stopType === 'transit' && index === originIndex) {
        const firstStop = waypointsData.findIndex((w, i) => i !== index && w.stopType === 'stop');
        originIndex = firstStop >= 0 ? firstStop : 0;
    }

    // If changing TO stop and no origin is set, set this as origin
    if (wp.stopType === 'stop' && originIndex < 0) {
        originIndex = index;
    }

    updateMapDrawings();
};

// --- Status Loader ---
async function loadDashboardStats(elements) {
    let shipmentsDB = {};
    if (supabase) {
        const { data } = await supabase.from('shipments').select('*');
        if (data) data.forEach(row => shipmentsDB[row.tracking_code] = row.data);
    } else {
        shipmentsDB = getShipments();
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
    let shipmentsDB = {};
    if (supabase) {
        const { data } = await supabase.from('shipments').select('*');
        if (data) data.forEach(row => shipmentsDB[row.tracking_code] = row.data);
    } else {
        shipmentsDB = getShipments();
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
    let shipment = null;
    if (supabase) {
        const { data } = await supabase.from('shipments').select('data').eq('tracking_code', trackingCode).single();
        if (data) shipment = data.data;
    } else {
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
        originIndex = shipment.originIndex !== undefined ? shipment.originIndex : 0;
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
