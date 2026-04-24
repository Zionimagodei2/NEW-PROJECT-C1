// track-sync-v3.js — Tracking functionality for track.html
// OVERLAY COMPLETELY REMOVED: No more overlay, no more click interceptors.
// "Track Now" and "Track Shipment" buttons now navigate to track.html normally.

const STORE_KEY = 'transrapid_shipments';
function getShipments() {
    const data = localStorage.getItem(STORE_KEY);
    return data ? JSON.parse(data) : {};
}

// Only load Leaflet and tracking styles on the track page
const isTrackPage = window.location.pathname.includes('track.html') || window.location.pathname.endsWith('/track');

if (isTrackPage) {
    // Inject Leaflet for the Map
    const leafletCSS = document.createElement('link');
    leafletCSS.rel = 'stylesheet';
    leafletCSS.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(leafletCSS);

    const leafletJS = document.createElement('script');
    leafletJS.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    document.head.appendChild(leafletJS);

    // Tracking result styles
    const trackStyles = document.createElement('style');
    trackStyles.innerHTML = `
        .track-result-container {
            max-width: 800px;
            margin: 2rem auto;
            padding: 0 1rem;
            color: white;
            display: none;
        }
        .track-result-container.active {
            display: block;
        }
        .result-header {
            border-bottom: 1px solid rgba(255,255,255,0.1);
            padding-bottom: 1.5rem;
            margin-bottom: 1.5rem;
        }
        .status-card {
            background: rgba(255,255,255,0.05);
            padding: 1.5rem;
            border-radius: 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border: 1px solid rgba(255,159,28,0.3);
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

        .track-error-msg {
            color: #ff4757;
            margin-top: 1rem;
            text-align: center;
            display: none;
            font-size: 0.9rem;
        }

        .track-back-btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 1.5rem;
            padding: 8px 16px;
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.2);
            color: white;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            font-size: 0.85rem;
            transition: background 0.2s;
        }
        .track-back-btn:hover { background: rgba(255,255,255,0.2); }

        @media (max-width: 768px) {
            .details-grid { grid-template-columns: 1fr; gap: 1rem; }
            .status-card { flex-direction: column; text-align: center; gap: 1rem; }
            .status-card div { text-align: center !important; }
            .map-container { height: 300px; }
        }
    `;
    document.head.appendChild(trackStyles);
}

// Initialize tracking on track.html only
window.addEventListener('DOMContentLoaded', () => {
    if (!isTrackPage) return;

    const mainSubmit = document.getElementById('main-track-submit');
    const mainCode = document.getElementById('main-track-code');
    const mainPin = document.getElementById('main-track-pin');
    const trackFormArea = document.querySelector('.track-card');

    if (!mainSubmit || !mainCode || !mainPin) return;

    // Create result container and insert after the form
    const resultContainer = document.createElement('div');
    resultContainer.className = 'track-result-container';
    resultContainer.id = 'track-result-container';
    resultContainer.innerHTML = `
        <button class="track-back-btn" id="track-back-btn">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>
            Track Another Shipment
        </button>
        <div class="result-header">
            <h2 style="color: #ffffff; font-size: 1.5rem; font-weight: bold;">SHIPMENT DETAILS</h2>
            <p style="color: #94a3b8;">Tracking Code: <strong style="color: #FF9F1C;" id="res-code">--</strong></p>
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
        <div class="timeline" id="res-timeline"></div>
    `;

    // Insert result container after the tracking form
    if (trackFormArea) {
        trackFormArea.parentNode.insertBefore(resultContainer, trackFormArea.nextSibling);
    } else {
        document.querySelector('.track-page-container').appendChild(resultContainer);
    }

    // Error message element
    let errorMsg = document.getElementById('track-error-msg');
    if (!errorMsg) {
        errorMsg = document.createElement('p');
        errorMsg.className = 'track-error-msg';
        errorMsg.id = 'track-error-msg';
        if (trackFormArea) {
            trackFormArea.appendChild(errorMsg);
        }
    }

    // Back button - show form, hide results
    const backBtn = document.getElementById('track-back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            resultContainer.classList.remove('active');
            if (trackFormArea) trackFormArea.style.display = 'block';
            document.querySelector('.credentials-info').style.display = 'block';
            // Reset form
            mainCode.value = '';
            mainPin.value = '';
            errorMsg.style.display = 'none';
            // Remove map
            const mapEl = document.getElementById('track-map');
            if (mapEl) mapEl.innerHTML = '';
        });
    }

    // Form submit handler
    mainSubmit.addEventListener('click', async () => {
        const code = mainCode.value.trim();
        const pin = mainPin.value.trim();

        if (!code || !pin) {
            errorMsg.textContent = 'Please enter both tracking code and PIN.';
            errorMsg.style.display = 'block';
            return;
        }

        mainSubmit.disabled = true;
        mainSubmit.innerHTML = 'Locating... <svg class="w-4 h-4 animate-spin inline" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>';

        try {
            let shipment = null;

            try {
                const { supabase } = await import('./supabase-config.js');
                if (supabase) {
                    const { data, error } = await supabase
                        .from('shipments')
                        .select('data')
                        .eq('tracking_code', code)
                        .single();

                    if (data) {
                        shipment = data.data;
                    }
                }
            } catch (supabaseErr) {
                console.warn('Supabase unavailable, falling back to localStorage:', supabaseErr);
            }

            if (!shipment) {
                const db = getShipments();
                shipment = db[code];
            }

            if (shipment && shipment.pin === pin) {
                errorMsg.style.display = 'none';
                renderShipment(code, shipment);
            } else {
                errorMsg.textContent = 'Invalid Tracking Code or PIN. Please check your credentials and try again.';
                errorMsg.style.display = 'block';
            }
        } catch (err) {
            console.error('Tracking error:', err);
            errorMsg.textContent = 'Connection error. Please try again.';
            errorMsg.style.display = 'block';
        } finally {
            mainSubmit.disabled = false;
            mainSubmit.innerHTML = 'Track Shipment <svg class="w-4 h-4 inline" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>';
        }
    });

    function renderShipment(code, ship) {
        // Hide form, show results
        if (trackFormArea) trackFormArea.style.display = 'none';
        document.querySelector('.credentials-info').style.display = 'none';
        resultContainer.classList.add('active');

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

        // Use currentPositionIndex to determine the current location
        const cpIdx = ship.currentPositionIndex !== undefined ? ship.currentPositionIndex : (ship.waypoints ? ship.waypoints.length - 1 : -1);
        const currentLoc = (ship.waypoints && ship.waypoints[cpIdx]) ? ship.waypoints[cpIdx].name : (ship.waypoints && ship.waypoints.length > 0 ? ship.waypoints[ship.waypoints.length - 1].name : 'Unknown');
        document.getElementById('res-current-loc').textContent = 'Current Location: ' + currentLoc;

        // Populate Timeline
        const tlist = document.getElementById('res-timeline');
        tlist.innerHTML = '';
        if (ship.waypoints) {
            const wps = [...ship.waypoints].reverse();
            // In the reversed array, the "current" item index is reversed too
            const reversedCpIdx = ship.waypoints.length - 1 - cpIdx;
            wps.forEach((wp, index) => {
                const isCurrent = index === reversedCpIdx;
                const isOrigin = index === wps.length - 1; // last in reversed = first in original
                let badge = '';
                if (isCurrent) badge = '<span style="font-size:0.7em;color:#e74c3c;border:1px solid #e74c3c;padding:2px 6px;border-radius:10px;margin-left:10px;">CURRENT POSITION</span>';
                if (isOrigin && !isCurrent) badge = '<span style="font-size:0.7em;color:#2ecc71;border:1px solid #2ecc71;padding:2px 6px;border-radius:10px;margin-left:10px;">ORIGIN</span>';
                tlist.innerHTML += '<div class="timeline-item"><h4>' + wp.name + ' ' + badge + '</h4><div class="timeline-date">' + wp.time + '</div><p style="color:#8892b0;font-size:0.85rem;">' + (wp.status || 'Location updated') + '</p></div>';
            });
        }

        // Init Map — pass currentPositionIndex so the map knows which waypoint is current
        setTimeout(() => {
            initMap(ship.waypoints, cpIdx);
        }, 500);
    }

    function initMap(waypoints, cpIdx) {
        if (!waypoints || waypoints.length === 0) return;
        if (typeof L === 'undefined') {
            setTimeout(() => initMap(waypoints, cpIdx), 300);
            return;
        }

        // Use provided cpIdx or default to last waypoint for backward compatibility
        if (cpIdx === undefined || cpIdx === null || cpIdx < 0) cpIdx = waypoints.length - 1;

        // Center the map on the current position
        const center = [waypoints[cpIdx].lat, waypoints[cpIdx].lng];
        const map = L.map('track-map').setView(center, 6);
        // Use CARTO Voyager for detailed, clean mapping
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
            maxZoom: 19
        }).addTo(map);

        const latlngs = waypoints.map(wp => [wp.lat, wp.lng]);

        // Fit bounds to show all waypoints
        if (latlngs.length > 1) {
            map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40], maxZoom: 14 });
        }

        waypoints.forEach((wp, i) => {
            const isFirst = i === 0;
            const isCurrent = i === cpIdx;

            let markerClass = 'standard-marker-client';
            if (isFirst) markerClass = 'standard-marker-client origin-marker-client';
            if (isCurrent && waypoints.length > 1) markerClass = 'pulse-marker-client';

            const customIcon = L.divIcon({
                className: 'custom-div-icon',
                html: '<div class="' + markerClass + '"></div>',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });

            // Build tooltip label with position type
            let tooltipLabel = wp.name.split(',')[0];
            if (isFirst) tooltipLabel = 'ORIGIN: ' + tooltipLabel;
            if (isCurrent) tooltipLabel = 'CURRENT: ' + tooltipLabel;
            if (i === waypoints.length - 1 && !isCurrent && !isFirst && waypoints.length > 2) tooltipLabel = 'DEST: ' + tooltipLabel;

            const m = L.marker([wp.lat, wp.lng], { icon: customIcon }).addTo(map);
            m.bindTooltip(tooltipLabel, {
                permanent: false,
                direction: 'top',
                className: 'sophisticated-label',
                offset: [0, -10]
            });
        });

        if (latlngs.length > 1) {
            L.polyline(latlngs, { color: '#FF9F1C', weight: 4, dashArray: '5, 10' }).addTo(map);
        }
    }
});
