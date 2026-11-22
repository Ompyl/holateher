/* holateher – history of one loco: route with speed colours, stops, timeline, playback.
 * URL: history.html?loco=<EVN>&date=<YYYYMMDD>[&days=3|7]. Shared code: common.js (window.HT).
 * Several days: the chosen day and the days before it, shown as one timeline.
 */
(() => {
  'use strict';
  const {
    API, BASE_STYLE, EMPTY, $, esc, isEvn, fmtEvn, countryOf, kindOf, pad, ymd, parseYmd, hhmm, hhmmss,
    lsGet, lsSet, getJSON, dayPoints, distM, buildSpeedGeo, buildStopGeo, makeFallbackIcon,
    addTrailLayers, setTrailCursor, setTrail, legendHTML, openGoogle, openOrm, looksFreight,
    datasheetUrl, photosUrl, shortNo
  } = window.HT;

  const params = new URLSearchParams(location.search);
  const evn = (params.get('loco') || '').replace(/\D/g, '');
  const LS = { view: 'holateher.view', speed: 'holateher.playSpeed', range: 'holateher.rangeDays' };
  const SPEED_MIN = 1, SPEED_MAX_PLAY = 100, SPEED_DEFAULT = 8, STEPS = 1000, SPEED_KEY_STEP = 60;
  const RANGES = [1, 3, 7];
  const MULTI_DAY_MIN_STOP = 10;      // minutes: shortest stop shown when several days are displayed
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const urlRange = +params.get('days');
  const state = {
    days: [],              // days with data, ascending (yyyymmdd)
    daySet: new Set(),
    day: null,             // chosen (last) day
    range: RANGES.includes(urlRange) ? urlRange : (RANGES.includes(lsGet(LS.range, 1)) ? lsGet(LS.range, 1) : 1),
    pts: [], coords: [], times: [],
    speedAt: [], trains: [], stats: {},
    cur: 0, playing: false,
    speed: lsGet(LS.speed, SPEED_DEFAULT),
    firstLoad: true, loadToken: 0,
    calMonth: null         // first day of the month shown in the calendar
  };

  // ------------------------------------------------------------------
  // Map
  // ------------------------------------------------------------------
  const saved = lsGet(LS.view, null);
  const map = new maplibregl.Map({
    container: 'map', style: BASE_STYLE, attributionControl: false,
    center: saved ? saved.center : [19.3, 47.2], zoom: saved ? saved.zoom : 6.6
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
  const cleanRoute = h => String(h || '').replace(/^\s*\d+\s*(->)?\s*/, '').replace(/\s*->\s*/g, ' → ').trim();
  const toSpeed = v => SPEED_MIN * Math.pow(SPEED_MAX_PLAY / SPEED_MIN, v / STEPS);
  const toSlider = s => Math.round(STEPS * Math.log(s / SPEED_MIN) / Math.log(SPEED_MAX_PLAY / SPEED_MIN));
  const fmtSpeed = s => (s < 10 ? s.toFixed(1).replace(/\.0$/, '') : Math.round(s)) + 'x';
  const dayName = d => { const x = parseYmd(d); return WD[x.getDay()] + ' ' + x.getDate() + ' ' + MON[x.getMonth()]; };
  const dayLong = d => { const x = parseYmd(d); return WD[x.getDay()] + ', ' + x.getDate() + ' ' + MON[x.getMonth()] + ' ' + x.getFullYear(); };
  const shortDate = t => { const d = new Date(t * 1000); return WD[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()]; };
  const addDays = (d, n) => { const x = parseYmd(d); x.setDate(x.getDate() + n); return ymd(x); };

  // calendar days of the window that ends with `day`
  function windowDays(day, n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) out.push(addDays(day, -i));
    return out;
  }

  function showMsg(text) { $('msg').textContent = text; $('msg').hidden = !text; }

  function fit(coords) {
    if (!coords.length) return;
    if (coords.length < 2) { map.jumpTo({ center: coords[0], zoom: 12 }); return; }
    const b = new maplibregl.LngLatBounds();
    for (const c of coords) b.extend(c);
    map.fitBounds(b, { padding: { top: 80, bottom: 210, left: 60, right: 300 }, maxZoom: 13, duration: 0 });
  }

  // Train segments: consecutive points with the same route_id (breaks up to 8 h without number are bridged)
  function buildTrains(pts) {
    const out = [];
    let cur = null;
    pts.forEach((p, i) => {
      const rid = String(p.route_id || '').trim();
      if (!rid) return;
      if (cur && cur.rid === rid && p.time - pts[cur.i1].time < 8 * 3600) { cur.i1 = i; if (!cur.route) cur.route = cleanRoute(p.headsign); return; }
      cur = { rid, route: cleanRoute(p.headsign), i0: i, i1: i, freight: looksFreight(rid, p.headsign) };
      out.push(cur);
    });
    return out;
  }

  // ------------------------------------------------------------------
  // Loading the chosen day (and the days before it in multi-day mode)
  // ------------------------------------------------------------------
  async function load(day, opts = {}) {
    const token = ++state.loadToken;
    stop();
    state.day = day;
    const wdays = windowDays(day, state.range);
    const wanted = state.days.length ? wdays.filter(d => state.daySet.has(d)) : wdays;
    history.replaceState(null, '', 'history.html?loco=' + evn + '&date=' + day + (state.range > 1 ? '&days=' + state.range : ''));
    $('dayLabel').textContent = state.range > 1 ? dayName(wdays[0]) + ' – ' + dayName(day) : dayLong(day);
    updateDayButtons();
    renderCalendar();
    showMsg('Loading ' + (state.range > 1 ? state.range + ' days' : dayLong(day)) + ' …');

    const parts = await Promise.all(wanted.map(d => dayPoints(evn, d)));
    if (token !== state.loadToken) return;
    const pts = parts.flat().sort((a, b) => a.time - b.time);
    state.pts = pts;
    state.coords = pts.map(p => [p.location_lon, p.location_lat]);
    state.times = pts.map(p => +p.time);
    if (pts.length < 2) {
      setTrail(map);
      map.getSource('cursor')?.setData(EMPTY);
      $('slider').max = 0; $('trains').innerHTML = ''; $('info').innerHTML = '';
      $('time').textContent = '--:--:--';
      showMsg('No positions ' + (state.range > 1 ? 'in these days' : 'on ' + dayLong(day)) + '. Use ‹ › (A / D) or the calendar to pick a day with data.');
      return;
    }
    showMsg('');
    const speed = buildSpeedGeo(state.coords, state.times);
    let stops = buildStopGeo(state.coords, state.times);
    // several days: only stops of 10 min or more, otherwise the map gets crowded
    if (state.range > 1) stops = { type: 'FeatureCollection', features: stops.features.filter(f => f.properties.min >= MULTI_DAY_MIN_STOP) };
    setTrail(map, EMPTY, speed, stops);
    state.speedAt = new Array(pts.length).fill(0);
    for (const f of speed.features) for (let i = f.properties.pi; i < f.properties.pj; i++) state.speedAt[i] = f.properties.kmh;
    state.trains = buildTrains(pts);
    computeStats(speed, stops);
    renderTrains();
    $('slider').max = pts.length - 1;
    // keep the map where it is when changing days; fit on first load or when asked
    if (state.firstLoad || opts.fit) fit(state.coords);
    state.firstLoad = false;
    setCursor(0);
  }

  function computeStats(speed, stops) {
    let km = 0, vmax = 0;
    for (const f of speed.features) {
      if (f.properties.gap) continue;
      const [a, b] = f.geometry.coordinates;
      km += distM(a, b) / 1000;
      if (f.properties.kmh < 120) vmax = Math.max(vmax, f.properties.kmh);
    }
    state.stats = { km, vmax, stops: stops.features.length, freight: state.trains.filter(t => t.freight).length };
  }

  function renderTrains() {
    const multi = state.range > 1;
    $('trains').innerHTML = state.trains.length
      ? state.trains.map((t, k) => `<span class="chip ${t.freight ? 'freight' : ''}" data-k="${k}" title="${esc(t.route)}">${multi ? esc(shortDate(state.times[t.i0])) + ' · ' : ''}${esc(t.rid)}<small>${hhmm(state.times[t.i0])}–${hhmm(state.times[t.i1])} ${esc(t.route)}</small></span>`).join('')
      : '<span class="chip"><small>no train numbers in this period</small></span>';
  }

  // ------------------------------------------------------------------
  // Timeline
  // ------------------------------------------------------------------
  const trainAt = i => state.trains.find(t => i >= t.i0 && i <= t.i1) || null;

  function setCursor(i) {
    if (!state.pts.length) return;
    i = Math.max(0, Math.min(state.pts.length - 1, Math.round(i)));
    state.cur = i;
    $('slider').value = i;
    const t0 = state.times[i];
    $('time').innerHTML = (state.range > 1 ? `<small>${esc(shortDate(t0))}</small>` : '') + hhmmss(t0);
    map.getSource('cursor')?.setData({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: state.coords[i] } });
    setTrailCursor(map, i);
    const t = trainAt(i);
    const s = state.stats;
    $('info').innerHTML = `
      <span>${t ? `<b>${esc(t.rid)}</b> ${esc(t.route)}${t.freight ? ' · freight' : ''}` : 'no train'}</span>
      <span>speed <b>${state.speedAt[i] >= 120 ? '120+' : state.speedAt[i]} km/h</b></span>
      <span>point <b>${i + 1}</b> / ${state.pts.length}</span>
      <span>${state.range > 1 ? state.range + ' days' : 'day'}: <b>${(s.km || 0).toFixed(0)} km</b>, max <b>${s.vmax || 0} km/h</b>, ${s.stops || 0} stops, ${state.trains.length} trains (${s.freight || 0} freight)</span>`;
    for (const el of document.querySelectorAll('.chip.active')) el.classList.remove('active');
    if (t) document.querySelector(`.chip[data-k="${state.trains.indexOf(t)}"]`)?.classList.add('active');
  }

  // Playback: positions per second, independent of frame rate
  let raf = null, lastTs = 0, acc = 0;
  function frame(ts) {
    if (!state.playing) return;
    if (lastTs) acc += (ts - lastTs) / 1000 * state.speed;
    lastTs = ts;
    if (acc >= 1) {
      const step = Math.floor(acc); acc -= step;
      if (state.cur + step >= state.pts.length - 1) { setCursor(state.pts.length - 1); stop(); return; }
      setCursor(state.cur + step);
    }
    raf = requestAnimationFrame(frame);
  }
  function play() {
    if (state.pts.length < 2) return;
    if (state.cur >= state.pts.length - 1) setCursor(0);
    state.playing = true; lastTs = 0; acc = 0;
    $('btnPlay').textContent = '❚❚';
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    state.playing = false;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    $('btnPlay').textContent = '▶';
  }

  function setSpeed(s) {
    state.speed = Math.max(SPEED_MIN, Math.min(SPEED_MAX_PLAY, s));
    $('speed').value = toSlider(state.speed);
    $('speedVal').textContent = fmtSpeed(state.speed);
    lsSet(LS.speed, state.speed);
  }

  // ------------------------------------------------------------------
  // Day navigation (only days with data)
  // ------------------------------------------------------------------
  function neighbour(delta) {
    const d = state.day;
    return delta > 0 ? state.days.find(x => x > d) : [...state.days].reverse().find(x => x < d);
  }
  function updateDayButtons() {
    $('prevDay').disabled = !neighbour(-1);
    $('nextDay').disabled = !neighbour(+1);
    for (const b of $('rangeSeg').querySelectorAll('button')) b.classList.toggle('on', +b.dataset.n === state.range);
  }
  function shiftDay(delta) {
    const target = neighbour(delta);
    if (!target) {
      const b = $(delta > 0 ? 'nextDay' : 'prevDay');
      b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 600);
      return;
    }
    load(target);
  }

  // ------------------------------------------------------------------
  // Calendar popover (days with data are highlighted)
  // ------------------------------------------------------------------
  function renderCalendar() {
    if (!state.day) return;
    if (!state.calMonth) { const d = parseYmd(state.day); state.calMonth = new Date(d.getFullYear(), d.getMonth(), 1); }
    const m = state.calMonth;
    const first = new Date(m.getFullYear(), m.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;                      // Monday first
    const nDays = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    const today = ymd(new Date());
    const win = new Set(windowDays(state.day, state.range));
    const minM = state.days.length ? parseYmd(state.days[0]) : null;
    const maxM = state.days.length ? parseYmd(state.days[state.days.length - 1]) : null;
    const canPrev = !minM || (m.getFullYear() * 12 + m.getMonth()) > (minM.getFullYear() * 12 + minM.getMonth());
    const canNext = !maxM || (m.getFullYear() * 12 + m.getMonth()) < (maxM.getFullYear() * 12 + maxM.getMonth());
    let cells = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(w => `<span class="wd">${w}</span>`).join('');
    for (let i = 0; i < offset; i++) cells += '<span></span>';
    let monthCount = 0;
    for (let d = 1; d <= nDays; d++) {
      const key = m.getFullYear() + pad(m.getMonth() + 1) + pad(d);
      const has = state.daySet.has(key);
      if (has) monthCount++;
      const cls = [has ? 'has' : '', key === state.day ? 'sel' : (win.has(key) ? 'inrange' : ''), key === today ? 'today' : ''].join(' ');
      cells += `<button type="button" class="${cls}" data-day="${key}" ${has ? '' : 'disabled'} title="${has ? dayLong(key) : 'no data'}">${d}</button>`;
    }
    $('cal').innerHTML = `
      <div class="cal-head">
        <button type="button" data-mon="-1" ${canPrev ? '' : 'disabled'} aria-label="Previous month">‹</button>
        <strong>${MON[m.getMonth()]} ${m.getFullYear()}</strong>
        <button type="button" data-mon="1" ${canNext ? '' : 'disabled'} aria-label="Next month">›</button>
      </div>
      <div class="cal-grid">${cells}</div>
      <div class="cal-foot"><span>${monthCount} day${monthCount === 1 ? '' : 's'} with data</span>${state.days.length ? '<button type="button" data-latest="1">latest day</button>' : ''}</div>`;
  }

  function toggleCalendar(on) {
    const cal = $('cal');
    on = on ?? cal.hidden;
    if (on) { const d = parseYmd(state.day); state.calMonth = new Date(d.getFullYear(), d.getMonth(), 1); renderCalendar(); }
    cal.hidden = !on;
  }

  // ------------------------------------------------------------------
  // UI
  // ------------------------------------------------------------------
  function wireUI() {
    $('slider').addEventListener('input', e => setCursor(+e.target.value));
    $('btnPlay').addEventListener('click', () => state.playing ? stop() : play());
    const sp = $('speed');
    setSpeed(state.speed);
    sp.addEventListener('input', () => setSpeed(toSpeed(+sp.value)));
    sp.addEventListener('dblclick', () => setSpeed(SPEED_DEFAULT));
    $('prevDay').addEventListener('click', () => shiftDay(-1));
    $('nextDay').addEventListener('click', () => shiftDay(+1));
    $('rangeSeg').addEventListener('click', e => {
      const b = e.target.closest('button[data-n]');
      if (!b || +b.dataset.n === state.range) return;
      state.range = +b.dataset.n;
      lsSet(LS.range, state.range);
      load(state.day, { fit: true });
    });
    $('dayBtn').addEventListener('click', e => { e.stopPropagation(); toggleCalendar(); });
    $('cal').addEventListener('click', e => {
      e.stopPropagation();
      const mon = e.target.closest('button[data-mon]');
      if (mon) { state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + +mon.dataset.mon, 1); renderCalendar(); return; }
      const d = e.target.closest('button[data-day]');
      if (d && !d.disabled) { toggleCalendar(false); load(d.dataset.day); return; }
      if (e.target.closest('button[data-latest]')) { toggleCalendar(false); load(state.days[state.days.length - 1]); }
    });
    document.addEventListener('click', () => toggleCalendar(false));
    $('btnFit').addEventListener('click', () => fit(state.coords));
    $('btnGoogle').addEventListener('click', () => openGoogle(map));
    $('btnOrm').addEventListener('click', () => openOrm(map));
    $('trains').addEventListener('click', e => {
      const c = e.target.closest('.chip[data-k]');
      if (!c) return;
      const t = state.trains[+c.dataset.k];
      stop();
      setCursor(t.i0);
      fit(state.coords.slice(t.i0, t.i1 + 1));
    });
    // Keys: Space play/pause, , . step, A D day, Q E speed. Arrow keys are left to the map (panning).
    window.addEventListener('keydown', e => {
      const tag = (e.target.tagName || '').toLowerCase();
      if ((tag === 'input' && e.target.type !== 'range') || tag === 'textarea') return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k === 'Escape') { toggleCalendar(false); return; }
      if (k === 'a' || k === 'd') { e.preventDefault(); if (!e.repeat) shiftDay(k === 'd' ? 1 : -1); }
      else if (k === 'q' || k === 'e') { e.preventDefault(); setSpeed(toSpeed(toSlider(state.speed) + (k === 'e' ? SPEED_KEY_STEP : -SPEED_KEY_STEP))); }
      else if (k === ' ') { e.preventDefault(); state.playing ? stop() : play(); }
      else if (k === ',' || k === '.') { e.preventDefault(); stop(); setCursor(state.cur + (k === '.' ? 1 : -1)); }
    }, true);
    $('legend').innerHTML = '<strong>Speed</strong>' + legendHTML(false);
  }

  // Loco title and marker image (single vehicle request, small)
  async function loadLoco() {
    $('locoTitle').textContent = fmtEvn(evn);
    $('btnSheet').href = datasheetUrl(evn);
    $('btnPhotos').href = photosUrl(evn);
    $('btnPhotos').title = 'Photos of “' + shortNo(evn) + '” on bahnbilder.de (new tab)';
    try {
      const v = await getJSON(API + 'bkv/vehicles/' + encodeURIComponent(evn));
      const typ = v?.type?.name && v.type.name !== 'Ismeretlen' ? v.type.name : (v?.vehicleModel || '');
      $('locoSub').textContent = [typ, kindOf(evn), countryOf(evn)].filter(Boolean).join(' · ');
      document.title = 'holateher – ' + fmtEvn(evn) + (typ ? ' (' + typ + ')' : '');
      // own image, else image of the same model (remembered by the live page), else fallback symbol
      let url = v?.icon?.url;
      if (!url || /null\.webp$/.test(url)) url = (lsGet('holateher.modelIcons', {}) || {})[v?.vehicleModel || typ] || null;
      if (url && !/null\.webp$/.test(url)) {
        try {
          const img = await map.loadImage(API + url.replace(/^\/+/, ''));
          if (map.hasImage('loco')) map.removeImage('loco');
          map.addImage('loco', img.data);
        } catch (e) { /* keep fallback */ }
      }
    } catch (e) {
      $('locoSub').textContent = [kindOf(evn), countryOf(evn)].filter(Boolean).join(' · ');
    }
  }

  async function start() {
    wireUI();
    if (!isEvn(evn)) { showMsg('No loco given. Open this page from the live map or the loco table.'); return; }
    const locoReady = loadLoco();
    let days = [];
    try {
      const list = await getJSON(API + 'bkv/vehicles/' + encodeURIComponent(evn) + '/history-days');
      days = [...new Set((list || []).map(x => String(x.date)).filter(s => /^\d{8}$/.test(s)))].sort();
    } catch (e) { console.warn('history-days failed', e); }
    state.days = days;
    state.daySet = new Set(days);
    let day = params.get('date');
    if (!parseYmd(day)) day = days.length ? days[days.length - 1] : ymd(new Date());
    await locoReady;
    load(day);
  }

  map.on('load', () => {
    map.addImage('loco', makeFallbackIcon());
    addTrailLayers(map);
    map.addSource('cursor', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'cursor-halo', type: 'circle', source: 'cursor',
      paint: { 'circle-radius': 18, 'circle-color': 'rgba(31,138,138,0.22)', 'circle-stroke-color': '#1f8a8a', 'circle-stroke-width': 2 } });
    map.addLayer({ id: 'cursor', type: 'symbol', source: 'cursor',
      layout: { 'icon-image': 'loco', 'icon-size': ['interpolate', ['linear'], ['zoom'], 6, 0.18, 14, 0.32], 'icon-allow-overlap': true } });
    start();
  });

  window.holateherHistory = { state, map, setCursor, load };
})();
