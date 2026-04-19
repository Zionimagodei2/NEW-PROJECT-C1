import { supabase } from './supabase-config.js';
const ADMIN_HASH = 'edb4c656c930a9681dd2599f9b842b5bfa6548d196c507d4a80c087d4535a580'; // SHA-256 of Pablopablopablo$
const SESSION_KEY = 'transrapid_admin_auth';

// --- Global Variables ---
const STORE_KEY = 'transrapid_shipments';
let map = null;
let waypointsData = [];
let routePolyline = null;
let currentTracking = '';
let currentPin = '';
let previewMarker = null;
const markers = [];
let currentPositionIndex = -1; // -1 means not set; will default to last waypoint

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
                pkgWeight: document.getElementById('pkgWeight').value,
                pkgValue: document.getElementById('pkgValue').value,
                pkgDesc: document.getElementById('pkgDesc').value,
                pkgTransport: document.getElementById('pkgTransport').value,
                pkgStatus: document.getElementById('pkgStatus').value,
                pkgEstDelivery: document.getElementById('pkgEstDelivery').value,
                senderName: document.getElementById('senderName').value,
                senderEmail: document.getElementById('senderEmail').value,
                receiverName: document.getElementById('receiverName').value,
                receiverEmail: document.getElementById('receiverEmail').value,
                pin: currentPin,
                waypoints: waypointsData,
                currentPositionIndex: currentPositionIndex,
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

    map = L.map('adminMap').setView([39.8283, -98.5795], 3);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // Map Search
    const searchBtn = document.getElementById('mapSearchBtn');
    const searchInput = document.getElementById('mapSearchInput');
    if (searchBtn && searchInput) {
        searchBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const query = searchInput.value;
            if(!query) return;
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
                const data = await res.json();
                if (data && data.length > 0) map.flyTo([data[0].lat, data[0].lon], 8);
            } catch(err) { console.error(err); }
        });
    }

    // Map Click Logic
    map.on('click', async (e) => {
        const { lat, lng } = e.latlng;
        if(previewMarker) map.removeLayer(previewMarker);

        previewMarker = L.marker([lat, lng]).addTo(map);
        previewMarker.bindPopup('Analyzing...').openPopup();

        let locName = `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
            const data = await res.json();
            if (data && data.display_name) {
                locName = data.address.city || data.address.town || data.address.state || locName;
            }
        } catch(err) {}

        const popupContent = document.createElement('div');
        popupContent.innerHTML = `<b>${locName}</b><br>`;
        const btn = document.createElement('button');
        btn.className = 'btn-primary';
        btn.style.marginTop = '8px';
        btn.textContent = 'Confirm Stop';
        btn.onclick = () => {
            waypointsData.push({
                lat, lng,
                name: locName,
                time: new Date().toLocaleString(),
                status: waypointsData.length === 0 ? "Shipment Started" : "Transit Update"
            });
            // Default: set current position to the newly added waypoint
            currentPositionIndex = waypointsData.length - 1;
            map.removeLayer(previewMarker);
            previewMarker = null;
            updateMapDrawings();
        };
        popupContent.appendChild(btn);
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
        } else if (currentPositionIndex >= waypointsData.length) {
            currentPositionIndex = waypointsData.length - 1;
        }
        updateMapDrawings();
    };

    const clearBtn = document.getElementById('clearMapBtn');
    if (clearBtn) clearBtn.onclick = (e) => {
        e.preventDefault();
        waypointsData = [];
        currentPositionIndex = -1;
        updateMapDrawings();
    };
}

// Global: Set current position — accessible from onclick in dynamically generated HTML
window.setCurrentPosition = function(index) {
    if (index < 0 || index >= waypointsData.length) return;
    currentPositionIndex = index;
    updateMapDrawings();
};

function updateMapDrawings() {
    markers.forEach(m => map.removeLayer(m));
    markers.length = 0;

    waypointsData.forEach((wp, i) => {
        let iconClass = 'standard-marker';
        let label = wp.name.split(',')[0];

        if (i === 0) {
            iconClass = 'standard-marker origin-marker';
        }
        // Use currentPositionIndex for the pulse marker instead of always the last
        if (i === currentPositionIndex && waypointsData.length > 1) {
            iconClass = 'pulse-marker';
        }

        const m = L.marker([wp.lat, wp.lng], {
            icon: L.divIcon({ className: 'custom-div-icon', html: `<div class="${iconClass}"></div>`, iconSize: [20,20] })
        }).addTo(map);

        // Add label showing position type
        let tooltipLabel = label;
        if (i === 0) tooltipLabel = 'ORIGIN: ' + label;
        if (i === currentPositionIndex) tooltipLabel = 'CURRENT: ' + label;
        if (i === waypointsData.length - 1 && i !== currentPositionIndex && i !== 0) tooltipLabel = 'DEST: ' + label;

        m.bindTooltip(tooltipLabel, { direction: 'top', className: 'sophisticated-label', offset: [0,-10] });
        markers.push(m);
    });

    if (routePolyline) map.removeLayer(routePolyline);
    if (waypointsData.length > 1) {
        routePolyline = L.polyline(waypointsData.map(w => [w.lat, w.lng]), {color: '#FF9F1C', weight: 4, dashArray: '5, 10'}).addTo(map);
    }

    document.getElementById('waypointsCount').textContent = `${waypointsData.length} stops plotted`;
    const list = document.getElementById('timelineList');
    list.innerHTML = '';

    waypointsData.forEach((wp, i) => {
        const isCurrentPos = (i === currentPositionIndex);
        const isOrigin = (i === 0);
        const isLast = (i === waypointsData.length - 1);

        let positionTag = '';
        if (isOrigin) positionTag = '<span style="font-size:0.7em;color:#2ecc71;border:1px solid #2ecc71;padding:2px 6px;border-radius:10px;margin-left:8px;">ORIGIN</span>';
        if (isCurrentPos) positionTag = '<span style="font-size:0.7em;color:#e74c3c;border:1px solid #e74c3c;padding:2px 6px;border-radius:10px;margin-left:8px;">CURRENT</span>';
        if (isLast && !isCurrentPos && !isOrigin && waypointsData.length > 2) positionTag = '<span style="font-size:0.7em;color:#f39c12;border:1px solid #f39c12;padding:2px 6px;border-radius:10px;margin-left:8px;">DEST</span>';

        const setAsCurrentBtn = isCurrentPos ? '' : `<button onclick="setCurrentPosition(${i})" style="margin-top:6px;font-size:0.75rem;background:rgba(231,76,60,0.2);color:#e74c3c;border:1px solid rgba(231,76,60,0.4);padding:3px 10px;border-radius:6px;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.background='rgba(231,76,60,0.4)'" onmouseout="this.style.background='rgba(231,76,60,0.2)'"><i class="fa-solid fa-location-crosshairs"></i> Set as Current Position</button>`;

        list.innerHTML += `<div class="stop-item" style="${isCurrentPos ? 'border-left-color:#e74c3c;background:rgba(231,76,60,0.08);' : ''}"><strong>${wp.name}</strong>${positionTag}<br><small>${wp.time}</small><br><small style="color:#8892b0;">${wp.status || 'Location updated'}</small><br>${setAsCurrentBtn}</div>`;
    });
}

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
        document.getElementById('pkgWeight').value = shipment.pkgWeight || '';
        document.getElementById('pkgValue').value = shipment.pkgValue || '';
        document.getElementById('pkgDesc').value = shipment.pkgDesc || '';
        document.getElementById('pkgTransport').value = shipment.pkgTransport || 'LAND';
        document.getElementById('pkgStatus').value = shipment.pkgStatus || 'Pending';
        document.getElementById('pkgEstDelivery').value = shipment.pkgEstDelivery || '';
        document.getElementById('senderName').value = shipment.senderName || '';
        document.getElementById('senderEmail').value = shipment.senderEmail || '';
        document.getElementById('receiverName').value = shipment.receiverName || '';
        document.getElementById('receiverEmail').value = shipment.receiverEmail || '';

        // Restore waypoints
        waypointsData = shipment.waypoints ? [...shipment.waypoints] : [];
        currentPositionIndex = shipment.currentPositionIndex !== undefined ? shipment.currentPositionIndex : (waypointsData.length > 0 ? waypointsData.length - 1 : -1);

        updateMapDrawings();

        // Fit map to show all waypoints
        if (waypointsData.length > 0 && map) {
            const bounds = L.latLngBounds(waypointsData.map(wp => [wp.lat, wp.lng]));
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }, 400);
};
