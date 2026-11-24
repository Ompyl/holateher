// holateher – railway lines from OpenRailwayMap (vector tiles, original ORM dark style) with a switcher:
// Off · Tracks · Electrification · Train protection. The style is a cleaned snapshot in data/ormstyle.json
// (tools/fetch-orm-style.mjs); the tiles come live from openrailwaymap.app. Fallback: ORM raster tiles.
import { BASE_STYLE, LS } from './config.js?v=20261124d';
import { $, lsGet, lsSet } from './util.js?v=20261124d';

export const RAIL_MODES = [
  ['off', 'Off', 'No railway layer'],
  ['usage', 'Tracks', 'Main and branch lines (OpenRailwayMap standard)'],
  ['voltage_frequency', 'Electrification', 'Voltage and frequency of the overhead line (black = not electrified)'],
  ['train_protection', 'Train protection', 'Train protection system (e.g. EVM, ETCS)']
];
const RASTER = { type: 'raster', tiles: ['a', 'b', 'c'].map(s => `https://${s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png`),
  tileSize: 256, maxzoom: 19, attribution: 'OpenRailwayMap' };

let mode = lsGet(LS.railMode, 'usage');
if (!RAIL_MODES.some(m => m[0] === mode)) mode = 'usage';
let map = null, vector = false;
const origVis = new Map();          // ORM layer id -> its own visibility (an expression of the global state)

// The ORM style snapshot (same origin, ~50 kB gzipped); null = not available, use the raster tiles
export async function loadRailStyle() {
  if (maplibregl.supported && !maplibregl.supported()) return null;
  try {
    const r = await fetch('data/ormstyle.json?v=20261124d');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (e) {
    console.warn('railway style not loaded, using raster tiles', e);
    return null;
  }
}

// Base map + ORM layers in one style; our own layers are added on top later
export function buildStyle(orm) {
  if (!orm) {
    return { ...BASE_STYLE, sources: { ...BASE_STYLE.sources, ormraster: RASTER },
      layers: [...BASE_STYLE.layers, { id: 'orm-raster', type: 'raster', source: 'ormraster', paint: { 'raster-opacity': 0.6 },
        layout: { visibility: mode === 'off' ? 'none' : 'visible' } }] };
  }
  vector = true;
  const state = { ...orm.state, tracks: { ...orm.state.tracks, default: mode === 'off' ? 'usage' : mode } };
  const layers = orm.layers.map(l => {
    origVis.set(l.id, l.layout?.visibility ?? 'visible');
    return mode === 'off' ? { ...l, layout: { ...l.layout, visibility: 'none' } } : l;
  });
  return { version: 8, glyphs: orm.glyphs, sprite: orm.sprite, state,
    sources: { ...BASE_STYLE.sources, ...orm.sources }, layers: [...BASE_STYLE.layers, ...layers] };
}

function apply(next) {
  const wasOff = mode === 'off';
  mode = next;
  lsSet(LS.railMode, mode);
  $('railMode').value = mode;
  if (!vector) { map.setLayoutProperty('orm-raster', 'visibility', mode === 'off' ? 'none' : 'visible'); return; }
  // hidden layers load no tiles; on again: back to each layer's own visibility expression
  if (mode === 'off') { for (const id of origVis.keys()) map.setLayoutProperty(id, 'visibility', 'none'); return; }
  map.setGlobalStateProperty('tracks', mode);
  if (wasOff) for (const [id, v] of origVis) map.setLayoutProperty(id, 'visibility', v);
}

export function initRails(m) {
  map = m;
  const sel = $('railMode');
  sel.innerHTML = RAIL_MODES.filter(([k]) => vector || k === 'off' || k === 'usage')
    .map(([k, label, title]) => `<option value="${k}" title="${title}">${label}</option>`).join('');
  if (!vector && mode !== 'off') mode = 'usage';
  sel.value = mode;
  sel.addEventListener('change', () => {
    const go = () => apply(sel.value);
    map.isStyleLoaded() ? go() : map.once('style.load', go);
  });
}
