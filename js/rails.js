// holateher – railway lines from OpenRailwayMap (vector tiles, original ORM dark style) with a switcher:
// Off · Tracks · Electrification · Train protection. The style is a cleaned snapshot in data/ormstyle.json
// (tools/fetch-orm-style.mjs); the tiles come live from openrailwaymap.app. Fallback: ORM raster tiles.
import { BASE_STYLE, LS } from './config.js?v=20261124g';
import { $, lsGet, lsSet } from './util.js?v=20261124g';

// [mode, label, description, pictogram (24x24 SVG content, stroke = currentColor), colour]
const svg = (body, color) => `<svg viewBox="0 0 24 24" aria-hidden="true" style="color:${color}"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
export const RAIL_MODES = [
  ['off', 'Off', 'No railway layer',
    svg('<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>', '#9fb2b8')],
  ['usage', 'Tracks', 'Main and branch lines',
    svg('<path d="M8.5 2.5 6 21.5M15.5 2.5 18 21.5"/><path d="M6.4 7h11.2M5.8 12h12.4M5.2 17h13.6" stroke-width="1.7"/>', '#ff9a2e')],
  ['voltage_frequency', 'Electrification', 'Overhead line voltage · black = none',
    svg('<path d="M13.5 2.5 5.5 13.5h6l-1.5 8 8.5-11.5h-6z"/>', '#ffd23f')],
  ['train_protection', 'Train protection', 'Train protection system (EVM, ETCS …)',
    svg('<path d="M12 2.5 4.5 5.5v6c0 4.6 3.2 8.4 7.5 10 4.3-1.6 7.5-5.4 7.5-10v-6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>', '#5fd18b')]
];
const chevron = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
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
    const r = await fetch('data/ormstyle.json?v=20261124g');
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

const modes = () => RAIL_MODES.filter(([k]) => vector || k === 'off' || k === 'usage');   // raster fallback: on / off only

function renderUi() {
  const [, label, , icon] = RAIL_MODES.find(m => m[0] === mode);
  $('railBtn').innerHTML = `${icon}<span class="rl">Rails</span><b>${label}</b>${chevron}`;
  $('railMenu').innerHTML = modes().map(([k, l, desc, ic]) =>
    `<button type="button" role="option" data-mode="${k}" aria-selected="${k === mode}">${ic}<span><b>${l}</b><small>${desc}</small></span></button>`).join('');
}

const menuIsOpen = () => !$('railMenu').hidden;
function openMenu(on) {
  $('railMenu').hidden = !on;
  $('railBtn').setAttribute('aria-expanded', String(on));
  $('railSel').classList.toggle('open', on);
}

function apply(next) {
  const wasOff = mode === 'off';
  mode = next;
  lsSet(LS.railMode, mode);
  renderUi();
  if (!vector) { map.setLayoutProperty('orm-raster', 'visibility', mode === 'off' ? 'none' : 'visible'); return; }
  // hidden layers load no tiles; on again: back to each layer's own visibility expression
  if (mode === 'off') { for (const id of origVis.keys()) map.setLayoutProperty(id, 'visibility', 'none'); return; }
  map.setGlobalStateProperty('tracks', mode);
  if (wasOff) for (const [id, v] of origVis) map.setLayoutProperty(id, 'visibility', v);
}

export function initRails(m) {
  map = m;
  if (!vector && mode !== 'off') mode = 'usage';
  renderUi();
  $('railBtn').addEventListener('click', () => openMenu(!menuIsOpen()));
  $('railMenu').addEventListener('click', e => {
    const k = e.target.closest('button[data-mode]')?.dataset.mode;
    if (!k) return;
    openMenu(false);
    if (k === mode) return;
    const go = () => apply(k);
    map.isStyleLoaded() ? go() : map.once('style.load', go);
  });
  // close on a click / tap elsewhere and on Esc (before the other Esc handlers)
  document.addEventListener('pointerdown', e => { if (menuIsOpen() && !$('railSel').contains(e.target)) openMenu(false); }, true);
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && menuIsOpen()) { e.stopImmediatePropagation(); openMenu(false); $('railBtn').focus(); }
  }, true);
}
