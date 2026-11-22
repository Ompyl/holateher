// holateher – the map: base style, saved view, vehicle symbols (images), tooltip, clicks, fitting a route.
import { BASE_STYLE, HU_VIEW, LS, FONT, ACCENT, URLS } from './config.js?v=20261122i';
import { $, esc, lsGet, lsSet, emit } from './util.js?v=20261122i';
import { fmtEvn } from './evn.js?v=20261122i';
import { state, kindOfLive, lastFreightText, delayText, motionText } from './state.js?v=20261122i';
import { EMPTY } from './track.js?v=20261122i';

export let map;
const loadedImg = new Map();          // image id -> promise (resolves when added to the map)

export function createMap() {
  const saved = lsGet(LS.view, null);
  map = new maplibregl.Map({
    container: 'map',
    style: BASE_STYLE,
    center: saved?.center || HU_VIEW.center,
    zoom: saved?.zoom ?? HU_VIEW.zoom,
    attributionControl: false
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  map.on('moveend', () => lsSet(LS.view, { center: map.getCenter().toArray(), zoom: map.getZoom() }));
  return map;
}

// ---- images ----
// Own loco symbol (instead of realtimenext's grey question mark)
export function fallbackIcon() {
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

function ensureImage(id, url) {
  if (!loadedImg.has(id)) {
    loadedImg.set(id, map.loadImage(url)
      .then(img => { if (!map.hasImage(id)) map.addImage(id, img.data); })
      .catch(e => { console.warn('image not loaded', id, url, e); if (!map.hasImage(id)) map.addImage(id, fallbackIcon()); }));
  }
  return loadedImg.get(id);
}

// Most common realtimenext category per model (stand-in for missing / "?" images); remembered for offline locos
function modelCategories() {
  const counts = new Map();
  for (const v of state.live) {
    const cat = v.category != null ? String(v.category) : '';
    if (!cat || cat === '1' || !v.vehicleModel) continue;
    const m = counts.get(v.vehicleModel) || new Map();
    m.set(cat, (m.get(cat) || 0) + 1);
    counts.set(v.vehicleModel, m);
  }
  const modelCat = new Map([...counts].map(([k, m]) => [k, [...m].sort((a, b) => b[1] - a[1])[0][0]]));
  const modelIcons = {};
  for (const [model, cat] of modelCat) if (state.iconUrl.has(cat)) modelIcons[model] = state.iconUrl.get(cat);
  if (Object.keys(modelIcons).length) lsSet(LS.modelIcons, modelIcons);
  return modelCat;
}

// Image id: own category > realtimenext category > same model > fallback
function imageFor(v, modelCat) {
  const own = state.known.get(v.rail_uic)?.bildkategorie;
  if (own && state.customImg.has(own)) return 'own:' + own;
  let cat = v.category != null ? String(v.category) : '';
  if ((!cat || cat === '1') && modelCat.has(v.vehicleModel)) cat = modelCat.get(v.vehicleModel);
  if (cat && cat !== '1' && state.iconUrl.has(cat)) return 'rtn:' + cat;
  return 'fallback';
}

function imageUrl(id) {
  if (id.startsWith('rtn:')) return URLS.asset(state.iconUrl.get(id.slice(4)));
  if (id.startsWith('own:')) return state.customImg.get(id.slice(4));
  return null;
}

// ---- vehicles ----
export function addVehicleLayers() {
  map.addImage('fallback', fallbackIcon());
  loadedImg.set('fallback', Promise.resolve());
  map.addSource('vehicles', { type: 'geojson', data: EMPTY });
  map.addLayer({ id: 'vehicle-sel', type: 'circle', source: 'vehicles', filter: ['==', ['get', 'sel'], true],
    paint: { 'circle-radius': 20, 'circle-color': 'rgba(31,138,138,0.25)', 'circle-stroke-color': ACCENT, 'circle-stroke-width': 2 } });
  map.addLayer({ id: 'vehicles', type: 'symbol', source: 'vehicles',
    layout: {
      'icon-image': ['get', 'img'],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 6, ['case', ['get', 'pass'], 0.12, 0.16], 14, ['case', ['get', 'pass'], 0.24, 0.3]],
      'icon-allow-overlap': true,
      'symbol-sort-key': ['get', 'rank'],                         // freight on top, then passenger, then idle
      // zoom step outermost (MapLibre rule); passenger numbers only from zoom 9
      'text-field': ['step', ['zoom'], ['case', ['get', 'pass'], '', ['get', 'zug']], 9, ['get', 'zug']],
      'text-font': FONT, 'text-size': 11, 'text-offset': [0, 1.5], 'text-anchor': 'top', 'text-optional': true
    },
    paint: {
      'icon-opacity': ['case', ['get', 'idle'], 0.45, ['get', 'pass'], 0.8, 1],
      'text-color': ['case', ['get', 'pass'], '#4a5a62', '#1b262b'], 'text-halo-color': '#ffffff', 'text-halo-width': 1.5,
      'text-opacity': ['case', ['get', 'idle'], 0.5, ['get', 'pass'], 0.8, 1]
    } });

  // overlapping symbols: freight train > passenger train > idle loco
  const pick = fs => fs.reduce((best, f) => !best || f.properties.rank > best.properties.rank ? f : best, null);
  map.on('click', 'vehicles', e => { const f = pick(e.features || []); if (f) emit('pick', f.properties.evn); });
  map.on('mouseenter', 'vehicles', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'vehicles', () => { map.getCanvas().style.cursor = ''; });

  // tooltip only with a real mouse (phones have no hover)
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 18, className: 'tip', maxWidth: '280px' });
    let tipEvn = null;
    const hide = () => { tip.remove(); tipEvn = null; };
    map.on('mousemove', 'vehicles', e => {
      const f = pick(e.features || []);
      if (!f) return;
      tip.setLngLat(f.geometry.coordinates);
      if (f.properties.evn !== tipEvn) { tipEvn = f.properties.evn; tip.setHTML(tipHtml(tipEvn)); }
      if (!tip.isOpen()) tip.addTo(map);
    });
    map.on('mouseleave', 'vehicles', hide);
    map.on('movestart', hide);
  }
}

function tipHtml(evn) {
  const v = state.byEvn.get(evn), k = state.known.get(evn);
  if (!v) return '';
  const kind = kindOfLive(v);
  const title = kind === 'freight' ? 'Train ' + (v.trainNumber || '') : kind === 'pass' ? 'Passenger train ' + (v.trainNumber || '') : fmtEvn(evn);
  const rel = kind === 'idle' || !kind ? (lastFreightText(evn) || 'no train') : (v.relation || '');
  const line = [v.vehicleModel || k?.loktyp, delayText(v), motionText(v)].filter(Boolean).join(' · ');
  return `<strong>${esc(title)}</strong>${rel ? `<div>${esc(rel)}</div>` : ''}<div class="tip-sub">${esc(line)}</div>`;
}

// Draw the live vehicles according to the switches; updates state.counts
let drawSeq = 0;
export async function drawVehicles() {
  if (!map?.getSource('vehicles')) return;
  const seq = ++drawSeq;
  const modelCat = modelCategories();
  const feats = [];
  const counts = { freight: 0, idle: 0, pass: 0 };
  state.imgByEvn.clear();
  for (const v of state.live) {
    if (!v.is_rail_uic || v.location_lat == null || v.location_lon == null) continue;
    const kind = kindOfLive(v);
    if (!kind || (kind === 'pass' && !state.showPass) || (kind === 'idle' && !state.showIdle)) continue;
    counts[kind]++;
    const img = imageFor(v, modelCat);
    state.imgByEvn.set(v.rail_uic, img);
    feats.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [v.location_lon, v.location_lat] },
      properties: { evn: v.rail_uic, zug: v.trainNumber || '', idle: kind === 'idle', pass: kind === 'pass',
        rank: kind === 'freight' ? 2 : kind === 'pass' ? 1 : 0, img, sel: v.rail_uic === state.selected }
    });
  }
  state.counts = counts;
  // wait for all images (also ones another draw call is still loading), else MapLibre warns and draws nothing
  await Promise.all([...new Set(feats.map(f => f.properties.img))].map(id => imageUrl(id) ? ensureImage(id, imageUrl(id)) : null));
  if (seq !== drawSeq) return;                                  // a newer draw call has taken over
  map.getSource('vehicles').setData({ type: 'FeatureCollection', features: feats });
  emit('counts', counts);
}

// Slider not at "now": hide all other trains (filter, not removing: they come back at once)
export function showOtherVehicles(on) {
  if (!map.getLayer('vehicles')) return;
  const none = ['==', ['get', 'evn'], ''];
  map.setFilter('vehicles', on ? null : none);
  map.setFilter('vehicle-sel', on ? ['==', ['get', 'sel'], true] : none);
}

// Zoom to coordinates, keeping them clear of the header, info panel and timeline dock (works for both layouts)
export function fitCoords(coords) {
  if (!coords?.length) return;
  if (coords.length < 2) { map.jumpTo({ center: coords[0], zoom: 12 }); return; }
  const W = innerWidth, H = innerHeight, gap = 24;
  const pad = { top: gap, bottom: gap, left: gap, right: gap };
  const rect = id => { const el = $(id); if (!el || el.hidden) return null; const r = el.getBoundingClientRect(); return r.width ? r : null; };
  const bar = rect('bar');
  if (bar && getComputedStyle($('bar')).position === 'fixed' && bar.top < 5 && bar.width > W / 2) pad.top = bar.bottom + gap;
  const panel = rect('panel');
  if (panel) {
    if (panel.width > W / 2) pad.top = Math.max(pad.top, panel.bottom + gap);   // phone: panel across the top
    else pad.right = W - panel.left + gap;                                      // desktop: panel on the right
  }
  const dock = rect('dock');
  if (dock) pad.bottom = H - dock.top + gap;
  // tiny screens: never pad away more than the map
  if (pad.top + pad.bottom > H - 80) pad.top = pad.bottom = Math.max(10, (H - 80) / 2);
  if (pad.left + pad.right > W - 80) pad.left = pad.right = Math.max(10, (W - 80) / 2);
  const b = new maplibregl.LngLatBounds();
  for (const c of coords) b.extend(c);
  map.fitBounds(b, { padding: pad, maxZoom: 13, duration: 0 });
}
