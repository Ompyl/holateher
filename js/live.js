// holateher – live list polling: every 10 s, only while the tab is visible and someone is using the page.
// After 10 min without mouse / touch / key the polling pauses; the next interaction resumes it at once.
import { POLL_MS, INACTIVE_MS, SEEN_KEEP_MS, LS } from './config.js?v=20261122g';
import { $, lsSet, emit, clockText } from './util.js?v=20261122g';
import { isEvn } from './evn.js?v=20261122g';
import { fetchLive } from './api.js?v=20261122g';
import { state } from './state.js?v=20261122g';

let timer = null, lastActivity = Date.now(), pausedInactive = false, busy = false;

export const isActive = () => document.visibilityState === 'visible' && !pausedInactive;

function setStatus(text, cls = '') {
  const el = $('status');
  el.textContent = text;
  el.className = 'status ' + cls;
}

function rememberFreight(list) {
  const now = Date.now();
  for (const v of list) {
    if (v.trainType === 'T' && isEvn(v.rail_uic)) {
      state.seen[v.rail_uic] = { t: now, zug: v.trainNumber || '', rel: v.relation || '', model: v.vehicleModel || '' };
    }
  }
  for (const [k, s] of Object.entries(state.seen)) if (now - s.t > SEEN_KEEP_MS) delete state.seen[k];
  lsSet(LS.seen, state.seen);
}

export async function refresh() {
  if (busy) return;
  busy = true;
  try {
    const list = await fetchLive();
    state.live = list;
    state.byEvn = new Map(list.filter(v => v.is_rail_uic).map(v => [v.rail_uic, v]));
    rememberFreight(list);
    setStatus('updated ' + clockText());
    emit('live');
  } catch (e) {
    console.error(e);
    setStatus('Could not load live data – retrying shortly', 'error');
  } finally { busy = false; }
}

function tick() {
  if (Date.now() - lastActivity > INACTIVE_MS) {
    stop();
    pausedInactive = true;
    setStatus('paused (inactive) – tap or move the mouse to resume', 'paused');
    return;
  }
  refresh();
}

function stop() { clearInterval(timer); timer = null; }
function start() {
  stop();
  pausedInactive = false;
  timer = setInterval(tick, POLL_MS);
  return refresh();
}

function activity() {
  lastActivity = Date.now();
  if (pausedInactive && document.visibilityState === 'visible') start();
}

// Returns the promise of the first live list (or null while the tab is hidden)
export function startLive() {
  for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']) {
    window.addEventListener(ev, activity, { passive: true, capture: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { lastActivity = Date.now(); start(); }
    else { stop(); setStatus('paused (tab in background)', 'paused'); }
  });
  if (document.visibilityState === 'visible') return start();
  setStatus('paused (tab in background)', 'paused');
  return null;
}
