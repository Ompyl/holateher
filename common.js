/* holateher – shared code for the live map (app.js) and the history page (history.js).
 * Everything is exposed as window.HT.
 */
(() => {
  'use strict';

  const API = 'https://api.realtimenext.hu/api/';
  // Base map: normal OpenStreetMap raster tiles, darkened like OpenRailwayMap with the dark theme:
  // saturation 50 % and opacity 50 % over the dark page colour (ORM: CSS filter saturate() opacity() on its background map).
  // Fonts for our labels: OpenFreeMap. OSM tile usage policy: https://operations.osmfoundation.org/policies/tiles/
  const BASE_OPACITY = 0.5, BASE_SATURATION = 0.5;      // 0..1 (like OpenRailwayMap's background sliders)
  const BASE_STYLE = {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19 }
    },
    layers: [
      { id: 'base-bg', type: 'background', paint: { 'background-color': '#1b262b' } },
      { id: 'osm', type: 'raster', source: 'osm',
        paint: { 'raster-saturation': BASE_SATURATION - 1, 'raster-opacity': BASE_OPACITY } }   // MapLibre saturation: -1 = grey, 0 = unchanged
    ]
  };

  const COUNTRY = {
    '80': 'Germany', '81': 'Austria', '55': 'Hungary', '54': 'Czechia', '56': 'Slovakia',
    '53': 'Romania', '51': 'Poland', '79': 'Slovenia', '78': 'Croatia', '72': 'Serbia',
    '52': 'Bulgaria', '85': 'Switzerland', '83': 'Italy', '84': 'Netherlands', '88': 'Belgium',
    '86': 'Denmark', '74': 'Sweden', '87': 'France', '43': 'Hungary/Austria (GySEV)'
  };
  const KIND = {
    '90': 'Other', '91': 'Electric loco', '92': 'Diesel loco', '93': 'Electric multiple unit',
    '94': 'Electric multiple unit', '95': 'Diesel multiple unit', '97': 'Diesel shunter', '98': 'Shunter'
  };

  // ------------------------------------------------------------------
  // Small helpers
  // ------------------------------------------------------------------
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isEvn = s => /^\d{12}$/.test(String(s || ''));
  const fmtEvn = n => isEvn(n) ? `${n.slice(0, 2)} ${n.slice(2, 4)} ${n.slice(4, 8)} ${n.slice(8, 11)}-${n[11]}` : String(n || '');
  const countryOf = n => isEvn(n) ? (COUNTRY[n.slice(2, 4)] || 'Code ' + n.slice(2, 4)) : '';
  const kindOf = n => isEvn(n) ? (KIND[n.slice(0, 2)] || '') : '';
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  const parseYmd = s => /^\d{8}$/.test(s || '') ? new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) : null;
  const isoDate = s => s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
  const hhmm = t => { const d = new Date(t * 1000); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const hhmmss = t => { const d = new Date(t * 1000); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };
  const durText = s => { const m = Math.round(s / 60); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + pad(m % 60); };
  const lsGet = (k, def) => { try { const v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };
  // History mode of the live page (relative link, works on the live page and in the Excel export)
  const historyUrl = (evn, day, days) => '?loco=' + encodeURIComponent(evn) + (day ? '&date=' + day : '') + (days > 1 ? '&days=' + days : '');
  const datasheetUrl = evn => 'https://realtimenext.hu/vehicles/' + encodeURIComponent(evn);   // opens in a new tab
  // Photos on bahnbilder.de: search for the short number as painted on the loco (e.g. "193 837"),
  // the full EVN rarely appears in captions. Can also find other vehicles with the same short number.
  const shortNo = evn => isEvn(evn) ? evn.slice(5, 8) + ' ' + evn.slice(8, 11) : String(evn || '');
  const photosUrl = evn => 'https://www.bahnbilder.de/name/galerie/kategorie/suchen/suchbegriff/' + encodeURIComponent(shortNo(evn)).replace(/%20/g, '+') + '.html';
  // 5-digit train number from 30000 = probably freight (only used where trainType is missing, i.e. history data)
  const looksFreight = (rid, headsign) => /^\d{5}$/.test(rid) && +rid >= 30000 &&
    !/intercity|személy|railjet|eurocity|euronight|gyors|sebes|expressz|nightjet|regional/i.test(headsign || '');

  async function getJSON(url) {
    const r = await fetch(url, { credentials: 'omit' });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
    return r.json();
  }

  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  }

  // Simple CSV reader (quotes, commas and line breaks inside fields)
  function parseCSV(text) {
    const rows = []; let row = [], field = '', q = false;
    text = text.replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') q = false;
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    const head = (rows.shift() || []).map(h => h.trim());
    return rows.filter(r => r.some(v => v.trim() !== '')).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
  }

  // Positions of one loco on one day (only points with coordinates), [] on error
  async function dayPoints(evn, day) {
    try {
      const data = await getJSON(API + 'bkv/vehicles/' + encodeURIComponent(evn) + '/' + day);
      return Array.isArray(data) ? data.filter(p => p.location_lat != null && p.location_lon != null) : [];
    } catch (e) { return []; }
  }

  // ------------------------------------------------------------------
  // Route travelled: smooth speed colours, stops
  // ------------------------------------------------------------------
  // bright colours for the darkened map
  const SPEED_STOPS = [[0, '#c04bff'], [15, '#ff2e63'], [40, '#ff8c1a'], [70, '#ffe81a'], [100, '#7cff4f'], [120, '#00f5a0']];
  const SPEED_MAX = 120;              // from 120 km/h it is mostly a GPS jump: same colour
  const SPEED_COLOR_EXPR = ['interpolate', ['linear'], ['get', 'kmh'], ...SPEED_STOPS.flat()];
  const STOP_COLOR = '#b23cff';     // saturated purple
  const GAP_SECONDS = 600;            // longer without data: dashed
  const STOP_RADIUS_M = 60, STOP_MIN_S = 120;
  const MIN_STEP_M = 20;              // smaller moves = GPS jitter while standing
  const SMOOTH_STEPS = 2;             // average speed over ±2 neighbouring pieces (~4–5 min)

  function distM(a, b) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  // Route as many short pieces, each with its own (smoothed) speed and age
  // (0 = oldest, 1 = newest). Properties pi/pj = index of start/end point in coords.
  // Single pieces instead of long lines: no hairpins inside a line, so the
  // sideways offset (out and back side by side) stays clean.
  function buildSpeedGeo(coords, times) {
    const kept = [0];
    for (let i = 1; i < coords.length; i++) if (distM(coords[kept[kept.length - 1]], coords[i]) >= MIN_STEP_M) kept.push(i);
    const t0 = times[0], span = Math.max(1, times[times.length - 1] - t0);
    const steps = [];
    for (let k = 0; k < kept.length - 1; k++) {
      const i = kept[k], j = kept[k + 1];
      const dt = times[j] - times[j - 1];      // only the last step counts: before that the train stood near coords[i]
      steps.push({ i, j, d: distM(coords[i], coords[j]), dt, gap: dt > GAP_SECONDS });
    }
    const feats = steps.map((s, k) => {
      let d = 0, dt = 0;
      for (let n = Math.max(0, k - SMOOTH_STEPS); n <= Math.min(steps.length - 1, k + SMOOTH_STEPS); n++) {
        if (steps[n].gap || steps[n].dt <= 0) continue;
        d += steps[n].d; dt += steps[n].dt;
      }
      const kmh = dt > 0 ? d / dt * 3.6 : SPEED_MAX;
      return {
        type: 'Feature',
        properties: { kmh: Math.min(SPEED_MAX, Math.round(kmh)), gap: s.gap, age: (times[s.j] - t0) / span, pi: s.i, pj: s.j },
        geometry: { type: 'LineString', coordinates: [coords[s.i], coords[s.j]] }
      };
    });
    return { type: 'FeatureCollection', features: feats };
  }

  function buildStopGeo(coords, times) {
    const feats = []; let i = 0;
    while (i < coords.length) {
      let j = i;
      while (j + 1 < coords.length && distM(coords[i], coords[j + 1]) < STOP_RADIUS_M) j++;
      const dur = times[j] - times[i];
      if (dur >= STOP_MIN_S) {
        let lon = 0, lat = 0;
        for (let k = i; k <= j; k++) { lon += coords[k][0]; lat += coords[k][1]; }
        const n = j - i + 1;
        feats.push({
          type: 'Feature',
          properties: { min: dur / 60, short: durText(dur), long: hhmm(times[i]) + '–' + hhmm(times[j]) + ' (' + durText(dur) + ')', i0: i, i1: j },
          geometry: { type: 'Point', coordinates: [lon / n, lat / n] }
        });
        i = j + 1;
      } else i++;
    }
    return { type: 'FeatureCollection', features: feats };
  }

  // ------------------------------------------------------------------
  // Map pieces
  // ------------------------------------------------------------------
  const EMPTY = { type: 'FeatureCollection', features: [] };

  function makeArrowIcon() {
    const w = 20, h = 20, c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(7, 5); g.lineTo(13, 10); g.lineTo(7, 15); g.stroke();
    return g.getImageData(0, 0, w, h);
  }

  // Own loco symbol (instead of realtimenext's grey question mark)
  function makeFallbackIcon() {
    const s = 96, c = document.createElement('canvas'); c.width = c.height = s;
    const g = c.getContext('2d');
    g.fillStyle = '#1b262b'; g.strokeStyle = '#ffffff'; g.lineWidth = 6;
    g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 5, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#ffd27f'; g.fillRect(22, 30, 52, 30);
    g.fillStyle = '#1b262b'; g.fillRect(28, 35, 14, 10); g.fillRect(54, 35, 14, 10);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(34, 66, 6, 0, Math.PI * 2); g.arc(62, 66, 6, 0, Math.PI * 2); g.fill();
    return g.getImageData(0, 0, s, s);
  }

  // Sources trail-day / trail-speed / trail-stops and their layers.
  // Opacity: live = older parts fade (age); history = parts after the slider fade (setTrailCursor).
  function addTrailLayers(map, beforeId) {
    if (!map.hasImage('arrow')) map.addImage('arrow', makeArrowIcon(), { pixelRatio: 2 });
    for (const id of ['trail-day', 'trail-speed', 'trail-stops']) map.addSource(id, { type: 'geojson', data: EMPTY });
    const lineLayout = { 'line-join': 'round', 'line-cap': 'round' };
    const OFFSET = 2;                                        // right of travel direction: out and back side by side
    const ageOpacity = (min, max) => ['interpolate', ['linear'], ['get', 'age'], 0, min, 1, max];
    const zoomWidth = (w6, w14) => ['interpolate', ['linear'], ['zoom'], 6, w6, 14, w14];
    const solid = ['!', ['get', 'gap']];
    const add = l => map.addLayer(l, beforeId);
    add({ id: 'trail-day', type: 'line', source: 'trail-day', layout: lineLayout,
      paint: { 'line-color': '#7d8f96', 'line-width': zoomWidth(1.5, 3), 'line-opacity': 0.45, 'line-dasharray': [1, 2] } });
    add({ id: 'trail-gap', type: 'line', source: 'trail-speed', filter: ['get', 'gap'],
      paint: { 'line-color': '#8a9aa0', 'line-width': 2, 'line-dasharray': [1.5, 2], 'line-opacity': ageOpacity(0.3, 0.7), 'line-offset': OFFSET } });
    // thin dark edge under the coloured line, so it stands out on the map (flat, no glow)
    add({ id: 'trail-casing', type: 'line', source: 'trail-speed', layout: lineLayout, filter: solid,
      paint: { 'line-color': '#0d1418', 'line-width': zoomWidth(5.5, 9.5), 'line-opacity': ageOpacity(0.2, 0.55), 'line-offset': OFFSET } });
    // flat line in bright speed colours; older parts a bit more transparent
    add({ id: 'trail-line', type: 'line', source: 'trail-speed', layout: lineLayout, filter: solid,
      paint: { 'line-color': SPEED_COLOR_EXPR, 'line-width': zoomWidth(3.5, 7), 'line-opacity': ageOpacity(0.5, 1), 'line-offset': OFFSET } });
    add({ id: 'trail-arrows', type: 'symbol', source: 'trail-speed', minzoom: 8,
      filter: ['all', solid, ['>', ['get', 'kmh'], 5]],
      layout: { 'symbol-placement': 'line', 'symbol-spacing': 70, 'icon-image': 'arrow',
        'icon-size': zoomWidth(0.6, 1), 'icon-allow-overlap': true, 'icon-rotation-alignment': 'map' },
      paint: { 'icon-opacity': ageOpacity(0.3, 0.85) } });
    // stop: purple disc without outline (size = duration) and a white centre
    add({ id: 'trail-stops', type: 'circle', source: 'trail-stops',
      paint: { 'circle-color': STOP_COLOR, 'circle-opacity': 0.55,
        'circle-radius': ['interpolate', ['linear'], ['get', 'min'], 2, 6, 30, 10, 180, 16] } });
    add({ id: 'trail-stop-core', type: 'circle', source: 'trail-stops',
      paint: { 'circle-color': '#ffffff', 'circle-radius': 2.6, 'circle-stroke-color': STOP_COLOR, 'circle-stroke-width': 1.2 } });
    add({ id: 'trail-stop-label', type: 'symbol', source: 'trail-stops', minzoom: 10,
      layout: { 'text-field': ['step', ['zoom'], ['get', 'short'], 13, ['get', 'long']], 'text-font': ['Noto Sans Regular'],
        'text-size': 11, 'text-offset': [0, 1.2], 'text-anchor': 'top' },
      paint: { 'text-color': '#f6ecff', 'text-halo-color': 'rgba(13,20,24,0.9)', 'text-halo-width': 1.6 } });
  }

  // History mode: everything after point index `cur` is drawn faint
  function setTrailCursor(map, cur) {
    const past = ['<', ['get', 'pi'], cur];
    const op = (a, b) => ['case', past, a, b];
    // travelled part fully visible, the part after the slider faint
    map.setPaintProperty('trail-line', 'line-opacity', op(1, 0.3));
    map.setPaintProperty('trail-casing', 'line-opacity', op(0.55, 0.12));
    map.setPaintProperty('trail-gap', 'line-opacity', op(0.7, 0.3));
    map.setPaintProperty('trail-arrows', 'icon-opacity', op(0.85, 0));
  }

  // Back to the live look: older parts fade (same values as in addTrailLayers)
  function resetTrailCursor(map) {
    const ageOpacity = (min, max) => ['interpolate', ['linear'], ['get', 'age'], 0, min, 1, max];
    map.setPaintProperty('trail-line', 'line-opacity', ageOpacity(0.5, 1));
    map.setPaintProperty('trail-casing', 'line-opacity', ageOpacity(0.2, 0.55));
    map.setPaintProperty('trail-gap', 'line-opacity', ageOpacity(0.3, 0.7));
    map.setPaintProperty('trail-arrows', 'icon-opacity', ageOpacity(0.3, 0.85));
  }

  function setTrail(map, dayLine, speed, stops) {
    map.getSource('trail-day')?.setData(dayLine || EMPTY);
    map.getSource('trail-speed')?.setData(speed || EMPTY);
    map.getSource('trail-stops')?.setData(stops || EMPTY);
  }

  function legendHTML(withDay) {
    return `
      <div class="gradient" style="background:linear-gradient(to right, ${SPEED_STOPS.map(([k, c]) => c + ' ' + Math.round(k / SPEED_MAX * 100) + '%').join(', ')})"></div>
      <div class="ticks"><span>0</span><span>30</span><span>60</span><span>90</span><span>120+ km/h</span></div>
      <div class="legend2"><span><span class="dot"></span> stop ≥ 2 min</span><span><span class="dash"></span> no data</span>${withDay ? '<span><span class="dash day"></span> earlier today</span>' : ''}</div>`;
  }

  function openGoogle(map) {
    const c = map.getCenter();
    const z = Math.round(map.getZoom() + 1);  // MapLibre zoom ≈ Google zoom − 1
    window.open(`https://www.google.com/maps/@${c.lat.toFixed(5)},${c.lng.toFixed(5)},${z}z`, '_blank', 'noopener');
  }
  function openOrm(map) {
    const c = map.getCenter();
    const z = Math.round(map.getZoom() * 10) / 10;
    window.open(`https://openrailwaymap.app/#view=${z}/${c.lat.toFixed(5)}/${c.lng.toFixed(5)}`, '_blank', 'noopener');
  }

  window.HT = {
    API, BASE_STYLE, EMPTY, SPEED_STOPS, SPEED_MAX, STOP_COLOR,
    $, esc, isEvn, fmtEvn, countryOf, kindOf, pad, ymd, parseYmd, isoDate, hhmm, hhmmss, durText,
    lsGet, lsSet, historyUrl, datasheetUrl, photosUrl, shortNo, looksFreight, getJSON, loadScript, parseCSV, dayPoints,
    distM, buildSpeedGeo, buildStopGeo, makeArrowIcon, makeFallbackIcon,
    addTrailLayers, setTrailCursor, resetTrailCursor, setTrail, legendHTML, openGoogle, openOrm
  };
})();
