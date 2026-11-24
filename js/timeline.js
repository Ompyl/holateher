// holateher – timeline of the selected loco (dock at the bottom): loads the window, route, slider, playback, LIVE.
// Window: ends "now" (today) or at the end of an earlier day; range 0 = this train, 1 = 24 h, 3 / 7 / 14 days.
// Events: emit('tl-live', bool) when the LIVE state changes, emit('tl-url', evn, day|null, range), emit('close-request').
import { LS, TODAY_REFRESH_MS, TRACK } from './config.js?v=20261124h';
import { $, esc, lsGet, lsSet, emit, ymd, today, parseYmd, addDays, daysBetween, dayName, dayLong, shortDate, hhmm, hhmmss } from './util.js?v=20261124h';
import { isEvn } from './evn.js?v=20261124h';
import { fetchDay, fetchHistoryDays } from './api.js?v=20261124h';
import { buildSpeedGeo, buildStopGeo, buildTrains, trainStart, speedPerPoint, figures, EMPTY } from './track.js?v=20261124h';
import { setTrail, setTrailCursor, setMarker, setMarkerImage } from './trail.js?v=20261124h';
import { fitCoords } from './map.js?v=20261124h';
import { state as app } from './state.js?v=20261124h';
import { isActive } from './live.js?v=20261124h';
import { createCalendar } from './calendar.js?v=20261124h';

const RANGES = [0, 1, 3, 7, 14];
const SPEED_MIN = 1, SPEED_MAX = 100, SPEED_DEFAULT = 8, STEPS = 1000, SPEED_KEY_STEP = 60;
const SPEED_PRESETS = [1, 2, 4, 8, 16, 32, 64, 100];      // phone: one button steps through these
const toSpeed = v => SPEED_MIN * Math.pow(SPEED_MAX / SPEED_MIN, v / STEPS);
const toSlider = s => Math.round(STEPS * Math.log(s / SPEED_MIN) / Math.log(SPEED_MAX / SPEED_MIN));
const fmtSpeed = s => (s < 10 ? s.toFixed(1).replace(/\.0$/, '') : Math.round(s)) + 'x';
const rangeName = n => n === 0 ? 'this train' : n === 1 ? '24 h' : n + ' days';

export const tl = {
  open: false, evn: null,
  days: [], daySet: new Set(),     // days with data (yyyymmdd, ascending)
  day: null,                       // last day of the window; today = window ends "now"
  range: 1,
  raw: null,                       // fetched positions of the window (sorted)
  pts: [], coords: [], times: [], speedAt: [], trains: [], figs: {}, effRange: 1,
  cur: 0, playing: false, live: false,
  speed: lsGet(LS.playSpeed, SPEED_DEFAULT),
  token: 0
};
let refreshTimer = null, cal;

const endsNow = () => tl.day === today();
const liveEntry = () => app.byEvn.get(tl.evn);
const online = () => !!liveEntry();
const effectiveRange = () => tl.range === 0 && !endsNow() ? 1 : tl.range;     // "this train" only for the train running now
const multiDay = () => tl.times.length > 1 && ymd(new Date(tl.times[0] * 1000)) !== ymd(new Date(tl.times[tl.times.length - 1] * 1000));

function showMsg(text) { $('msg').textContent = text; $('msg').hidden = !text; }

// [start, end] in unix seconds
function windowRange(n) {
  const end = endsNow() ? Date.now() / 1000 : parseYmd(addDays(tl.day, 1)).getTime() / 1000 - 1;
  return { start: end - Math.max(1, n) * 86400 + 1, end };
}

// ---- loading ----
export async function load(day, o = {}) {
  if (!tl.open) return;
  const token = ++tl.token, evn = tl.evn;
  if (!o.keep) stop();
  tl.day = day;
  tl.raw = null;                                  // no live extension while loading
  const range = effectiveRange();
  const { start } = windowRange(range === 0 ? 2 : range);   // "this train" searches the last 48 h
  const wanted = daysBetween(ymd(new Date(start * 1000)), day).filter(d => d === today() || !tl.days.length || tl.daySet.has(d));
  emit('tl-url', evn, endsNow() ? null : day, tl.range);
  updateDayNav();
  cal.render();
  if (!o.keep) showMsg('Loading …');
  const parts = await Promise.all(wanted.map(d => fetchDay(evn, d)));
  if (token !== tl.token || !tl.open) return;
  tl.raw = parts.flat().sort((a, b) => a.time - b.time);
  build(o);
}

// Every live poll: extend the route to the new live position, without a request
export function liveUpdate() {
  if (tl.open && tl.raw && endsNow()) build({ keep: true });
  else if (tl.open) updateLiveButton();
}

function build(o = {}) {
  if (!tl.open || !tl.raw) return;
  const wasAtEnd = !tl.pts.length || tl.cur >= tl.pts.length - 1;
  const keepTime = o.keep && !wasAtEnd ? tl.times[tl.cur] : null;
  const range = effectiveRange();
  const { start, end } = windowRange(range === 0 ? 2 : range);
  let pts = tl.raw.filter(p => p.time >= start && p.time <= end);
  // the current live position ends the timeline
  const v = endsNow() ? liveEntry() : null;
  if (v && v.location_lat != null && pts.length) {
    const last = pts[pts.length - 1];
    if (Math.abs(last.location_lat - v.location_lat) > 1e-6 || Math.abs(last.location_lon - v.location_lon) > 1e-6) {
      pts.push({ location_lat: v.location_lat, location_lon: v.location_lon, time: Math.floor(Date.now() / 1000), route_id: v.trainNumber || '' });
    }
  }
  let dayLine = EMPTY;
  if (range === 0) {
    const number = String(v?.trainNumber || '').trim();
    const s = trainStart(pts, number);
    if (s > 0) {
      // the rest of today before this train: thin grey dashed line
      const midnight = parseYmd(today()).getTime() / 1000;
      const before = pts.slice(0, s + 1).filter(p => p.time >= midnight);
      if (before.length > 1) dayLine = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: before.map(p => [p.location_lon, p.location_lat]) } };
      pts = pts.slice(s);
    } else if (!number) pts = pts.filter(p => p.time >= end - 86400);   // no train number: last 24 h
  }
  tl.pts = pts;
  tl.coords = pts.map(p => [p.location_lon, p.location_lat]);
  tl.times = pts.map(p => +p.time);
  tl.effRange = range;
  if (pts.length < 2) {
    setTrail();
    tl.trains = []; tl.speedAt = []; tl.figs = {};
    $('slider').max = 0; $('trains').innerHTML = ''; $('info').innerHTML = ''; $('time').textContent = '--:--';
    showMsg('No positions ' + (endsNow() ? 'in the last ' + rangeName(range) : range > 1 ? 'in these days' : 'on ' + dayLong(tl.day)) +
      '. Use ‹ › or the calendar to pick a day with data.');
    setMarker(null);
    setLive(endsNow() && online());
    updateLiveButton();
    return;
  }
  showMsg('');
  const speed = buildSpeedGeo(tl.coords, tl.times);
  let stops = buildStopGeo(tl.coords, tl.times);
  if (range > 1) stops = { type: 'FeatureCollection', features: stops.features.filter(f => f.properties.min >= TRACK.multiDayMinStop) };
  setTrail(dayLine, speed, stops);
  tl.speedAt = speedPerPoint(speed, pts.length);
  tl.trains = buildTrains(pts);
  tl.figs = figures(speed, stops, tl.trains);
  renderTrains();
  $('slider').max = pts.length - 1;
  if (o.fit) fitCoords(tl.coords);
  if (keepTime != null) {
    const i = tl.times.findIndex(t => t >= keepTime);
    setCursor(i < 0 ? pts.length - 1 : i);
  } else setCursor(pts.length - 1);
}

function renderTrains() {
  const multi = multiDay();
  $('trains').innerHTML = tl.trains.length
    ? tl.trains.map((t, k) => `<button type="button" class="chip ${t.freight ? 'freight' : ''}" data-k="${k}" title="${esc(t.route)}">${multi ? esc(shortDate(tl.times[t.i0])) + ' · ' : ''}${esc(t.rid)}<small>${hhmm(tl.times[t.i0])}–${hhmm(tl.times[t.i1])} ${esc(t.route)}</small></button>`).join('')
    : '<span class="chip empty"><small>no train numbers in this period</small></span>';
}

// ---- LIVE: window ends now + loco online + slider at the end + not playing ----
function setLive(on) {
  if (on === tl.live) return;
  tl.live = on;
  emit('tl-live', on);
}
function updateLiveButton() {
  const b = $('btnLive');
  b.classList.toggle('is-live', tl.live);
  b.innerHTML = tl.live ? '<span class="live-dot"></span>LIVE' : 'Back to live';
  b.disabled = tl.live;
  b.hidden = !tl.live && !online();
}
export function backToLive() {
  if (!endsNow()) { load(today()); return; }
  stop();
  setCursor(tl.pts.length - 1);
}

// ---- slider ----
const trainAt = i => tl.trains.find(t => i >= t.i0 && i <= t.i1) || null;

export function setCursor(i) {
  if (!tl.pts.length) return;
  i = Math.max(0, Math.min(tl.pts.length - 1, Math.round(i)));
  tl.cur = i;
  $('slider').value = i;
  const t0 = tl.times[i];
  $('time').innerHTML = (multiDay() ? `<small>${esc(shortDate(t0))}</small>` : '') + hhmmss(t0);
  setLive(endsNow() && online() && !tl.playing && i === tl.pts.length - 1);
  setMarker(tl.live ? null : tl.coords[i]);       // live: the live symbol shows the loco
  setTrailCursor(i);
  updateLiveButton();
  const t = trainAt(i), f = tl.figs, kmh = tl.speedAt[i] >= 120 ? '120+' : tl.speedAt[i];
  $('info').innerHTML = `
    <span class="i-speed">speed <b>${kmh} km/h</b></span>
    <span class="i-train">${t ? `<b>${esc(t.rid)}</b> ${esc(t.route)}${t.freight ? ' · freight' : ''}` : 'no train'}</span>
    <span class="i-figs desk-only">${rangeName(tl.effRange)}: <b>${(f.km || 0).toFixed(0)} km</b>, max <b>${f.vmax || 0} km/h</b>, ${f.stops || 0} stops, ${f.trains || 0} trains (${f.freight || 0} freight)</span>`;
  $('trains').querySelector('.chip.active')?.classList.remove('active');
  if (t) $('trains').querySelector(`.chip[data-k="${tl.trains.indexOf(t)}"]`)?.classList.add('active');
}

// ---- playback (positions per second, independent of the frame rate) ----
let raf = null, lastTs = 0, acc = 0;
function frame(ts) {
  if (!tl.playing) return;
  if (lastTs) acc += (ts - lastTs) / 1000 * tl.speed;
  lastTs = ts;
  if (acc >= 1) {
    const step = Math.floor(acc); acc -= step;
    if (tl.cur + step >= tl.pts.length - 1) { stop(); setCursor(tl.pts.length - 1); return; }   // end: back to live
    setCursor(tl.cur + step);
  }
  raf = requestAnimationFrame(frame);
}
function play() {
  if (tl.pts.length < 2) return;
  tl.playing = true; lastTs = 0; acc = 0;
  setCursor(tl.cur >= tl.pts.length - 1 ? 0 : tl.cur);     // from "now": start at the beginning
  $('btnPlay').textContent = '❚❚';
  raf = requestAnimationFrame(frame);
}
function stop() {
  tl.playing = false;
  if (raf) cancelAnimationFrame(raf);
  raf = null;
  $('btnPlay').textContent = '▶';
}
const togglePlay = () => tl.playing ? (stop(), setCursor(tl.cur)) : play();

function setSpeed(s) {
  tl.speed = Math.max(SPEED_MIN, Math.min(SPEED_MAX, s));
  $('speed').value = toSlider(tl.speed);
  $('speedVal').textContent = $('speedBtn').textContent = fmtSpeed(tl.speed);
  lsSet(LS.playSpeed, tl.speed);
}

// ---- days (only days with data; today is always allowed) ----
const navDays = () => tl.daySet.has(today()) ? tl.days : [...tl.days, today()];
function neighbour(delta) {
  const list = navDays();
  return delta > 0 ? list.find(x => x > tl.day) : [...list].reverse().find(x => x < tl.day);
}
function updateDayNav() {
  $('prevDay').disabled = !neighbour(-1);
  $('nextDay').disabled = !neighbour(+1);
  const range = effectiveRange();
  for (const b of $('rangeSeg').querySelectorAll('button')) {
    b.classList.toggle('on', +b.dataset.n === range);
    if (+b.dataset.n === 0) b.hidden = !endsNow();
  }
  if (endsNow()) $('dayLabel').textContent = range === 0 ? 'This train' : 'Last ' + rangeName(range);
  else $('dayLabel').textContent = range > 1 ? dayName(addDays(tl.day, -(range - 1))) + ' – ' + dayName(tl.day) : dayLong(tl.day);
}
function shiftDay(delta) {
  const target = neighbour(delta);
  if (target) { load(target); return; }
  const b = $(delta > 0 ? 'nextDay' : 'prevDay');
  b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 600);
}

// ---- open / close ----
export async function openTimeline(evn, o = {}) {
  if (!isEvn(evn)) return;
  const token = ++tl.token;
  if (evn !== tl.evn) { tl.days = []; tl.daySet = new Set(); }
  Object.assign(tl, { evn, open: true, pts: [], coords: [], times: [], trains: [], cur: 0, raw: null, live: null });
  tl.range = RANGES.includes(o.range) ? o.range : 1;          // every loco starts with 24 h unless the link says otherwise
  stop();
  setTrail();
  setMarker(null);
  $('trains').innerHTML = ''; $('info').innerHTML = ''; $('time').textContent = '--:--';
  $('dock').hidden = false;
  document.body.classList.add('tl-open');
  setMarkerImage(evn, o.icon, () => tl.open && tl.evn === evn);
  try {
    tl.days = await fetchHistoryDays(evn);
    tl.daySet = new Set(tl.days);
  } catch (e) { console.warn('history-days failed', e); }
  if (token !== tl.token || !tl.open) return;
  let day = parseYmd(o.day) ? o.day : null;
  // offline loco without data today: its last day with data
  if (!day) day = !online() && tl.days.length && !tl.daySet.has(today()) ? tl.days[tl.days.length - 1] : today();
  await load(day, { fit: o.fit });
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => { if (tl.open && endsNow() && isActive()) load(tl.day, { keep: true }); }, TODAY_REFRESH_MS);
}

export function closeTimeline() {
  if (!tl.open) return;
  tl.open = false;
  tl.token++;
  clearInterval(refreshTimer); refreshTimer = null;
  stop();
  cal.toggle(false);
  showMsg('');
  setTrail();
  setMarker(null);
  $('dock').hidden = true;
  document.body.classList.remove('tl-open');
  setLive(false);
}

export const fitRoute = () => fitCoords(tl.coords);

// ---- UI (wired once; does nothing while closed) ----
export function initTimeline() {
  cal = createCalendar({ day: () => tl.day, range: () => effectiveRange(), days: () => tl.daySet, navDays, pick: d => load(d) });
  $('slider').addEventListener('input', e => { stop(); setCursor(+e.target.value); });
  $('btnPlay').addEventListener('click', togglePlay);
  $('btnLive').addEventListener('click', backToLive);
  setSpeed(tl.speed);
  $('speed').addEventListener('input', e => setSpeed(toSpeed(+e.target.value)));
  $('speed').addEventListener('dblclick', () => setSpeed(SPEED_DEFAULT));
  $('speedBtn').addEventListener('click', () => setSpeed(SPEED_PRESETS.find(p => p > tl.speed + 0.01) || SPEED_PRESETS[0]));
  $('prevDay').addEventListener('click', () => shiftDay(-1));
  $('nextDay').addEventListener('click', () => shiftDay(+1));
  $('rangeSeg').addEventListener('click', e => {
    const b = e.target.closest('button[data-n]');
    if (!b || +b.dataset.n === tl.range) return;
    tl.range = +b.dataset.n;
    load(tl.day, { fit: true });
  });
  $('btnFit').addEventListener('click', fitRoute);
  $('trains').addEventListener('click', e => {
    const c = e.target.closest('.chip[data-k]');
    if (!c) return;
    const t = tl.trains[+c.dataset.k];
    stop();
    setCursor(t.i0);
    fitCoords(tl.coords.slice(t.i0, t.i1 + 1));
  });
  // Space play/pause, , . step, A D day, Q E speed, L live, Esc calendar / close. Arrow keys stay with the map.
  window.addEventListener('keydown', e => {
    if (!tl.open || e.ctrlKey || e.altKey || e.metaKey) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if ((tag === 'input' && e.target.type !== 'range' && e.target.type !== 'checkbox') || tag === 'textarea') return;
    if (document.body.matches('.table-open, .menu-open')) return;      // the loco table / menu has the keyboard
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const act = {
      Escape: () => cal.isOpen() ? cal.toggle(false) : emit('close-request'),
      a: () => { if (!e.repeat) shiftDay(-1); },
      d: () => { if (!e.repeat) shiftDay(+1); },
      q: () => setSpeed(toSpeed(toSlider(tl.speed) - SPEED_KEY_STEP)),
      e: () => setSpeed(toSpeed(toSlider(tl.speed) + SPEED_KEY_STEP)),
      l: backToLive,
      ' ': togglePlay,
      ',': () => { stop(); setCursor(tl.cur - 1); },
      '.': () => { stop(); setCursor(tl.cur + 1); }
    }[k];
    if (!act) return;
    e.preventDefault(); e.stopPropagation();
    act();
  }, true);
}
