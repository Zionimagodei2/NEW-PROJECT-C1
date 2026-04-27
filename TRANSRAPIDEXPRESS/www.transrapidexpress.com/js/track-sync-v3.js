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
        .map-container { height: 400px; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); margin-top: 1rem; }
        .timeline { margin-top: 2rem; border-left: 2px solid rgba(255,255,255,0.1); padding-left: 1.5rem; }
        .timeline-item { position: relative; margin-bottom: 2rem; }
        .timeline-item::before { content: ''; position: absolute; left: -1.8rem; top: 0; width: 12px; height: 12px; border-radius: 50%; background: #FF9F1C; }
        .timeline-item h4 { color: #FF9F1C; margin-bottom: 0.2rem; }
        .timeline-date { font-size: 0.8rem; color: #8892b0; margin-bottom: 0.5rem; }

        /* Marker Styles — matching predecessor site */
        .pulse-marker-client {
            background: #2196F3; border-radius: 50%; width: 20px; height: 20px;
            border: 3px solid white; box-shadow: 0 0 10px rgba(33, 150, 243, 0.8);
            position: relative; transform: translate(-50%, -50%);
        }
        .pulse-marker-client::before {
            content: ''; position: absolute; top: -10px; left: -10px; right: -10px; bottom: -10px;
            border: 2px solid #2196F3; border-radius: 50%;
            animation: beckon 1.5s infinite ease-out;
        }
        @keyframes beckon { 0% { transform: scale(0.5); opacity: 1; } 100% { transform: scale(2); opacity: 0; } }

        .standard-marker-client {
            background: #3498db; border-radius: 50%; width: 14px; height: 14px;
            border: 2px solid white; transform: translate(-50%, -50%);
        }
        .origin-marker-client { background: #4CAF50; border-color: white; box-shadow: 0 0 8px rgba(76,175,80,0.6); }
        .dest-marker-client { background: #F44336; border-color: white; box-shadow: 0 0 8px rgba(244,67,54,0.6); }
        .stop-marker-client { background: #2196F3; border-color: white; box-shadow: 0 0 5px rgba(33,150,243,0.5); }
        .transit-marker-client {
            background: rgba(136, 146, 176, 0.5); border-radius: 50%; width: 8px; height: 8px;
            border: 1px solid rgba(255,255,255,0.3); transform: translate(-50%, -50%);
        }
        .transit-label-client {
            background: rgba(10, 22, 40, 0.6) !important;
            border: 1px solid rgba(136, 146, 176, 0.3) !important;
            font-size: 0.7rem !important;
            font-weight: 400 !important;
            color: #8892b0 !important;
        }

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

        /* Map Legend */
        .map-legend {
            display: flex;
            align-items: center;
            gap: 1.5rem;
            margin-top: 0.75rem;
            margin-bottom: 0.5rem;
            flex-wrap: wrap;
        }
        .map-legend-item {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 0.85rem;
            font-weight: 600;
            color: #fff;
        }
        .map-legend-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            display: inline-block;
        }
        .map-legend-dot.origin { background: #4CAF50; }
        .map-legend-dot.current { background: #2196F3; }
        .map-legend-dot.dest { background: #F44336; }

        /* Route legend (traveled vs remaining) */
        .route-legend {
            display: flex;
            align-items: center;
            gap: 1.5rem;
            margin-bottom: 0.5rem;
            flex-wrap: wrap;
        }
        .route-legend-item {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 0.75rem;
            color: #94a3b8;
        }
        .route-legend-line {
            width: 24px;
            height: 3px;
            display: inline-block;
            border-radius: 2px;
        }
        .route-legend-line.traveled { background: #64B5F6; }
        .route-legend-line.remaining { background: #78909C; }

        /* Success notification banner */
        .track-success-banner {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 12px 16px;
            background: rgba(76, 175, 80, 0.15);
            border: 1px solid rgba(76, 175, 80, 0.4);
            border-radius: 10px;
            margin-bottom: 1.5rem;
            color: #4CAF50;
            font-weight: 600;
            font-size: 0.9rem;
            animation: slideIn 0.4s ease-out;
        }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }

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
            .map-legend { gap: 1rem; }
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
        <div id="track-success-banner" class="track-success-banner" style="display:none;">
            <svg width="20" height="20" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <span>Shipment found. Live tracking loaded.</span>
        </div>
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
                <div class="info-group"><span class="info-label">Barcode</span><span class="info-val" id="res-barcode">--</span></div>
                <div class="info-group"><span class="info-label">Weight</span><span class="info-val" id="res-weight">--</span></div>
                <div class="info-group"><span class="info-label">Description</span><span class="info-val" id="res-desc">--</span></div>
                <div class="info-group"><span class="info-label">Estimated Delivery</span><span class="info-val" id="res-estdelivery">--</span></div>
            </div>
            <div>
                <div class="info-group"><span class="info-label">Declared Value</span><span class="info-val" id="res-value">--</span></div>
                <div class="info-group"><span class="info-label">Circumstance</span><span class="info-val" id="res-circumstance">--</span></div>
                <div class="info-group"><span class="info-label">Transportation</span><span class="info-val" id="res-transport">--</span></div>
                <div class="info-group"><span class="info-label">Agency</span><span class="info-val" id="res-agency">--</span></div>
            </div>
        </div>
        <h3 style="margin: 2rem 0 1rem; color: #ffffff; display: flex; align-items: center; gap: 8px;">RECEIVER <svg width="18" height="18" fill="none" stroke="#FF9F1C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></svg></h3>
        <div class="details-grid">
            <div>
                <div class="info-group"><span class="info-label">Name</span><span class="info-val" id="res-receiver-name">--</span></div>
                <div class="info-group"><span class="info-label">Phone</span><span class="info-val" id="res-receiver-phone">--</span></div>
            </div>
            <div>
                <div class="info-group"><span class="info-label">Email</span><span class="info-val" id="res-receiver-email">--</span></div>
            </div>
        </div>
        <h3 style="margin: 2rem 0 1rem; color: #ffffff; display: flex; align-items: center; gap: 8px;">SENDER <svg width="18" height="18" fill="none" stroke="#FF9F1C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg></h3>
        <div class="details-grid">
            <div>
                <div class="info-group"><span class="info-label">Name</span><span class="info-val" id="res-sender-name">--</span></div>
                <div class="info-group"><span class="info-label">Email</span><span class="info-val" id="res-sender-email">--</span></div>
            </div>
            <div>
                <div class="info-group"><span class="info-label">Phone</span><span class="info-val" id="res-sender-phone">--</span></div>
            </div>
        </div>
        <h3 style="margin: 2rem 0 1rem; color: #ffffff; display: flex; align-items: center; gap: 8px;">KEY DATES <svg width="18" height="18" fill="none" stroke="#FF9F1C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></h3>
        <div class="details-grid">
            <div>
                <div class="info-group"><span class="info-label">Shipped On</span><span class="info-val" id="res-shipped-on">--</span></div>
            </div>
            <div>
                <div class="info-group"><span class="info-label">Last Updated</span><span class="info-val" id="res-last-updated">--</span></div>
            </div>
        </div>
        <h3 style="margin: 1.5rem 0 0.5rem; color: #ffffff;">LIVE SHIPMENT MAP</h3>
        <div class="map-legend">
            <div class="map-legend-item"><span class="map-legend-dot origin"></span> ORIGIN</div>
            <div class="map-legend-item"><span class="map-legend-dot current"></span> CURRENT</div>
            <div class="map-legend-item"><span class="map-legend-dot dest"></span> DEST</div>
        </div>
        <div class="route-legend">
            <div class="route-legend-item"><span class="route-legend-line traveled"></span> Traveled</div>
            <div class="route-legend-item"><span class="route-legend-line remaining"></span> Remaining</div>
        </div>
        <p style="color: #8892b0; font-size: 0.9rem;" id="res-current-loc">Current Location: --</p>
        <div id="track-map" class="map-container"></div>
        <h3 style="margin: 2rem 0 0.5rem; color: #ffffff; display: flex; align-items: center; gap: 8px;">
            <svg width="18" height="18" fill="none" stroke="#FF9F1C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            LOCATION HISTORY
            <span id="res-stop-count" style="font-size:0.75rem;color:#94a3b8;font-weight:400;margin-left:8px;"></span>
        </h3>
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
            // Hide success banner
            document.getElementById('track-success-banner').style.display = 'none';
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

        // Show success banner
        const banner = document.getElementById('track-success-banner');
        if (banner) banner.style.display = 'flex';

        document.getElementById('res-code').textContent = code;
        document.getElementById('res-status').textContent = ship.pkgStatus || 'Pending';
        document.getElementById('res-date').textContent = ship.pkgEstDelivery || 'Unknown';

        // Product Information
        document.getElementById('res-name').textContent = ship.pkgName || 'Unknown';
        document.getElementById('res-barcode').textContent = ship.pkgBarcode || 'N/A';
        document.getElementById('res-weight').textContent = ship.pkgWeight || 'N/A';
        document.getElementById('res-desc').textContent = ship.pkgDesc || 'Unavailable';
        document.getElementById('res-estdelivery').textContent = ship.pkgEstDelivery || 'N/A';
        document.getElementById('res-value').textContent = ship.pkgValue || 'N/A';
        document.getElementById('res-circumstance').textContent = ship.pkgCircumstance || 'N/A';
        document.getElementById('res-transport').textContent = ship.pkgTransport || 'LAND';
        document.getElementById('res-agency').textContent = ship.pkgAgency || 'Transrapid Express .inc';

        // Receiver Information
        document.getElementById('res-receiver-name').textContent = ship.receiverName || 'N/A';
        document.getElementById('res-receiver-phone').textContent = ship.receiverPhone || 'N/A';
        document.getElementById('res-receiver-email').textContent = ship.receiverEmail || 'N/A';

        // Sender Information
        document.getElementById('res-sender-name').textContent = ship.senderName || 'N/A';
        document.getElementById('res-sender-email').textContent = ship.senderEmail || 'N/A';
        document.getElementById('res-sender-phone').textContent = ship.senderPhone || 'N/A';

        // Key Dates
        document.getElementById('res-shipped-on').textContent = (ship.waypoints && ship.waypoints[0]) ? ship.waypoints[0].time : 'N/A';
        document.getElementById('res-last-updated').textContent = ship.lastUpdated ? new Date(ship.lastUpdated).toLocaleString() : 'N/A';

        // Use currentPositionIndex to determine the current location
        const cpIdx = ship.currentPositionIndex !== undefined ? ship.currentPositionIndex : (ship.waypoints ? ship.waypoints.length - 1 : -1);
        const destIdx = ship.destinationIndex !== undefined ? ship.destinationIndex : -1;
        const origIdx = ship.originIndex !== undefined ? ship.originIndex : 0;
        const currentLoc = (ship.waypoints && ship.waypoints[cpIdx]) ? ship.waypoints[cpIdx].name : (ship.waypoints && ship.waypoints.length > 0 ? ship.waypoints[ship.waypoints.length - 1].name : 'Unknown');
        document.getElementById('res-current-loc').textContent = 'Current Location: ' + currentLoc;

        // Count stops for the header
        const stopCount = ship.waypoints ? ship.waypoints.filter(wp => wp.stopType === 'stop').length : 0;
        const stopCountEl = document.getElementById('res-stop-count');
        if (stopCountEl) stopCountEl.textContent = stopCount + ' STOP' + (stopCount !== 1 ? 'S' : '');

        // Populate Timeline
        const tlist = document.getElementById('res-timeline');
        tlist.innerHTML = '';
        if (ship.waypoints) {
            const wps = [...ship.waypoints].reverse();
            // In the reversed array, the "current" item index is reversed too
            const reversedCpIdx = ship.waypoints.length - 1 - cpIdx;

            // Determine effective origin for timeline
            let effectiveOrigIdx = -1;
            if (origIdx >= 0 && origIdx < ship.waypoints.length && ship.waypoints[origIdx].stopType === 'stop') {
                effectiveOrigIdx = origIdx;
            } else {
                effectiveOrigIdx = 0;
            }

            // Determine effective destination for timeline
            let effectiveDestOrigIdx = -1;
            if (destIdx >= 0 && destIdx < ship.waypoints.length && ship.waypoints[destIdx].stopType === 'stop') {
                effectiveDestOrigIdx = destIdx;
            } else {
                // Auto-calculate: last stop-type waypoint that isn't origin or current
                const stopIndices = ship.waypoints.map((wp, i) => ({ ...wp, origIndex: i })).filter(wp => wp.stopType === 'stop');
                for (let si = stopIndices.length - 1; si >= 0; si--) {
                    const idx = stopIndices[si].origIndex;
                    if (idx !== effectiveOrigIdx && idx !== cpIdx) {
                        effectiveDestOrigIdx = idx;
                        break;
                    }
                }
            }
            const reversedDestIdx = effectiveDestOrigIdx >= 0 ? ship.waypoints.length - 1 - effectiveDestOrigIdx : -1;
            const reversedOrigIdx = effectiveOrigIdx >= 0 ? ship.waypoints.length - 1 - effectiveOrigIdx : -1;

            wps.forEach((wp, index) => {
                const isStop = wp.stopType === 'stop';
                const isCurrent = (index === reversedCpIdx) && isStop;
                const isOrigin = (index === reversedOrigIdx) && isStop;
                const isDest = (index === reversedDestIdx) && isStop;
                let badge = '';
                if (isCurrent) badge = '<span style="font-size:0.7em;color:#2196F3;border:1px solid #2196F3;padding:2px 6px;border-radius:10px;margin-left:10px;">CURRENT POSITION</span>';
                else if (isOrigin) badge = '<span style="font-size:0.7em;color:#4CAF50;border:1px solid #4CAF50;padding:2px 6px;border-radius:10px;margin-left:10px;">ORIGIN</span>';
                else if (isDest) badge = '<span style="font-size:0.7em;color:#F44336;border:1px solid #F44336;padding:2px 6px;border-radius:10px;margin-left:10px;">DESTINATION</span>';
                else if (!isStop) badge = '<span style="font-size:0.6em;color:#8892b0;border:1px solid rgba(136,146,176,0.4);padding:1px 5px;border-radius:10px;margin-left:10px;">TRANSIT</span>';

                const nameStyle = isStop ? 'font-weight:600;' : 'font-weight:400;color:#8892b0;';
                const itemStyle = isCurrent ? 'border-left:2px solid #2196F3;' : (!isStop ? 'opacity:0.65;' : '');
                tlist.innerHTML += '<div class="timeline-item" style="' + itemStyle + '"><h4 style="' + nameStyle + '">' + wp.name + ' ' + badge + '</h4><div class="timeline-date">' + wp.time + '</div><p style="color:#8892b0;font-size:0.85rem;">' + (wp.status || 'Location updated') + '</p></div>';
            });
        }

        // Init Map — pass all role indices so the map knows which waypoints are origin/current/dest
        setTimeout(() => {
            initMap(ship.waypoints, cpIdx, destIdx, origIdx);
        }, 500);
    }

    function initMap(waypoints, cpIdx, destIdx, origIdx) {
        if (!waypoints || waypoints.length === 0) return;
        if (typeof L === 'undefined') {
            setTimeout(() => initMap(waypoints, cpIdx, destIdx, origIdx), 300);
            return;
        }

        // Use provided cpIdx or default to last waypoint for backward compatibility
        if (cpIdx === undefined || cpIdx === null || cpIdx < 0) cpIdx = waypoints.length - 1;

        // Determine effective origin index
        let effectiveOriginIdx = -1;
        if (origIdx !== undefined && origIdx !== null && origIdx >= 0 && origIdx < waypoints.length && waypoints[origIdx].stopType === 'stop') {
            effectiveOriginIdx = origIdx;
        } else {
            // Default to first stop-type waypoint
            const firstStop = waypoints.find(wp => wp.stopType === 'stop');
            if (firstStop) effectiveOriginIdx = waypoints.indexOf(firstStop);
        }

        // Determine effective destination index: use explicit destIdx if valid, otherwise auto-calculate
        const stopWaypoints = waypoints.map((wp, i) => ({ ...wp, origIndex: i })).filter(wp => wp.stopType === 'stop');
        let effectiveDestIdx = -1;
        if (destIdx !== undefined && destIdx !== null && destIdx >= 0 && destIdx < waypoints.length && waypoints[destIdx].stopType === 'stop') {
            effectiveDestIdx = destIdx;
        } else {
            // Auto-calculate: last stop-type waypoint that isn't origin or current
            for (let si = stopWaypoints.length - 1; si >= 0; si--) {
                const idx = stopWaypoints[si].origIndex;
                if (idx !== effectiveOriginIdx && idx !== cpIdx) {
                    effectiveDestIdx = idx;
                    break;
                }
            }
        }

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

        // === TWO-COLOR ROUTE LINE ===
        // Traveled: Origin → Current Position (light blue dashed)
        // Remaining: Current Position → Destination (gray solid)
        if (waypoints.length > 1) {
            const originStart = Math.max(0, effectiveOriginIdx);
            const traveledPoints = waypoints.slice(originStart, cpIdx + 1).map(wp => [wp.lat, wp.lng]);
            const remainingPoints = waypoints.slice(cpIdx).map(wp => [wp.lat, wp.lng]);

            // Traveled segment: light blue dashed
            if (traveledPoints.length > 1) {
                L.polyline(traveledPoints, {
                    color: '#64B5F6',
                    weight: 3,
                    dashArray: '8, 12',
                    opacity: 0.9
                }).addTo(map);
            }

            // Remaining segment: gray solid
            if (remainingPoints.length > 1) {
                L.polyline(remainingPoints, {
                    color: '#78909C',
                    weight: 3,
                    opacity: 0.7
                }).addTo(map);
            }
        }

        // === MARKERS ===
        waypoints.forEach((wp, i) => {
            const isStop = wp.stopType === 'stop';
            const isOrigin = (i === effectiveOriginIdx && isStop);
            const isCurrent = (i === cpIdx && isStop);
            const isDest = (i === effectiveDestIdx && isStop);

            let markerClass, iconSize;
            if (isCurrent && waypoints.length > 1) {
                markerClass = 'pulse-marker-client';
                iconSize = [20, 20];
            } else if (isOrigin) {
                markerClass = 'standard-marker-client origin-marker-client';
                iconSize = [14, 14];
            } else if (isDest) {
                markerClass = 'standard-marker-client dest-marker-client';
                iconSize = [14, 14];
            } else if (isStop) {
                markerClass = 'standard-marker-client stop-marker-client';
                iconSize = [14, 14];
            } else {
                // Transit point — subtle small dot
                markerClass = 'transit-marker-client';
                iconSize = [8, 8];
            }

            const customIcon = L.divIcon({
                className: 'custom-div-icon',
                html: '<div class="' + markerClass + '"></div>',
                iconSize: iconSize,
                iconAnchor: [iconSize[0] / 2, iconSize[1] / 2]
            });

            // Build tooltip label with position type
            let tooltipLabel = wp.name.split(',')[0];
            if (isOrigin) tooltipLabel = 'ORIGIN: ' + tooltipLabel;
            else if (isCurrent) tooltipLabel = 'CURRENT: ' + tooltipLabel;
            else if (isDest) tooltipLabel = 'DESTINATION: ' + tooltipLabel;
            else if (isStop) tooltipLabel = 'STOP: ' + tooltipLabel;
            // Transit points just show the name

            const tooltipClass = isStop ? 'sophisticated-label' : 'sophisticated-label transit-label-client';

            const m = L.marker([wp.lat, wp.lng], { icon: customIcon }).addTo(map);
            m.bindTooltip(tooltipLabel, {
                permanent: false,
                direction: 'top',
                className: tooltipClass,
                offset: [0, -10]
            });
        });
    }
});
