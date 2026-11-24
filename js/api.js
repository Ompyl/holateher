// holateher – every request to realtimenext goes through here (one place to keep the traffic small).
import { URLS, LS, ICONS_CACHE_MS, PAST_DAYS_CACHE } from './config.js?v=20261124d';
import { lsGet, lsSet, today } from './util.js?v=20261124d';

export const stats = { requests: 0, bytes: 0, since: Date.now() };   // for testing: window.holateher.api.stats

async function getJSON(url) {
  const r = await fetch(url, { credentials: 'omit' });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
  const text = await r.text();
  stats.requests++; stats.bytes += text.length;
  return JSON.parse(text);
}

// Live list of all vehicles (~1 MB, the server does not compress it)
export async function fetchLive() {
  const list = await getJSON(URLS.live);
  if (!Array.isArray(list)) throw new Error('unexpected live response');
  return list;
}

// Icon list (category id -> image path), kept for 24 h
export async function fetchIcons() {
  const c = lsGet(LS.icons, null);
  if (c && Date.now() - c.t < ICONS_CACHE_MS && Array.isArray(c.list)) return c.list;
  try {
    const raw = await getJSON(URLS.icons);
    const list = (Array.isArray(raw) ? raw : []).map(ic => [String(ic.id), ic.url]).filter(([, u]) => u);
    lsSet(LS.icons, { t: Date.now(), list });
    return list;
  } catch (e) {
    console.warn('icon list not loaded', e);
    return c?.list || [];
  }
}

// Once per session and loco
const once = new Map();
function memo(key, fn) {
  if (!once.has(key)) once.set(key, fn().catch(e => { once.delete(key); throw e; }));
  return once.get(key);
}
export const fetchVehicle = evn => memo('v/' + evn, () => getJSON(URLS.vehicle(evn)));
export const fetchHistoryDays = evn => memo('d/' + evn, async () => {
  const list = await getJSON(URLS.historyDays(evn));
  return [...new Set((list || []).map(x => String(x.date)).filter(s => /^\d{8}$/.test(s)))].sort();
});

// Positions of one loco on one day (points with coordinates only). Past days never change: kept in memory
// (also when switching to another loco and back), the oldest are dropped. Today is always fetched fresh.
const pastDays = new Map();
export const cacheInfo = () => ({ pastDays: pastDays.size, memo: once.size, iconsAge: Date.now() - (lsGet(LS.icons, null)?.t || NaN) });
export function fetchDay(evn, day) {
  const load = () => getJSON(URLS.day(evn, day))
    .then(d => Array.isArray(d) ? d.filter(p => p.location_lat != null && p.location_lon != null) : [])
    .catch(() => []);
  if (day >= today()) return load();
  const key = evn + '/' + day;
  if (pastDays.has(key)) {
    const p = pastDays.get(key);
    pastDays.delete(key); pastDays.set(key, p);         // most recently used to the end
    return p;
  }
  const p = load();
  pastDays.set(key, p);
  while (pastDays.size > PAST_DAYS_CACHE) pastDays.delete(pastDays.keys().next().value);
  return p;
}
