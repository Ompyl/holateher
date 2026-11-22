/* holateher – daily history of one loco: route with speed colours, stops, timeline, playback.
 * URL: history.html?loco=<EVN>&date=<YYYYMMDD>. Shared code: common.js (window.HT).
 */
(() => {
  'use strict';
  const {
    API, BASE_STYLE, EMPTY, $, esc, isEvn, fmtEvn, countryOf, kindOf, ymd, parseYmd, isoDate, hhmm, hhmmss, durText,
    lsGet, lsSet, getJSON, dayPoints, distM, buildSpeedGeo, buildStopGeo, makeFallbackIcon,
    addTrailLayers, setTrailCursor, setTrail, legendHTML, openGoogle, openOrm, looksFreight
  } = window.HT;

  const params = new URLSearchParams(location.search);
  const evn = (params.get('loco') || '').replace(/\D/g, '');
  const LS = { view: 'holateher.view', speed: 'holateher.playSpeed' };
  const SPEED_MIN = 1, SPEED_MAX_PLAY = 100, SPEED_DEFAULT = 8, STEPS = 1000;

  const state = {
    days: [],              // days with data, ascending (yyyymmdd)
    day: null,
    pts: [], coords: [], times: [],
    speedAt: [],           // smoothed km/h per point index
    trains: [],            // [{ rid, route, i0, i1, freight }]
    cur: 0,
    playing: false,
    speed: lsGet(LS.speed, SPEED_DEFAULT),
    firstLoad: true,
    loadToken: 0
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

  function showMsg(text) { $('msg').textContent = text; $('msg').hidden = !text; }

  function boundsOf(coords) {
    const b = new maplibregl.LngLatBounds();
    for (const c of coords) b.extend(c);
    return b;
  }
  function fit(coords) {
    if (coords.length < 2) { if (coords.length) map.jumpTo({ center: coords[0], zoom: 12 }); return; }
    map.fitBounds(boundsOf(coords), { padding: { top: 80, bottom: 190, left: 60, right: 300 }, maxZoom: 13, duration: 0 });
  }

  // Train segments: consecutive points with the same route_id (short breaks without number are bridged)
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
  // Loading a day
  // ------------------------------------------------------------------
  async function loadDay(day, opts = {}) {
    const token = ++state.loadToken;
    stop();
    state.day = day;
    $('dayInput').value = isoDate(day);
    history.replaceState(null, '', 'history.html?loco=' + evn + '&date=' + day);
    updateDayButtons();
    showMsg('Loading ' + isoDate(day) + ' …');
    const pts = await dayPoints(evn, day);
    if (token !== state.loadToken) return;
    state.pts = pts;
    state.coords = pts.map(p => [p.location_lon, p.location_lat]);
    state.times = pts.map(p => +p.time);
    if (pts.length < 2) {
      setTrail(map);
      map.getSource('cursor')?.setData(EMPTY);
      $('slider').max = 0; $('trains').innerHTML = ''; $('info').innerHTML = '';
      $('time').textContent = '--:--:--';
      showMsg('No positions on ' + isoDate(day) + (state.days.length ? '. Use ‹ › to jump to days with data.' : '.'));
      return;
    }
    showMsg('');
    const speed = buildSpeedGeo(state.coords, state.times);
    const stops = buildStopGeo(state.coords, state.times);
    setTrail(map, EMPTY, speed, stops);
    // speed per point (for the info line)
    state.speedAt = new Array(pts.length).fill(0);
    for (const f of speed.features) for (let i = f.properties.pi; i < f.properties.pj; i++) state.speedAt[i] = f.properties.kmh;
    state.trains = buildTrains(pts);
    renderTrains();
    renderStats(speed, stops);
    $('slider').max = pts.length - 1;
    // keep the map where it is when changing days; fit only on the first load (or if asked)
    if (state.firstLoad || opts.fit) fit(state.coords);
    state.firstLoad = false;
    setCursor(0);
  }

  function renderStats(speed, stops) {
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
    $('trains').innerHTML = state.trains.length
      ? state.trains.map((t, k) => `<span class="chip ${t.freight ? 'freight' : ''}" data-k="${k}" title="${esc(t.route)}">${esc(t.rid)}<small>${hhmm(state.times[t.i0])}–${hhmm(state.times[t.i1])} ${esc(t.route)}</small></span>`).join('')
      : '<span class="chip"><small>no train numbers on this day</small></span>';
  }

  // ------------------------------------------------------------------
  // Timeline
  // ------------------------------------------------------------------
  function trainAt(i) {
    return state.trains.find(t => i >= t.i0 && i <= t.i1) || null;
  }

  function setCursor(i) {
    if (!state.pts.length) return;
    i = Math.max(0, Math.min(state.pts.length - 1, Math.round(i)));
    state.cur = i;
    $('slider').value = i;
    $('time').textContent = hhmmss(state.times[i]);
    map.getSource('cursor')?.setData({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: state.coords[i] } });
    setTrailCursor(map, i);
    const t = trainAt(i);
    const s = state.stats || {};
    $('info').innerHTML = `
      <span>${t ? `<b>${esc(t.rid)}</b> ${esc(t.route)}${t.freight ? ' · freight' : ''}` : 'no train'}</span>
      <span>speed <b>${state.speedAt[i] >= 120 ? '120+' : state.speedAt[i]} km/h</b></span>
      <span>point <b>${i + 1}</b> / ${state.pts.length}</span>
      <span>day: <b>${(s.km || 0).toFixed(0)} km</b>, max <b>${s.vmax || 0} km/h</b>, ${s.stops || 0} stops, ${state.trains.length} trains (${s.freight || 0} freight)</span>`;
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
  }
  function shiftDay(delta) {
    const target = neighbour(delta);
    if (!target) {
      const b = $(delta > 0 ? 'nextDay' : 'prevDay');
      b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 600);
      return;
    }
    loadDay(target);
  }

  // ------------------------------------------------------------------
  // UI
  // ------------------------------------------------------------------
  function wireUI() {
    $('slider').addEventListener('input', e => setCursor(+e.target.value));
    $('btnPlay').addEventListener('click', () => state.playing ? stop() : play());
    const sp = $('speed');
    sp.value = toSlider(state.speed); $('speedVal').textContent = fmtSpeed(state.speed);
    sp.addEventListener('input', () => { state.speed = toSpeed(+sp.value); $('speedVal').textContent = fmtSpeed(state.speed); lsSet(LS.speed, state.speed); });
    sp.addEventListener('dblclick', () => { state.speed = SPEED_DEFAULT; sp.value = toSlider(SPEED_DEFAULT); $('speedVal').textContent = fmtSpeed(SPEED_DEFAULT); lsSet(LS.speed, SPEED_DEFAULT); });
    $('prevDay').addEventListener('click', () => shiftDay(-1));
    $('nextDay').addEventListener('click', () => shiftDay(+1));
    $('dayInput').addEventListener('change', e => { const v = e.target.value.replace(/-/g, ''); if (/^\d{8}$/.test(v)) loadDay(v); });
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
    window.addEventListener('keydown', e => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' && e.target.type !== 'range') return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        if (!e.repeat) shiftDay(e.key === 'ArrowRight' ? 1 : -1);
      } else if (e.key === ' ') {
        e.preventDefault();
        state.playing ? stop() : play();
      } else if (e.key === ',' || e.key === '.') {
        // like YouTube: one position back / forward (pauses playback; holding the key repeats)
        e.preventDefault();
        stop();
        setCursor(state.cur + (e.key === '.' ? 1 : -1));
      }
    }, true);
    $('legend').innerHTML = '<strong>Speed</strong>' + legendHTML(false);
  }

  // Loco title and marker image (single vehicle request, small)
  async function loadLoco() {
    $('locoTitle').textContent = fmtEvn(evn);
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
    $('btnSheet').href = window.HT.datasheetUrl(evn);
    $('btnPhotos').href = window.HT.photosUrl(evn);
    $('btnPhotos').title = 'Photos of “' + window.HT.shortNo(evn) + '” on bahnbilder.de (new tab)';
    const locoReady = loadLoco();
    let days = [];
    try {
      const list = await getJSON(API + 'bkv/vehicles/' + encodeURIComponent(evn) + '/history-days');
      days = [...new Set((list || []).map(x => String(x.date)).filter(s => /^\d{8}$/.test(s)))].sort();
    } catch (e) { console.warn('history-days failed', e); }
    state.days = days;
    if (days.length) { $('dayInput').min = isoDate(days[0]); $('dayInput').max = isoDate(days[days.length - 1]); }
    let day = params.get('date');
    if (!parseYmd(day)) day = days.length ? days[days.length - 1] : ymd(new Date());
    await locoReady;
    loadDay(day);
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

  window.holateherHistory = { state, map, setCursor, loadDay };
})();
