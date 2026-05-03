// track-sync-v3.js — Tracking functionality for track.html
// MIGRATED FROM LEAFLET TO MAPBOX GL JS for better geocoding, map rendering, and marker precision.
// "Track Now" and "Track Shipment" buttons navigate to track.html normally.
// Theme-aware: uses CSS custom properties so colors adapt to light/dark mode.

const STORE_KEY = 'transrapid_shipments';
function getShipments() {
    const data = localStorage.getItem(STORE_KEY);
    return data ? JSON.parse(data) : {};
}

// Only load Mapbox and tracking styles on the track page
const isTrackPage = window.location.pathname.includes('track.html') || window.location.pathname.endsWith('/track');

if (isTrackPage) {
    // Inject Mapbox GL JS CSS and JS
    const mapboxCSS = document.createElement('link');
    mapboxCSS.rel = 'stylesheet';
    mapboxCSS.href = 'https://api.mapbox.com/mapbox-gl-js/v3.9.4/mapbox-gl.css';
    document.head.appendChild(mapboxCSS);

    const mapboxJS = document.createElement('script');
    mapboxJS.src = 'https://api.mapbox.com/mapbox-gl-js/v3.9.4/mapbox-gl.js';
    document.head.appendChild(mapboxJS);

    // Tracking result styles — theme-aware using CSS custom properties
    const trackStyles = document.createElement('style');
    trackStyles.innerHTML = `
        /* ============================================
           RESULT CONTAINER — Theme-Aware Design
           Uses CSS custom properties so the entire
           container adapts to light/dark theme.
           ============================================ */
        .track-result-container {
            /* Light mode defaults */
            --tr-bg: #ffffff;
            --tr-text: #1A1D26;
            --tr-text-muted: #64748b;
            --tr-text-bright: #1A1D26;
            --tr-text-value: #1A1D26;
            --tr-border: rgba(0,0,0,0.06);
            --tr-border-strong: rgba(0,0,0,0.1);
            --tr-surface: rgba(0,0,0,0.03);
            --tr-shadow: 0 25px 50px -12px rgba(0,0,0,0.08);

            max-width: 800px;
            margin: 2rem auto;
            padding: 2rem;
            color: var(--tr-text) !important;
            display: none;
            background: var(--tr-bg) !important;
            border-radius: 20px;
            border: 1px solid var(--tr-border);
            box-shadow: var(--tr-shadow);
        }
        /* Dark mode overrides */
        .dark .track-result-container {
            --tr-bg: #0f172a;
            --tr-text: #e2e8f0;
            --tr-text-muted: #94a3b8;
            --tr-text-bright: #f8fafc;
            --tr-text-value: #f1f5f9;
            --tr-border: rgba(255,255,255,0.06);
            --tr-border-strong: rgba(255,255,255,0.1);
            --tr-surface: rgba(255,255,255,0.05);
            --tr-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
        }
        .track-result-container.active {
            display: block;
        }
        .result-header {
            border-bottom: 1px solid var(--tr-border);
            padding-bottom: 1.5rem;
            margin-bottom: 1.5rem;
        }
        .result-title {
            color: #1A1D26 !important;
            font-size: 1.5rem !important;
            font-weight: bold !important;
        }
        html.dark .track-result-container .result-title { color: #f8fafc !important; }
        .tracking-code-label {
            color: var(--tr-text-muted);
        }
        .tracking-code-value {
            color: #FF9F1C !important;
            font-weight: bold;
        }
        .status-card {
            background: var(--tr-surface);
            padding: 1.5rem;
            border-radius: 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border: 1px solid rgba(255,159,28,0.3);
        }
        .status-badge { color: #FF9F1C; font-weight: bold; font-size: 1.25rem; }
        .details-grid { display: flex; flex-direction: column; gap: 0; margin-bottom: 2rem; }
        .info-row { display: flex; justify-content: space-between; align-items: baseline; padding: 10px 0; border-bottom: 1px solid var(--tr-border); flex-wrap: nowrap; gap: 12px; }
        .info-label { color: var(--tr-text-muted); font-size: 0.85rem; font-weight: 500; flex-shrink: 0; white-space: nowrap; }
        .info-val { color: #1A1D26 !important; font-weight: 600; text-align: right; margin-left: auto; word-break: break-word; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
        html.dark .track-result-container .info-val,
        html.dark .info-val { color: #f1f5f9 !important; }
        .section-title { margin: 2rem 0 0.75rem; color: #1A1D26 !important; font-size: 0.95rem; font-weight: 700; letter-spacing: 0.5px; display: flex; align-items: center; gap: 8px; }
        html.dark .track-result-container .section-title { color: #f8fafc !important; }
        .section-title svg { opacity: 0.7; }
        .map-container { height: 480px; border-radius: 12px; overflow: hidden; border: 1px solid var(--tr-border-strong); margin-top: 1rem; position: relative; }
        .timeline { margin-top: 2rem; border-left: 2px solid var(--tr-border-strong); padding-left: 1.5rem; }
        .timeline-item { position: relative; margin-bottom: 2rem; }
        .timeline-item::before { content: ''; position: absolute; left: -1.8rem; top: 0; width: 12px; height: 12px; border-radius: 50%; background: #FF9F1C; }
        .timeline-item h4 { color: #FF9F1C; margin-bottom: 0.2rem; }
        .timeline-date { font-size: 0.8rem; color: var(--tr-text-muted); margin-bottom: 0.5rem; }
        .timeline-status { color: var(--tr-text-muted); font-size: 0.85rem; }
        .current-loc-text { color: var(--tr-text-muted) !important; font-size: 0.9rem; }
        .stop-count-text { font-size: 0.75rem; color: var(--tr-text-muted); font-weight: 400; margin-left: 8px; }

        /* Timeline badges */
        .tl-badge { font-size: 0.7em; padding: 2px 6px; border-radius: 10px; margin-left: 10px; display: inline-block; }
        .tl-badge-current { color: #2196F3; border: 1px solid #2196F3; }
        .tl-badge-origin { color: #4CAF50; border: 1px solid #4CAF50; }
        .tl-badge-dest { color: #F44336; border: 1px solid #F44336; }
        .tl-badge-transit { font-size: 0.6em; color: var(--tr-text-muted); border: 1px solid rgba(136,146,176,0.4); padding: 1px 5px; }
        .tl-name-stop { font-weight: 600; }
        .tl-name-transit { font-weight: 400; color: var(--tr-text-muted); }
        .tl-item-current { border-left: 2px solid #2563EB; }
        .tl-item-transit { opacity: 0.65; }

        /* ================================
           MAPBOX GL MARKER STYLES
           ================================ */
        .mapbox-marker {
            display: flex;
            flex-direction: column;
            align-items: center;
            position: relative;
        }
        /* Dot inside marker */
        .marker-dot {
            border-radius: 50%;
            border: 4px solid white;
            box-sizing: border-box;
            box-shadow: 0 2px 8px rgba(0,0,0,0.25);
            position: relative;
            z-index: 2;
        }
        /* Current position: large pulsing blue dot */
        .marker-dot-current {
            width: 40px;
            height: 40px;
            background: #2563EB;
            border-width: 5px;
            box-shadow: 0 0 16px rgba(37, 99, 235, 0.6);
        }
        .marker-dot-current::before {
            content: '';
            position: absolute;
            top: -14px; left: -14px; right: -14px; bottom: -14px;
            border: 2px solid #2563EB;
            border-radius: 50%;
            animation: beckon 1.5s infinite ease-out;
        }
        @keyframes beckon { 0% { transform: scale(0.5); opacity: 1; } 100% { transform: scale(2.2); opacity: 0; } }

        /* Origin dot: green */
        .marker-dot-origin {
            width: 30px;
            height: 30px;
            background: #059669;
            border-width: 4px;
            box-shadow: 0 0 10px rgba(5,150,105,0.5);
        }
        /* Destination dot: red */
        .marker-dot-dest {
            width: 30px;
            height: 30px;
            background: #DC2626;
            border-width: 4px;
            box-shadow: 0 0 10px rgba(220,38,38,0.5);
        }
        /* Regular stop dot: blue */
        .marker-dot-stop {
            width: 30px;
            height: 30px;
            background: #3B82F6;
            border-width: 4px;
            box-shadow: 0 0 6px rgba(59,130,246,0.4);
        }
        /* Transit dot: small grey */
        .marker-dot-transit {
            width: 18px;
            height: 18px;
            background: rgba(136, 146, 176, 0.6);
            border-width: 2px;
            border-color: rgba(255,255,255,0.5);
            box-shadow: 0 0 4px rgba(0,0,0,0.15);
        }

        /* ================================
           LABEL STYLES — White rounded dialogue bubble
           ================================ */
        .marker-label {
            background: #ffffff;
            color: #1A1D26;
            font-size: 0.7rem;
            font-weight: 600;
            font-family: inherit;
            padding: 5px 11px;
            border-radius: 14px;
            box-shadow: 0 3px 10px rgba(0,0,0,0.18);
            white-space: nowrap;
            letter-spacing: 0.3px;
            line-height: 1.4;
            position: relative;
            margin-bottom: 4px;
            border: none;
        }
        /* Small caret/pointer pointing down toward the dot */
        .marker-label::after {
            content: '';
            position: absolute;
            bottom: -5px;
            left: 50%;
            transform: translateX(-50%);
            width: 0;
            height: 0;
            border-left: 5px solid transparent;
            border-right: 5px solid transparent;
            border-top: 6px solid #ffffff;
        }
        /* Color indicator dot inside label */
        .marker-label .label-indicator {
            display: inline-block;
            width: 6px;
            height: 6px;
            border-radius: 50%;
            margin-left: 5px;
            vertical-align: middle;
        }
        .label-indicator-origin { background: #059669; }
        .label-indicator-current { background: #2563EB; }
        .label-indicator-dest { background: #DC2626; }
        /* Transit label — lighter, more subtle */
        .marker-label-transit {
            font-size: 0.6rem;
            font-weight: 500;
            color: #64748b;
            padding: 3px 9px;
            border-radius: 10px;
            box-shadow: 0 1px 5px rgba(0,0,0,0.1);
        }
        .marker-label-transit::after {
            border-top-width: 4px;
            border-left-width: 4px;
            border-right-width: 4px;
            bottom: -4px;
        }

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
            color: #1A1D26;
        }
        html.dark .map-legend-item { color: #f8fafc; }
        .map-legend-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            display: inline-block;
        }
        .map-legend-dot.origin { background: #059669; }
        .map-legend-dot.current { background: #2563EB; }
        .map-legend-dot.dest { background: #DC2626; }

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
            color: var(--tr-text-muted);
        }
        .route-legend-line {
            width: 24px;
            height: 2px;
            display: inline-block;
            border-radius: 2px;
        }
        .route-legend-line.traveled { background: #3B82F6; }
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
            background: var(--tr-surface);
            border: 1px solid var(--tr-border-strong);
            color: var(--tr-text);
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            font-size: 0.85rem;
            transition: background 0.2s;
        }
        .track-back-btn:hover { background: var(--tr-border); }

        /* Mapbox GL controls overrides for theme */
        .mapboxgl-ctrl-logo { display: none !important; }
        .map-container .mapboxgl-ctrl-attrib { font-size: 9px !important; }

        @media (max-width: 768px) {
            .track-result-container { padding: 1.25rem; border-radius: 14px; }
            .details-grid { gap: 0; }
            .status-card { flex-direction: column; text-align: center; gap: 1rem; }
            .status-card div { text-align: center !important; }
            .map-container { height: 350px; }
            .map-legend { gap: 1rem; }
            .info-row { font-size: 0.8rem; flex-wrap: nowrap; padding: 8px 0; }
            .info-label { font-size: 0.75rem; }
            .info-val { font-size: 0.8rem; }
            .marker-label { font-size: 0.55rem; padding: 3px 8px; border-radius: 10px; }
            .marker-label-transit { font-size: 0.5rem; padding: 2px 6px; }
            .marker-dot-current { width: 32px; height: 32px; border-width: 4px; }
            .marker-dot-origin, .marker-dot-dest, .marker-dot-stop { width: 24px; height: 24px; border-width: 3px; }
            .marker-dot-transit { width: 14px; height: 14px; border-width: 2px; }
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
            <h2 class="result-title">SHIPMENT DETAILS</h2>
            <p class="tracking-code-label">Tracking Code: <strong class="tracking-code-value" id="res-code">--</strong></p>
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
        <h3 class="section-title">PRODUCT INFORMATION</h3>
        <div class="details-grid">
            <div class="info-row"><span class="info-label">Name</span><span class="info-val" id="res-name">--</span></div>
            <div class="info-row"><span class="info-label">Barcode</span><span class="info-val" id="res-barcode">--</span></div>
            <div class="info-row"><span class="info-label">Weight</span><span class="info-val" id="res-weight">--</span></div>
            <div class="info-row"><span class="info-label">Description</span><span class="info-val" id="res-desc">--</span></div>
            <div class="info-row"><span class="info-label">Est. Delivery</span><span class="info-val" id="res-estdelivery">--</span></div>
            <div class="info-row"><span class="info-label">Declared Value</span><span class="info-val" id="res-value">--</span></div>
            <div class="info-row"><span class="info-label">Circumstance</span><span class="info-val" id="res-circumstance">--</span></div>
            <div class="info-row"><span class="info-label">Transportation</span><span class="info-val" id="res-transport">--</span></div>
            <div class="info-row"><span class="info-label">Agency</span><span class="info-val" id="res-agency">--</span></div>
        </div>
        <h3 class="section-title">RECEIVER <svg width="16" height="16" fill="none" stroke="#FF9F1C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></svg></h3>
        <div class="details-grid">
            <div class="info-row"><span class="info-label">Name</span><span class="info-val" id="res-receiver-name">--</span></div>
            <div class="info-row"><span class="info-label">Phone</span><span class="info-val" id="res-receiver-phone">--</span></div>
            <div class="info-row"><span class="info-label">Email</span><span class="info-val" id="res-receiver-email">--</span></div>
        </div>
        <h3 class="section-title">SENDER <svg width="16" height="16" fill="none" stroke="#FF9F1C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg></h3>
        <div class="details-grid">
            <div class="info-row"><span class="info-label">Name</span><span class="info-val" id="res-sender-name">--</span></div>
            <div class="info-row"><span class="info-label">Email</span><span class="info-val" id="res-sender-email">--</span></div>
            <div class="info-row"><span class="info-label">Phone</span><span class="info-val" id="res-sender-phone">--</span></div>
        </div>
        <h3 class="section-title">KEY DATES <svg width="16" height="16" fill="none" stroke="#FF9F1C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></h3>
        <div class="details-grid">
            <div class="info-row"><span class="info-label">Shipped On</span><span class="info-val" id="res-shipped-on">--</span></div>
            <div class="info-row"><span class="info-label">Last Updated</span><span class="info-val" id="res-last-updated">--</span></div>
        </div>
        <h3 class="section-title">LIVE SHIPMENT MAP</h3>
        <div class="map-legend">
            <div class="map-legend-item"><span class="map-legend-dot origin"></span> ORIGIN</div>
            <div class="map-legend-item"><span class="map-legend-dot current"></span> CURRENT</div>
            <div class="map-legend-item"><span class="map-legend-dot dest"></span> DEST</div>
        </div>
        <div class="route-legend">
            <div class="route-legend-item"><span class="route-legend-line traveled"></span> Traveled</div>
            <div class="route-legend-item"><span class="route-legend-line remaining"></span> Remaining</div>
        </div>
        <p class="current-loc-text" id="res-current-loc">Current Location: --</p>
        <div id="track-map" class="map-container"></div>
        <h3 class="section-title">
            <svg width="16" height="16" fill="none" stroke="#FF9F1C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            LOCATION HISTORY
            <span id="res-stop-count" class="stop-count-text"></span>
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
            // Destroy Mapbox map instance if it exists
            if (window._trackMapInstance) {
                window._trackMapInstance.remove();
                window._trackMapInstance = null;
            }
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
            const reversedCpIdx = ship.waypoints.length - 1 - cpIdx;

            let effectiveDestOrigIdx = -1;
            if (destIdx >= 0 && destIdx < ship.waypoints.length && ship.waypoints[destIdx].stopType === 'stop') {
                effectiveDestOrigIdx = destIdx;
            } else {
                const stopIndices = ship.waypoints.map((wp, i) => ({ ...wp, origIndex: i })).filter(wp => wp.stopType === 'stop');
                for (let si = stopIndices.length - 1; si >= 0; si--) {
                    const idx = stopIndices[si].origIndex;
                    if (idx !== 0 && idx !== cpIdx) {
                        effectiveDestOrigIdx = idx;
                        break;
                    }
                }
            }
            const reversedDestIdx = effectiveDestOrigIdx >= 0 ? ship.waypoints.length - 1 - effectiveDestOrigIdx : -1;

            wps.forEach((wp, index) => {
                const isStop = wp.stopType === 'stop';
                const isCurrent = (index === reversedCpIdx) && isStop;
                const isOrigin = (index === wps.length - 1) && isStop;
                const isDest = (index === reversedDestIdx) && isStop;
                let badge = '';
                if (isCurrent) badge = '<span class="tl-badge tl-badge-current">CURRENT POSITION</span>';
                else if (isOrigin) badge = '<span class="tl-badge tl-badge-origin">ORIGIN</span>';
                else if (isDest) badge = '<span class="tl-badge tl-badge-dest">DESTINATION</span>';
                else if (!isStop) badge = '<span class="tl-badge tl-badge-transit">TRANSIT</span>';

                const nameClass = isStop ? 'tl-name-stop' : 'tl-name-transit';
                const itemClass = isCurrent ? 'tl-item-current' : (!isStop ? 'tl-item-transit' : '');
                tlist.innerHTML += '<div class="timeline-item ' + itemClass + '"><h4 class="' + nameClass + '">' + wp.name + ' ' + badge + '</h4><div class="timeline-date">' + wp.time + '</div><p class="timeline-status">' + (wp.status || 'Location updated') + '</p></div>';
            });
        }

        // FORCE visible colors on all .info-val elements
        const isDarkMode = document.documentElement.classList.contains('dark');
        const forcedValueColor = isDarkMode ? '#f1f5f9' : '#1A1D26';
        resultContainer.querySelectorAll('.info-val').forEach(el => {
            el.style.setProperty('color', forcedValueColor, 'important');
        });

        // Init Map — wait for Mapbox GL JS to load
        setTimeout(() => {
            initMap(ship.waypoints, cpIdx, destIdx);
        }, 800);
    }

    // ============================
    // MAPBOX GL JS MAP INITIALIZATION
    // ============================
    function initMap(waypoints, cpIdx, destIdx) {
        if (!waypoints || waypoints.length === 0) return;

        // Wait for Mapbox GL JS to be available
        if (typeof mapboxgl === 'undefined') {
            setTimeout(() => initMap(waypoints, cpIdx, destIdx), 300);
            return;
        }

        // Clean up existing map instance
        if (window._trackMapInstance) {
            window._trackMapInstance.remove();
            window._trackMapInstance = null;
        }

        // Use provided cpIdx or default to last waypoint
        if (cpIdx === undefined || cpIdx === null || cpIdx < 0) cpIdx = waypoints.length - 1;

        // Determine effective destination index
        const stopWaypoints = waypoints.map((wp, i) => ({ ...wp, origIndex: i })).filter(wp => wp.stopType === 'stop');
        let effectiveDestIdx = -1;
        if (destIdx !== undefined && destIdx !== null && destIdx >= 0 && destIdx < waypoints.length && waypoints[destIdx].stopType === 'stop') {
            effectiveDestIdx = destIdx;
        } else {
            for (let si = stopWaypoints.length - 1; si >= 0; si--) {
                const idx = stopWaypoints[si].origIndex;
                if (idx !== 0 && idx !== cpIdx) {
                    effectiveDestIdx = idx;
                    break;
                }
            }
        }

        // Mapbox Public Token
        mapboxgl.accessToken = 'pk.eyJ1IjoicGFibG9wYWJsbzEyMyIsImEiOiJjbW9wa21ucHUwaDExMnFzZWIweGt4NGw0In0.FsaVIX0zLxDyqiuJOi3Big';

        // Detect dark mode for map style
        const isDark = document.documentElement.classList.contains('dark');
        const mapStyle = isDark
            ? 'mapbox://styles/mapbox/dark-v11'
            : 'mapbox://styles/mapbox/streets-v12';

        // Center on current position
        const center = [waypoints[cpIdx].lng, waypoints[cpIdx].lat];

        // Calculate bounds for all waypoints
        const bounds = new mapboxgl.LngLatBounds();
        waypoints.forEach(wp => bounds.extend([wp.lng, wp.lat]));

        const trackMap = new mapboxgl.Map({
            container: 'track-map',
            style: mapStyle,
            center: center,
            zoom: 6,
            bounds: bounds,
            fitBoundsOptions: { padding: 60, maxZoom: 14 },
            attributionControl: false
        });

        window._trackMapInstance = trackMap;

        // Add navigation controls
        trackMap.addControl(new mapboxgl.NavigationControl({ showCompass: true, showZoom: true }), 'top-right');
        trackMap.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');

        trackMap.on('load', () => {
            // === DRAW ROUTE LINES ===
            const traveledCoords = waypoints.slice(0, cpIdx + 1).map(wp => [wp.lng, wp.lat]);
            const remainingCoords = waypoints.slice(cpIdx).map(wp => [wp.lng, wp.lat]);

            // Traveled segment: blue dashed
            if (traveledCoords.length > 1) {
                trackMap.addSource('traveled-route', {
                    type: 'geojson',
                    data: {
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: traveledCoords
                        }
                    }
                });
                trackMap.addLayer({
                    id: 'traveled-line',
                    type: 'line',
                    source: 'traveled-route',
                    layout: { 'line-join': 'round', 'line-cap': 'round' },
                    paint: {
                        'line-color': '#3B82F6',
                        'line-width': 3,
                        'line-opacity': 0.9,
                        'line-dasharray': [2, 3]
                    }
                });
            }

            // Remaining segment: gray dashed
            if (remainingCoords.length > 1) {
                trackMap.addSource('remaining-route', {
                    type: 'geojson',
                    data: {
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: remainingCoords
                        }
                    }
                });
                trackMap.addLayer({
                    id: 'remaining-line',
                    type: 'line',
                    source: 'remaining-route',
                    layout: { 'line-join': 'round', 'line-cap': 'round' },
                    paint: {
                        'line-color': '#78909C',
                        'line-width': 2,
                        'line-opacity': 0.7,
                        'line-dasharray': [1, 3]
                    }
                });
            }

            // === ADD MARKERS ===
            // We add markers in reverse order so important ones render on top
            const sortedIndices = waypoints.map((wp, i) => i).reverse();

            sortedIndices.forEach(i => {
                const wp = waypoints[i];
                const isStop = wp.stopType === 'stop';
                const isFirst = (i === 0 && isStop);
                const isCurrent = (i === cpIdx && isStop);
                const isDest = (i === effectiveDestIdx && isStop);

                let dotClass, labelClass, indicatorClass;
                if (isCurrent && waypoints.length > 1) {
                    dotClass = 'marker-dot marker-dot-current';
                    labelClass = 'marker-label';
                    indicatorClass = 'label-indicator label-indicator-current';
                } else if (isFirst) {
                    dotClass = 'marker-dot marker-dot-origin';
                    labelClass = 'marker-label';
                    indicatorClass = 'label-indicator label-indicator-origin';
                } else if (isDest) {
                    dotClass = 'marker-dot marker-dot-dest';
                    labelClass = 'marker-label';
                    indicatorClass = 'label-indicator label-indicator-dest';
                } else if (isStop) {
                    dotClass = 'marker-dot marker-dot-stop';
                    labelClass = 'marker-label';
                    indicatorClass = '';
                } else {
                    dotClass = 'marker-dot marker-dot-transit';
                    labelClass = 'marker-label marker-label-transit';
                    indicatorClass = '';
                }

                // Clean up the label — name only, no coordinates
                let tooltipLabel = wp.name || 'Unknown';
                // Split by comma and take at most 2 parts
                tooltipLabel = tooltipLabel.split(',').slice(0, 2).join(',').trim();
                // Remove standalone numbers (postal codes, coordinates)
                tooltipLabel = tooltipLabel.replace(/\s+\d{4,}\s*$/g, '').trim();
                // Remove UK postcodes (e.g. BT19 6XD, SW1A 1AA)
                tooltipLabel = tooltipLabel.replace(/\s*[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}\s*$/i, '').trim();
                // Remove US zip codes
                tooltipLabel = tooltipLabel.replace(/\s+\d{5}(?:-\d{4})?\s*$/g, '').trim();
                // Remove coordinate-like patterns (e.g. 54.6523, -5.6732)
                tooltipLabel = tooltipLabel.replace(/[-+]?\d+\.\d+\s*,?\s*[-+]?\d+\.\d+/g, '').trim();
                // Clean up trailing commas and spaces
                tooltipLabel = tooltipLabel.replace(/,\s*$/, '').trim();
                // If nothing left, use original name first part
                if (!tooltipLabel) tooltipLabel = wp.name.split(',')[0].trim();

                // Build label HTML with optional color indicator
                let indicatorHtml = '';
                if (indicatorClass) {
                    indicatorHtml = '<span class="label-indicator ' + indicatorClass + '"></span>';
                }
                const labelHtml = '<div class="' + labelClass + '">' + tooltipLabel + indicatorHtml + '</div>';
                const dotHtml = '<div class="' + dotClass + '"></div>';

                // Create the marker element
                const el = document.createElement('div');
                el.className = 'mapbox-marker';
                el.innerHTML = labelHtml + dotHtml;

                // Add marker to map
                const marker = new mapboxgl.Marker({
                    element: el,
                    anchor: 'bottom'
                })
                .setLngLat([wp.lng, wp.lat])
                .addTo(trackMap);
            });
        });
    }
});
