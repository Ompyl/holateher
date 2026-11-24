// holateher – debug view (F3, or ?debug in the address for phones): map, live polling, traffic, selection.
// Costs nothing while closed; while open it only reads state (no extra requests).
import { POLL_MS, INACTIVE_MS, PAST_DAYS_CACHE } from './config.js?v=20261124h';
import { $, esc, hhmmss } from './util.js?v=20261124h';
import { stats, cacheInfo } from './api.js?v=20261124h';
import { state, kindOfLive } from './state.js?v=20261124h';
import { liveInfo } from './live.js?v=20261124h';
import { map } from './map.js?v=20261124h';
import { tl } from './timeline.js?v=20261124h';

const VERSION = new URL(import.meta.url).searchParams.get('v') || 'dev';
let box = null, timer = null, frames = 0, fps = 0, fpsT = 0, mouse = null, hoverEvn = null;

const ago = ms => !isFinite(ms) || ms < 0 ? '–' : ms < 60e3 ? Math.round(ms / 1000) + ' s' :
  ms < 3600e3 ? Math.floor(ms / 60e3) + ' min ' + Math.round(ms % 60e3 / 1000) + ' s' : (ms / 3600e3).toFixed(1) + ' h';
const mb = b => (b / 1048576).toFixed(2) + ' MB';
const deg = (v, p, n) => Math.abs(v).toFixed(5) + '° ' + (v >= 0 ? p : n);
const yn = b => b ? 'yes' : 'no';

function frame() {
  if (!box) return;
  frames++;
  const now = performance.now();
  if (now - fpsT >= 1000) { fps = Math.round(frames * 1000 / (now - fpsT)); frames = 0; fpsT = now; }
  requestAnimationFrame(frame);
}

function vehicleLines(title, evn) {
  const v = state.byEvn.get(evn);
  if (!v) return [title + ': ' + evn + ' (not in live list)'];
  return [
    title + ': ' + evn + ' · ' + (kindOfLive(v) || 'not shown'),
    '  train: ' + (v.trainType || '–') + ' ' + (v.trainNumber || '–') + (v.relation ? ' · ' + v.relation : ''),
    '  moving: ' + yn(v.moving) + ' · heading: ' + (v.heading ?? '–') + ' · delay: ' + (v.delayMin ?? '–'),
    '  model: ' + (v.vehicleModel || '–') + ' · category: ' + (v.category ?? '–') + ' · img: ' + (state.imgByEvn.get(evn) || '–'),
    '  pos: ' + v.location_lat?.toFixed(5) + ', ' + v.location_lon?.toFixed(5)
  ];
}

function lines() {
  const c = map.getCenter(), z = map.getZoom(), L = liveInfo(), C = cacheInfo(), now = Date.now();
  const phone = matchMedia('(max-width: 700px)').matches;
  const live = L.hidden ? 'paused (tab hidden)' : L.pausedInactive ? 'paused (inactive)' : L.polling ? 'polling every ' + POLL_MS / 1000 + ' s' : 'stopped';
  const mins = (now - stats.since) / 60e3;
  const rail = state.live.filter(v => v.is_rail_uic).length;
  const shown = state.counts.freight + state.counts.idle + state.counts.pass;
  const out = [
    ['holateher ' + VERSION + ' · MapLibre ' + (window.maplibregl?.getVersion?.() || '?')],
    [fps + ' fps · ' + innerWidth + '×' + innerHeight + ' @' + +devicePixelRatio.toFixed(2) + 'x · ' + (phone ? 'phone' : 'desktop') + ' layout'],
    [],
    ['Zoom: ' + z.toFixed(2) + ' (tiles z' + Math.floor(z) + ') · bearing ' + map.getBearing().toFixed(1) + '° · pitch ' + map.getPitch().toFixed(0) + '°'],
    ['Center: ' + deg(c.lat, 'N', 'S') + ', ' + deg(c.lng, 'E', 'W')],
    ['Mouse: ' + (mouse ? deg(mouse.lat, 'N', 'S') + ', ' + deg(mouse.lng, 'E', 'W') : '–')],
    ['Tiles loaded: ' + yn(map.areTilesLoaded())],
    [],
    ['Live: ' + live + (L.busy ? ' · loading …' : '')],
    ['Last update: ' + (L.lastOk ? new Date(L.lastOk).toLocaleTimeString('en-GB') + ' (' + ago(now - L.lastOk) + ' ago)' : '–') +
      (L.lastError ? ' · error: ' + L.lastError : '')],
    ['Inactive since: ' + ago(now - L.lastActivity) + ' (pause after ' + INACTIVE_MS / 60e3 + ' min)'],
    ['Vehicles: ' + state.live.length + ' in list · ' + rail + ' rail · ' + shown + ' on map'],
    ['Shown: ' + state.counts.freight + ' freight · ' + state.counts.idle + ' idle · ' + state.counts.pass + ' passenger'],
    ['Known locos: ' + state.known.size + ' in loks.csv · ' + Object.keys(state.seen).length + ' seen (48 h)'],
    [],
    ['Requests: ' + stats.requests + ' · ' + mb(stats.bytes) + ' in ' + ago(now - stats.since) +
      ' (' + (mins > 0 ? mb(stats.bytes / mins) : '–') + '/min)'],
    ['Cache: ' + C.pastDays + '/' + PAST_DAYS_CACHE + ' past days · ' + C.memo + ' once-per-session · icons ' + ago(C.iconsAge) + ' old']
  ];
  if (tl.open) {
    out.push([], ['Timeline: ' + tl.evn + ' · day ' + tl.day + ' · range ' + tl.range + (tl.effRange !== tl.range ? ' (eff. ' + tl.effRange + ')' : '')]);
    out.push(['  points: ' + tl.pts.length + ' · cursor ' + tl.cur + (tl.times[tl.cur] ? ' = ' + hhmmss(tl.times[tl.cur]) : '') +
      ' · ' + (tl.live ? 'LIVE' : 'rewound') + (tl.playing ? ' · playing ' + tl.speed + 'x' : '')]);
    out.push(['  days with data: ' + tl.days.length + ' · trains: ' + tl.trains.length]);
  }
  if (state.selected) out.push([], ...vehicleLines('Selected', state.selected).map(l => [l]));
  if (hoverEvn && hoverEvn !== state.selected) out.push([], ...vehicleLines('Under mouse', hoverEvn).map(l => [l]));
  return out;
}

function render() {
  if (!box) return;
  box.innerHTML = lines().map(([t]) => t === undefined ? '<br>' : '<span>' + esc(t) + '</span>').join('');
}

function onMove(e) {
  mouse = e.lngLat;
  const f = map.getLayer('vehicles') ? map.queryRenderedFeatures(e.point, { layers: ['vehicles'] })[0] : null;
  hoverEvn = f?.properties.evn || null;
}

export function toggleDebug(on = !box) {
  if (on === !!box) return;
  if (on) {
    box = document.createElement('div');
    box.id = 'debug';
    box.className = 'debug';
    document.body.append(box);
    map.on('mousemove', onMove);
    fpsT = performance.now(); frames = 0;
    requestAnimationFrame(frame);
    timer = setInterval(render, 250);
    render();
  } else {
    clearInterval(timer);
    map.off('mousemove', onMove);
    box.remove();
    box = null; mouse = null; hoverEvn = null;
  }
}

export function initDebug() {
  window.addEventListener('keydown', e => {
    if (e.key !== 'F3') return;
    e.preventDefault();                       // F3 is "find" in some browsers
    toggleDebug();
  });
  if (new URLSearchParams(location.search).has('debug')) toggleDebug(true);
}
