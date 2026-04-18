// track-sync.js

// Mock Database Fetcher (same as Admin)
const STORE_KEY = 'transrapid_shipments';
function getShipments() {
    const data = localStorage.getItem(STORE_KEY);
    return data ? JSON.parse(data) : {};
}

// Inject Leaflet for the Map
const leafletCSS = document.createElement('link');
leafletCSS.rel = 'stylesheet';
leafletCSS.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
document.head.appendChild(leafletCSS);

const leafletJS = document.createElement('script');
leafletJS.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
document.head.appendChild(leafletJS);

// Global Styles for Custom Track View
const trackStyles = document.createElement('style');
trackStyles.innerHTML = `
    .custom-track-overlay {
        position: fixed; top: 70px; left: 0; width: 100vw; height: calc(100vh - 70px);
        background: #020813; z-index: 100; overflow-y: auto; color: white;
        font-family: inherit; padding-bottom: 50px;
        display: none; /* Hidden by default */
    }
    .track-hero {
        text-align: center; padding: 4rem 1rem; background: linear-gradient(180deg, #0a1628 0%, #020813 100%);
    }
    .track-hero h1 { font-size: 2.5rem; margin-bottom: 1rem; font-weight: bold; }
    .track-hero p { color: #8892b0; margin-bottom: 2rem; max-width: 500px; margin-inline: auto; }
    .search-box {
        max-width: 450px; margin: 0 auto; background: rgba(255,255,255,0.05);
        padding: 2rem; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1);
        text-align: left;
    }
    .search-box input {
        width: 100%; padding: 1rem; margin-bottom: 1rem; border-radius: 8px;
        background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); color: white;
    }
    .search-btn {
        width: 100%; padding: 1rem; border-radius: 8px; background: #FF9F1C;
        color: white; font-weight: bold; font-size: 1.1rem; border: none; cursor: pointer;
    }
    .error-msg { color: #ff4757; margin-top: 1rem; text-align: center; display: none; }
    
    /* Result View */
    .result-view { max-width: 800px; margin: 0 auto; padding: 2rem 1rem; display: none; }
    .result-header { border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1.5rem; margin-bottom: 1.5rem; }
    .status-card {
        background: rgba(255,255,255,0.05); padding: 1.5rem; border-radius: 12px;
        display: flex; justify-content: space-between; align-items: center; border: 1px solid rgba(255,159,28,0.3);
    }
    .status-badge { color: #FF9F1C; font-weight: bold; font-size: 1.25rem; }
    
    .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem; }
    .info-group { margin-bottom: 1rem; }
    .info-label { color: #8892b0; font-size: 0.85rem; display: block; margin-bottom: 0.2rem; }
    .info-val { font-weight: 500; }
    
    .map-container { height: 400px; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); margin-top: 2rem; }
    
    .timeline { margin-top: 2rem; border-left: 2px solid rgba(255,255,255,0.1); padding-left: 1.5rem; }
    .timeline-item { position: relative; margin-bottom: 2rem; }
    .timeline-item::before { content: ''; position: absolute; left: -1.8rem; top: 0; width: 12px; height: 12px; border-radius: 50%; background: #FF9F1C; }
    .timeline-item h4 { color: #FF9F1C; margin-bottom: 0.2rem; }
    .timeline-date { font-size: 0.8rem; color: #8892b0; margin-bottom: 0.5rem; }
    
    /* Map Marker Animations */
    .pulse-marker-client {
        background: #e74c3c; border-radius: 50%; width: 20px; height: 20px;
        border: 3px solid white; box-shadow: 0 0 10px rgba(231, 76, 60, 0.8);
        position: relative; transform: translate(-50%, -50%);
    }
    .pulse-marker-client::before {
        content: ''; position: absolute; top: -10px; left: -10px; right: -10px; bottom: -10px;
        border: 2px solid #e74c3c; border-radius: 50%;
        animation: beckon 1.5s infinite ease-out;
    }
    @keyframes beckon { 0% { transform: scale(0.5); opacity: 1; } 100% { transform: scale(2); opacity: 0; } }
    
    .standard-marker-client {
        background: #3498db; border-radius: 50%; width: 14px; height: 14px;
        border: 2px solid white; transform: translate(-50%, -50%);
    }
    .origin-marker-client { background: #2ecc71; border-color: white; }

    .sophisticated-label {
        background: rgba(10, 22, 40, 0.85);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 159, 28, 0.5);
        color: #fff;
        font-size: 0.8rem;
        font-weight: 600;
        font-family: inherit;
        padding: 4px 10px;
        border-radius: 12px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    }
    .sophisticated-label::before { display: none; }

    /* == Responsive Adjustments == */
    @media (max-width: 768px) {
        .track-hero h1 { font-size: 1.8rem; }
        .details-grid { grid-template-columns: 1fr; gap: 1rem; }
        .status-card { flex-direction: column; text-align: center; gap: 1rem; }
        .status-card div { text-align: center !important; }
        .map-container { height: 300px; }
    }
    @media (max-width: 480px) {
        .search-box { padding: 1.5rem; }
        .track-hero { padding: 2rem 1rem; }
    }
    .close-track-btn {
        position: fixed; top: 15px; right: 20px; z-index: 101;
        background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);
        color: white; padding: 6px 12px; border-radius: 8px; cursor: pointer;
        font-weight: bold; backdrop-filter: blur(5px);
        transition: all 0.2s;
    }
    .close-track-btn:hover { background: rgba(255,255,255,0.2); }
`;
document.head.appendChild(trackStyles);

// Overlay UI HTML
const overlay = document.createElement('div');
overlay.className = 'custom-track-overlay';
overlay.style.display = 'none'; // Explicitly hide on creation
overlay.innerHTML = `
    <button class="close-track-btn" id="ts-close">Close ×</button>
    <!-- Search View -->
    <div id="ts-search-view" class="track-hero">
        <h1 style="color: #ffffff;">Track Your Shipment</h1>
        <p>Enter your tracking code and PIN to view real-time location and status updates for your shipment.</p>
        <div class="search-box">
            <input type="text" id="ts-code" placeholder="Tracking Code (e.g. TR-XXX)">
            <input type="password" id="ts-pin" placeholder="Secret PIN">
            <button class="search-btn" id="ts-submit">Track Shipment</button>
            <p class="error-msg" id="ts-error">Invalid tracking code or PIN.</p>
        </div>
    </div>

    <!-- Result View -->
    <div id="ts-result-view" class="result-view">
        <div class="result-header">
            <h2 style="color: #ffffff;">SHIPMENT DETAILS</h2>
            <p>Tracking Code: <strong style="color: #FF9F1C;" id="res-code">--</strong></p>
        </div>
        
        <div class="status-card">
            <div>
                <span class="info-label">CURRENT STATUS</span>
                <div class="status-badge" id="res-status">Pending</div>
            </div>
            <div style="text-align: right;">
                <span class="info-label">ESTIMATED DELIVERY</span>
                <div class="info-val" id="res-date">--</div>
            </div>
        </div>

        <h3 style="margin: 2rem 0 1rem; color: #ffffff;">PRODUCT INFORMATION</h3>
        <div class="details-grid">
            <div>
                <div class="info-group"><span class="info-label">Name</span><span class="info-val" id="res-name">--</span></div>
                <div class="info-group"><span class="info-label">Weight</span><span class="info-val" id="res-weight">--</span></div>
                <div class="info-group"><span class="info-label">Description</span><span class="info-val" id="res-desc">--</span></div>
                <div class="info-group"><span class="info-label">Declared Value</span><span class="info-val" id="res-value">--</span></div>
            </div>
            <div>
                <div class="info-group"><span class="info-label">Transportation</span><span class="info-val" id="res-transport">--</span></div>
                <div class="info-group"><span class="info-label">Sender</span><span class="info-val" id="res-sender">--</span></div>
                <div class="info-group"><span class="info-label">Receiver</span><span class="info-val" id="res-receiver">--</span></div>
            </div>
        </div>

        <h3 style="margin: 2rem 0 1rem; color: #ffffff;">LIVE SHIPMENT MAP</h3>
        <p style="color: #8892b0; font-size: 0.9rem;" id="res-current-loc">Current Location: --</p>
        <div id="track-map" class="map-container"></div>

        <h3 style="margin: 2rem 0 1rem; color: #ffffff;">SHIPMENT TIMELINE</h3>
        <div class="timeline" id="res-timeline">
            <!-- JS populated -->
        </div>
    </div>
`;

// Wait for DOM to finish then inject logic
window.addEventListener('DOMContentLoaded', () => {
    // Append our overlay right to the body 
    document.body.appendChild(overlay);

    // Auto-show logic (unless disabled)
    const path = window.location.pathname;
    if (!window.DISABLE_TRACK_OVERLAY && (path.includes('track.html') || path.endsWith('/track'))) {
        overlay.style.display = 'block';
    }

    // Global toggle logic for "Track Now" buttons
    document.querySelectorAll('a[href*="track.html"], button, a').forEach(el => {
        const text = el.textContent || '';
        if (text.includes('Track Now') || text.includes('Track Shipment')) {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                overlay.style.display = 'block';
                document.body.style.overflow = 'hidden'; // Lock scroll
                window.scrollTo({ top: 0, behavior: 'smooth' });
                if (window.history.pushState) {
                    window.history.pushState(null, null, 'track.html');
                }
            });
        }
    });

    const closeBtn = document.getElementById('ts-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            overlay.style.display = 'none';
            document.body.style.overflow = ''; // Unlock scroll
            // Optional: return to previous URL if we changed it
            if (window.history.back && window.location.pathname.includes('track.html')) {
                // window.history.back(); // This might be too aggressive
            }
        });
    }

    const btn = document.getElementById('ts-submit');
    btn.addEventListener('click', async () => {
        const code = document.getElementById('ts-code').value.trim();
        const pin = document.getElementById('ts-pin').value.trim();
        if (!code || !pin) return;

        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Locating...';

        try {
            // Import supabase from config
            const { supabase } = await import('./supabase-config.js');
            let shipment = null;

            if (supabase) {
                const { data, error } = await supabase
                    .from('shipments')
                    .select('data')
                    .eq('tracking_code', code)
                    .single();
                
                if (data) {
                    shipment = data.data;
                }
            } else {
                // Fallback local memory
                const db = getShipments();
                shipment = db[code];
            }

            if (shipment && shipment.pin === pin) {
                document.getElementById('ts-error').style.display = 'none';
                renderShipment(code, shipment);
            } else {
                document.getElementById('ts-error').style.display = 'block';
                document.getElementById('ts-error').textContent = "Invalid Tracking Code or PIN.";
            }
        } catch (err) {
            console.error("Supabase error:", err);
            document.getElementById('ts-error').style.display = 'block';
            document.getElementById('ts-error').textContent = "Connection error. Please try again.";
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Track Shipment';
        }
    });

    function renderShipment(code, ship) {
        document.getElementById('ts-search-view').style.display = 'none';
        document.getElementById('ts-result-view').style.display = 'block';

        document.getElementById('res-code').textContent = code;
        document.getElementById('res-status').textContent = ship.pkgStatus || 'Pending';
        document.getElementById('res-date').textContent = ship.pkgEstDelivery || 'Unknown';
        
        document.getElementById('res-name').textContent = ship.pkgName || 'Unknown';
        document.getElementById('res-weight').textContent = ship.pkgWeight || 'N/A';
        document.getElementById('res-desc').textContent = ship.pkgDesc || 'Unavailable';
        document.getElementById('res-value').textContent = ship.pkgValue || 'N/A';
        document.getElementById('res-transport').textContent = ship.pkgTransport || 'LAND';
        
        document.getElementById('res-sender').textContent = ship.senderName || 'N/A';
        document.getElementById('res-receiver').textContent = ship.receiverName || 'N/A';

        const lastLoc = ship.waypoints.length > 0 ? ship.waypoints[ship.waypoints.length-1].name : 'Unknown';
        document.getElementById('res-current-loc').textContent = `Current Location: ${lastLoc}`;

        // Populate Timeline
        const tlist = document.getElementById('res-timeline');
        tlist.innerHTML = '';
        const wps = [...ship.waypoints].reverse(); // newest first
        wps.forEach((wp, index) => {
            const isLatest = index === 0;
            tlist.innerHTML += `
                <div class="timeline-item">
                    <h4>${wp.name} ${isLatest ? '<span style="font-size:0.7em;color:#2ecc71;border:1px solid #2ecc71;padding:2px 6px;border-radius:10px;margin-left:10px;">CURRENT</span>' : ''}</h4>
                    <div class="timeline-date">${wp.time}</div>
                    <p style="color:#8892b0;font-size:0.85rem;">${wp.status || 'Location updated'}</p>
                </div>
            `;
        });

        // Init Map
        setTimeout(() => {
            initMap(ship.waypoints);
        }, 500);
    }

    function initMap(waypoints) {
        if (!waypoints || waypoints.length === 0) return;
        
        let center = [waypoints[waypoints.length-1].lat, waypoints[waypoints.length-1].lng];
        
        const map = L.map('track-map').setView(center, 5); 
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        const latlngs = waypoints.map(wp => [wp.lat, wp.lng]);

        waypoints.forEach((wp, i) => {
            const isFirst = i === 0;
            const isLast = i === waypoints.length-1;
            
            let markerClass = 'standard-marker-client';
            if (isFirst) markerClass = 'standard-marker-client origin-marker-client';
            if (isLast && waypoints.length > 1) markerClass = 'pulse-marker-client';

            const customIcon = L.divIcon({
                className: 'custom-div-icon',
                html: `<div class="${markerClass}"></div>`,
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });

            const m = L.marker([wp.lat, wp.lng], { icon: customIcon }).addTo(map);
            m.bindTooltip(wp.name.split(',')[0], {
                permanent: false,
                direction: 'top',
                className: 'sophisticated-label',
                offset: [0, -10]
            });
        });

        if (latlngs.length > 1) {
            L.polyline(latlngs, {color: '#FF9F1C', weight: 4, dashArray: '5, 10'}).addTo(map);
        }
    }
});
