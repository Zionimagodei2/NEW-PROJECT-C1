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
        updateMapDrawings();
    };

    const clearBtn = document.getElementById('clearMapBtn');
    if (clearBtn) clearBtn.onclick = (e) => {
        e.preventDefault();
        waypointsData = [];
        updateMapDrawings();
    };
}

function updateMapDrawings() {
    markers.forEach(m => map.removeLayer(m));
    markers.length = 0;
    
    waypointsData.forEach((wp, i) => {
        const isLast = i === waypointsData.length - 1;
        const iconClass = (i === 0) ? 'standard-marker origin-marker' : (isLast && waypointsData.length > 1 ? 'pulse-marker' : 'standard-marker');
        
        const m = L.marker([wp.lat, wp.lng], {
            icon: L.divIcon({ className: 'custom-div-icon', html: `<div class="${iconClass}"></div>`, iconSize: [20,20] })
        }).addTo(map);
        
        m.bindTooltip(wp.name.split(',')[0], { direction: 'top', className: 'sophisticated-label', offset: [0,-10] });
        markers.push(m);
    });

    if (routePolyline) map.removeLayer(routePolyline);
    if (waypointsData.length > 1) {
        routePolyline = L.polyline(waypointsData.map(w => [w.lat, w.lng]), {color: '#FF9F1C', weight: 4, dashArray: '5, 10'}).addTo(map);
    }
    
    document.getElementById('waypointsCount').textContent = `${waypointsData.length} stops plotted`;
    const list = document.getElementById('timelineList');
    list.innerHTML = '';
    waypointsData.forEach(wp => {
        list.innerHTML += `<div class="stop-item"><strong>${wp.name}</strong><br><small>${wp.time}</small></div>`;
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
            const tr = document.createElement('tr');
            tr.innerHTML = `<td><strong>${code}</strong></td><td>${s.receiverName || 'N/A'}</td><td>${s.waypoints[s.waypoints.length-1]?.name || 'N/A'}</td><td><span class="status-badge">${s.pkgStatus}</span></td><td><button class="btn-outline btn-sm">Edit</button></td>`;
            tbody.appendChild(tr);
        });
    }
    document.getElementById('stat-transit').textContent = inTransit;
}
