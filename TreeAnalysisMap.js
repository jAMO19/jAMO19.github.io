// ---------------------------------------------------------------------------
// Tree mortality map with a year slider and a swipe (compare) divider
// ---------------------------------------------------------------------------
// To add another year, add one entry to rasterData. The slider, tick labels,
// prev/next buttons, autoplay and the compare dropdowns all build themselves
// from this list.
 
const rasterData = [
    { file: 'tree_mortality_2018_clipped.tif', label: '2018 Mortalities', year: 2018 },
    { file: 'tree_mortality_2019_clipped.tif', label: '2019 Mortalities', year: 2019 },
    { file: 'tree_mortality_2020_clipped.tif', label: '2020 Mortalities', year: 2020 }
];
 
const PLAY_INTERVAL_MS = 1500;
 
let map;
let streetMap;
let satellite;
let layerControl;
let legend;
 
// Single-year mode
let rasterLayer = null;
let currentGeoRaster = null;   // raster used by the click-to-query popup
let currentRasterIndex = 0;
let playTimer = null;
 
// Compare (swipe) mode
let compareMode = false;
let dividerFraction = 0.5;     // 0..1 position of the divider across the map
let dividerEl = null;
const compareState = {
    left:  { index: 0, layer: null, georaster: null, token: 0, error: false, pane: 'comparePaneLeft' },
    right: { index: 0, layer: null, georaster: null, token: 0, error: false, pane: 'comparePaneRight' }
};
 
// Each raster is fetched and parsed once, then reused when the slider moves.
const rasterCache = new Map(); // index -> Promise<georaster>
 
function getGeoRaster(index) {
    if (!rasterCache.has(index)) {
        const promise = fetch(rasterData[index].file)
            .then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status} for ${rasterData[index].file}`);
                return response.arrayBuffer();
            })
            .then(arrayBuffer => parseGeoraster(arrayBuffer))
            .then(georaster => {
                // Diagnostics: compare these between years if one fails to draw
                console.info(`[raster ${rasterData[index].year}] ${rasterData[index].file}`, {
                    size: `${georaster.width} x ${georaster.height}`,
                    projection: georaster.projection,
                    extent: [georaster.xmin, georaster.ymin, georaster.xmax, georaster.ymax],
                    pixelSize: [georaster.pixelWidth, georaster.pixelHeight],
                    noDataValue: georaster.noDataValue,
                    min: georaster.mins,
                    max: georaster.maxs
                });
                return georaster;
            })
            .catch(err => {
                console.error(`[raster ${rasterData[index].year}] failed:`, err);
                rasterCache.delete(index); // allow a retry later
                throw err;
            });
        rasterCache.set(index, promise);
    }
    return rasterCache.get(index);
}
 
// ---------------------------------------------------------------------------
// Colour ramp (same breaks as the legend)
// ---------------------------------------------------------------------------
function getMortalityColor(value, georaster) {
    if (value === null || value === undefined || Number.isNaN(value) || value === georaster.noDataValue) {
        return 'rgba(0, 0, 0, 0)';
    }
    if (value >= 25) return 'rgba(223, 17, 17, 0.8)';
    if (value >= 15) return 'rgba(223, 93, 17, 0.8)';
    if (value >= 10) return 'rgba(255, 140, 0, 0.8)';
    if (value >= 4)  return 'rgba(241, 238, 27, 0.8)';
    if (value >= 3)  return 'rgba(211, 240, 48, 0.8)';
    if (value >= 2)  return 'rgba(152, 233, 23, 0.8)';
    if (value >= 1)  return 'rgba(63, 241, 27, 0.8)';
    if (value >= 0)  return 'rgba(6, 185, 15, 0.75)';
    return 'rgba(0, 0, 0, 0)';
}
 
function makeRasterLayer(georaster, pane) {
    const options = {
        georaster: georaster,
        opacity: 0.8,
        pixelValuesToColorFn: values => getMortalityColor(values[0], georaster),
        resolution: 256
    };
    if (pane) options.pane = pane;
    const layer = new GeoRasterLayer(options);
 
    // georaster-layer-for-leaflet keeps its tile cache on the shared class, keyed
    // only by tile coordinates, so every layer reuses (and steals) the same tile
    // canvases. Give each layer its own cache so different years never mix.
    layer.cache = {};
 
    return layer;
}
 
function identifyValue(georaster, latlng) {
    try {
        const values = geoblaze.identify(georaster, [latlng.lng, latlng.lat]);
        return values ? values[0] : undefined;
    } catch (err) {
        console.log('Error identifying pixel:', err);
        return undefined;
    }
}
 
function isValidCount(v) {
    return v !== undefined && v !== null && !Number.isNaN(v) && v !== -128;
}
 
// ---------------------------------------------------------------------------
// Map setup (runs once)
// ---------------------------------------------------------------------------
function initMap() {
    map = L.map('distribution-map-container', {
        minZoom: 5,
        maxZoom: 7,
        zoomSnap: 1,
        zoomDelta: 1
    }).setView([54.5, -126.5], 5);
 
    // Custom bottom-centre control corner for the slider
    if (!map._controlCorners['bottomcenter']) {
        map._controlCorners['bottomcenter'] =
            L.DomUtil.create('div', 'leaflet-bottom leaflet-center', map._controlContainer);
    }
 
    // Separate panes for the two compare layers so each can be clipped on its own
    map.createPane('comparePaneLeft');
    map.getPane('comparePaneLeft').style.zIndex = 250;
    map.createPane('comparePaneRight');
    map.getPane('comparePaneRight').style.zIndex = 251;
 
    streetMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 7
    });
 
    satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles © Esri',
        maxZoom: 7
    });
 
    streetMap.addTo(map);
 
    layerControl = L.control.layers(
        { 'Street Map': streetMap, 'Satellite': satellite },
        null,
        { position: 'topright' }
    ).addTo(map);
 
    addLegend();
    addTimeSlider();
    addCompareDivider();
 
    // Click to query the displayed raster(s)
    map.on('click', function (e) {
        if (compareMode) {
            const onLeft = e.containerPoint.x < map.getSize().x * dividerFraction;
            const side = onLeft ? compareState.left : compareState.right;
            if (!side.georaster) return;
            const value = identifyValue(side.georaster, e.latlng);
            if (isValidCount(value)) {
                L.popup()
                    .setLatLng(e.latlng)
                    .setContent(`${rasterData[side.index].year} – Number of Dead Trees: ${value}`)
                    .addTo(map);
            }
            return;
        }
 
        if (!currentGeoRaster) return;
        const value = identifyValue(currentGeoRaster, e.latlng);
        if (isValidCount(value)) {
            L.popup()
                .setLatLng(e.latlng)
                .setContent(`Number of Dead Trees: ${value}`)
                .addTo(map);
        }
    });
 
    // Keep the single-year raster above whichever basemap is selected
    map.on('baselayerchange', function () {
        if (rasterLayer && map.hasLayer(rasterLayer)) {
            rasterLayer.bringToFront();
        }
    });
 
    // Keep the compare clipping in sync with panning, zooming and resizing
    map.on('move zoom resize viewreset', updateCompareClip);
}
 
function addLegend() {
    const rows = [
        ['rgba(223, 17, 17, 0.7)', '>25'],
        ['rgba(223, 93, 17, 0.7)', '15-25'],
        ['rgba(255, 140, 0, 0.7)', '10-14'],
        ['rgba(241, 238, 27, 0.7)', '4-9'],
        ['rgba(211, 240, 48, 0.7)', '3'],
        ['rgba(152, 233, 23, 0.8)', '2'],
        ['rgba(63, 241, 27, 0.8)', '1'],
        ['rgba(6, 185, 15, 0.8)', '0']
    ];
 
    legend = L.control({ position: 'bottomleft' });
    legend.onAdd = function () {
        const div = L.DomUtil.create('div', 'legend');
        div.style.backgroundColor = 'white';
        div.style.padding = '10px';
        div.style.borderRadius = '5px';
        div.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
 
        div.innerHTML =
            '<h4 style="margin: 0 0 8px 0; font-size: 14px;">Tree Mortalities</h4>' +
            rows.map(([colour, text]) => `
                <div style="display: flex; align-items: center; margin: 4px 0;">
                    <div style="width: 20px; height: 20px; background: ${colour}; margin-right: 8px; border-radius: 3px;"></div>
                    <span style="font-size: 12px;">${text}</span>
                </div>`).join('');
        return div;
    };
    legend.addTo(map);
}
 
// ---------------------------------------------------------------------------
// Time slider control (single-year mode) + compare toggle and dropdowns
// ---------------------------------------------------------------------------
function addTimeSlider() {
    const lastIndex = rasterData.length - 1;
    const canCompare = rasterData.length >= 2;
    const timeControl = L.control({ position: 'bottomcenter' });
 
    timeControl.onAdd = function () {
        const div = L.DomUtil.create('div', 'map-nav-control time-slider-control');
 
        const ticks = rasterData
            .map(d => `<span class="slider-tick">${d.year}</span>`)
            .join('');
 
        const yearOptions = rasterData
            .map((d, i) => `<option value="${i}">${d.year}</option>`)
            .join('');
 
        div.innerHTML = `
            ${canCompare ? `
            <button id="compareToggle" class="nav-btn compare-toggle" title="Compare two years side by side"
                    aria-label="Toggle compare mode" aria-pressed="false">
                <i class="fas fa-table-columns"></i>
            </button>` : ''}
            <button id="playRaster" class="nav-btn" title="Play / pause" aria-label="Play or pause timeline">
                <i class="fas fa-play"></i>
            </button>
            <button id="prevRaster" class="nav-btn" title="Previous year" aria-label="Previous year">
                <i class="fas fa-chevron-left"></i>
            </button>
            <div class="slider-wrap">
                <span id="rasterTitle" class="raster-title">${rasterData[currentRasterIndex].label}</span>
                <input id="yearSlider" class="year-slider" type="range"
                       min="0" max="${lastIndex}" step="1" value="${currentRasterIndex}"
                       aria-label="Mortality year">
                <div class="slider-ticks">${ticks}</div>
            </div>
            <button id="nextRaster" class="nav-btn" title="Next year" aria-label="Next year">
                <i class="fas fa-chevron-right"></i>
            </button>
            <div class="compare-selects">
                <label>Left <select id="compareLeftSelect">${yearOptions}</select></label>
                <label>Right <select id="compareRightSelect">${yearOptions}</select></label>
            </div>
        `;
 
        // Stop slider/buttons from panning or zooming the map
        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);
        return div;
    };
 
    timeControl.addTo(map);
 
    const slider = document.getElementById('yearSlider');
    const prevBtn = document.getElementById('prevRaster');
    const nextBtn = document.getElementById('nextRaster');
    const playBtn = document.getElementById('playRaster');
 
    slider.addEventListener('input', () => {
        stopPlaying();
        showRaster(parseInt(slider.value, 10));
    });
 
    prevBtn.addEventListener('click', () => {
        stopPlaying();
        showRaster(currentRasterIndex === 0 ? lastIndex : currentRasterIndex - 1);
    });
 
    nextBtn.addEventListener('click', () => {
        stopPlaying();
        showRaster(currentRasterIndex === lastIndex ? 0 : currentRasterIndex + 1);
    });
 
    playBtn.addEventListener('click', () => {
        if (playTimer) stopPlaying(); else startPlaying();
    });
 
    if (canCompare) {
        document.getElementById('compareToggle').addEventListener('click', () => {
            if (compareMode) exitCompare(); else enterCompare();
        });
 
        document.getElementById('compareLeftSelect').addEventListener('change', e => {
            setCompareLayer('left', parseInt(e.target.value, 10));
        });
 
        document.getElementById('compareRightSelect').addEventListener('change', e => {
            setCompareLayer('right', parseInt(e.target.value, 10));
        });
    }
}
 
function startPlaying() {
    const playIcon = document.querySelector('#playRaster i');
    if (playIcon) playIcon.className = 'fas fa-pause';
    playTimer = setInterval(() => {
        showRaster((currentRasterIndex + 1) % rasterData.length);
    }, PLAY_INTERVAL_MS);
}
 
function stopPlaying() {
    if (playTimer) {
        clearInterval(playTimer);
        playTimer = null;
    }
    const playIcon = document.querySelector('#playRaster i');
    if (playIcon) playIcon.className = 'fas fa-play';
}
 
function updateSliderUI(index, suffix = '') {
    const slider = document.getElementById('yearSlider');
    const title = document.getElementById('rasterTitle');
    if (slider) slider.value = index;
    if (title) title.innerText = rasterData[index].label + suffix;
}
 
// ---------------------------------------------------------------------------
// Single-year mode: show a raster for a given index
// ---------------------------------------------------------------------------
let requestToken = 0; // ignore stale responses if the slider is dragged quickly
 
function showRaster(index) {
    currentRasterIndex = index;
    const token = ++requestToken;
    updateSliderUI(index, ' (loading…)');
 
    return getGeoRaster(index)
        .then(georaster => {
            if (token !== requestToken) return; // a newer request superseded this one
            if (compareMode) return;            // compare mode took over while loading
 
            if (rasterLayer) {
                map.removeLayer(rasterLayer);
                rasterLayer = null;
            }
 
            currentGeoRaster = georaster;
            rasterLayer = makeRasterLayer(georaster);
            rasterLayer.addTo(map);
 
            updateSliderUI(index);
        })
        .catch(err => {
            console.error('Error loading raster:', err);
            if (token === requestToken) updateSliderUI(index, ' (Error)');
        });
}
 
// ---------------------------------------------------------------------------
// Compare (swipe) mode
// ---------------------------------------------------------------------------
function addCompareDivider() {
    dividerEl = document.createElement('div');
    dividerEl.className = 'compare-divider';
    dividerEl.style.left = (dividerFraction * 100) + '%';
    dividerEl.setAttribute('role', 'slider');
    dividerEl.setAttribute('tabindex', '0');
    dividerEl.setAttribute('aria-label', 'Drag to compare years');
    dividerEl.setAttribute('aria-valuemin', '0');
    dividerEl.setAttribute('aria-valuemax', '100');
    dividerEl.setAttribute('aria-valuenow', '50');
    dividerEl.innerHTML = `
        <span class="compare-label compare-label-left" id="compareLabelLeft"></span>
        <span class="compare-label compare-label-right" id="compareLabelRight"></span>
        <div class="compare-line"></div>
        <div class="compare-handle"><i class="fas fa-arrows-left-right"></i></div>
    `;
    dividerEl.style.display = 'none';
    map.getContainer().appendChild(dividerEl);
 
    // The divider must not pan/zoom/click through to the map
    L.DomEvent.disableClickPropagation(dividerEl);
    L.DomEvent.disableScrollPropagation(dividerEl);
 
    let dragging = false;
 
    function setFraction(f) {
        dividerFraction = Math.min(0.98, Math.max(0.02, f));
        dividerEl.style.left = (dividerFraction * 100) + '%';
        dividerEl.setAttribute('aria-valuenow', String(Math.round(dividerFraction * 100)));
        updateCompareClip();
    }
 
    function onPointerMove(ev) {
        const rect = map.getContainer().getBoundingClientRect();
        setFraction((ev.clientX - rect.left) / rect.width);
    }
 
    dividerEl.addEventListener('pointerdown', ev => {
        dragging = true;
        dividerEl.setPointerCapture(ev.pointerId);
        map.dragging.disable();      // otherwise the map pans while you drag the divider
        dividerEl.classList.add('dragging');
        ev.preventDefault();
        ev.stopPropagation();
    });
 
    dividerEl.addEventListener('pointermove', ev => {
        if (dragging) onPointerMove(ev);
    });
 
    const endDrag = () => {
        if (!dragging) return;
        dragging = false;
        map.dragging.enable();
        dividerEl.classList.remove('dragging');
    };
    dividerEl.addEventListener('pointerup', endDrag);
    dividerEl.addEventListener('pointercancel', endDrag);
 
    // Keyboard: arrow keys nudge the divider
    dividerEl.addEventListener('keydown', ev => {
        if (ev.key === 'ArrowLeft')  { setFraction(dividerFraction - 0.02); ev.preventDefault(); }
        if (ev.key === 'ArrowRight') { setFraction(dividerFraction + 0.02); ev.preventDefault(); }
    });
}
 
// Clip each compare pane to its side of the divider. Panes live inside the
// map pane, which moves while panning, so the clip rectangle is computed in
// layer-pane coordinates rather than screen coordinates.
function updateCompareClip() {
    if (!compareMode || !map) return;
 
    const size = map.getSize();
    const nw = map.containerPointToLayerPoint([0, 0]);
    const se = map.containerPointToLayerPoint(size);
    const divX = nw.x + size.x * dividerFraction;
 
    const pad = 50; // keep tiles that overhang the viewport from popping at the edges
    const top = nw.y - pad;
    const bottom = se.y + pad;
    const left = nw.x - pad;
    const right = se.x + pad;
 
    map.getPane('comparePaneLeft').style.clip =
        `rect(${top}px, ${divX}px, ${bottom}px, ${left}px)`;
    map.getPane('comparePaneRight').style.clip =
        `rect(${top}px, ${right}px, ${bottom}px, ${divX}px)`;
}
 
function clearCompareClip() {
    map.getPane('comparePaneLeft').style.clip = '';
    map.getPane('comparePaneRight').style.clip = '';
}
 
function updateCompareLabels() {
    const leftLabel = document.getElementById('compareLabelLeft');
    const rightLabel = document.getElementById('compareLabelRight');
    if (leftLabel) {
        leftLabel.innerText = rasterData[compareState.left.index].year + (compareState.left.error ? ' ⚠ failed to load' : '');
    }
    if (rightLabel) {
        rightLabel.innerText = rasterData[compareState.right.index].year + (compareState.right.error ? ' ⚠ failed to load' : '');
    }
}
 
function setCompareLayer(side, index) {
    const s = compareState[side];
    s.index = index;
    const token = ++s.token;
    s.error = false;
 
    const select = document.getElementById(side === 'left' ? 'compareLeftSelect' : 'compareRightSelect');
    if (select) select.value = index;
    updateCompareLabels();
 
    return getGeoRaster(index)
        .then(georaster => {
            if (token !== s.token || !compareMode) return;
 
            if (s.layer) {
                map.removeLayer(s.layer);
                s.layer = null;
            }
 
            s.georaster = georaster;
            s.layer = makeRasterLayer(georaster, s.pane);
            s.layer.addTo(map);
 
            updateCompareClip();
        })
        .catch(err => {
            console.error('Error loading raster for compare:', err);
            if (token === s.token) {
                s.error = true;
                updateCompareLabels();
            }
        });
}
 
function enterCompare() {
    compareMode = true;
    stopPlaying();
 
    // Hand over from the single-year layer
    requestToken++;
    if (rasterLayer) {
        map.removeLayer(rasterLayer);
        rasterLayer = null;
    }
    map.closePopup();
 
    document.querySelector('.time-slider-control').classList.add('compare-mode');
    const toggle = document.getElementById('compareToggle');
    if (toggle) toggle.setAttribute('aria-pressed', 'true');
 
    dividerEl.style.display = '';
 
    // Left = the year you were looking at, right = the next one
    const leftIndex = currentRasterIndex;
    const rightIndex = (currentRasterIndex + 1) % rasterData.length;
    updateCompareClip();
    setCompareLayer('left', leftIndex);
    setCompareLayer('right', rightIndex);
}
 
function exitCompare() {
    compareMode = false;
 
    ['left', 'right'].forEach(side => {
        const s = compareState[side];
        s.token++;
        if (s.layer) {
            map.removeLayer(s.layer);
            s.layer = null;
        }
        s.georaster = null;
    });
    clearCompareClip();
    map.closePopup();
 
    dividerEl.style.display = 'none';
    document.querySelector('.time-slider-control').classList.remove('compare-mode');
    const toggle = document.getElementById('compareToggle');
    if (toggle) toggle.setAttribute('aria-pressed', 'false');
 
    // Return to the year that was on the left side
    showRaster(compareState.left.index);
}
 
// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
initMap();
showRaster(0).then(() => {
    // Warm the cache so later slider moves and compare mode are instant
    for (let i = 1; i < rasterData.length; i++) {
        getGeoRaster(i).catch(() => {});
    }
});
 