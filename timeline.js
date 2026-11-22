/* holateher – timeline of the selected loco (dock at the bottom of the live map).
 * Route with speed colours and stops, slider, playback, day / range choice, train list.
 * The slider starts at "now" (live). Moving it back shows where the loco was; app.js then hides the other trains.
 * Ranges: 0 = current train only, 1 = last 24 h, 3 / 7 / 14 = last n × 24 h. On an earlier day: that day (and the days before).
 * app.js creates it with HTTimeline(map, { getLive, onLiveChange, onCloseRequest }) and calls open(evn, opts) / close().
 */
(() => {
  'use strict';
  const {
    API, EMPTY, $, esc, isEvn, pad, ymd, parseYmd, hhmm, hhmmss,
    lsGet, lsSet, getJSON, dayPoints, distM, buildSpeedGeo, buildStopGeo, makeFallbackIcon,
    setTrailCursor, setTrail, looksFreight
  } = window.HT;

  const LS = { speed: 'holateher.playSpeed' };
  const SPEED_MIN = 1, SPEED_MAX_PLAY = 100, SPEED_DEFAULT = 8, STEPS = 1000, SPEED_KEY_STEP = 60;
  const RANGES = [0, 1, 3, 7, 14];
  const DEFAULT_RANGE = 1;
  const MULTI_DAY_MIN_STOP = 10;      // minutes: shortest stop shown when several days are displayed
  const REFRESH_MS = 60000;           // reload today's positions while the window ends "now"
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const LOCO_IMG = 'tl-loco';

  // ------------------------------------------------------------------
  // Helpers (no map needed)
  // ------------------------------------------------------------------
  const cleanRoute = h => String(h || '').replace(/^\s*\d+\s*(->)?\s*/, '').replace(/\s*->\s*/g, ' → ').trim();
  const toSpeed = v => SPEED_MIN * Math.pow(SPEED_MAX_PLAY / SPEED_MIN, v / STEPS);
  const toSlider = s => Math.round(STEPS * Math.log(s / SPEED_MIN) / Math.log(SPEED_MAX_PLAY / SPEED_MIN));
  const fmtSpeed = s => (s < 10 ? s.toFixed(1).replace(/\.0$/, '') : Math.round(s)) + 'x';
  const dayName = d => { const x = parseYmd(d); return WD[x.getDay()] + ' ' + x.getDate() + ' ' + MON[x.getMonth()]; };
  const dayLong = d => { const x = parseYmd(d); return WD[x.getDay()] + ', ' + x.getDate() + ' ' + MON[x.getMonth()] + ' ' + x.getFullYear(); };
  const shortDate = t => { const d = new Date(t * 1000); return WD[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()]; };
  const addDays = (d, n) => { const x = parseYmd(d); x.setDate(x.getDate() + n); return ymd(x); };
  const rangeName = n => n === 0 ? 'this train' : n === 1 ? '24 h' : n + ' days';

  // calendar days from a to b (yyyymmdd, inclusive)
  function daysBetween(a, b) {
    const out = [];
    for (let d = a; d <= b; d = addDays(d, 1)) out.push(d);
    return out;
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

  window.HTTimeline = function createTimeline(map, opts = {}) {
    const state = {
      open: false,
      evn: null,
      days: [],              // days with data, ascending (yyyymmdd)
      daySet: new Set(),
      day: null,             // last day of the window; today = window ends "now"
      range: DEFAULT_RANGE,  // every newly opened loco starts with 24 h (or the range from the link)
      pts: [], coords: [], times: [],
      speedAt: [], trains: [], stats: {},
      cur: 0, playing: false, live: false,
      speed: lsGet(LS.speed, SPEED_DEFAULT),
      loadToken: 0, openToken: 0,
      calMonth: null,        // first day of the month shown in the calendar
      icon: null             // image id of the loco marker
    };
    const pastDays = new Map();   // evn/day -> promise of points (past days do not change)
    let refreshTimer = null;

    const today = () => ymd(new Date());
    const endsNow = () => state.day === today();
    const online = () => !!opts.getLive?.(state.evn);

    function cachedDayPoints(evn, day) {
      if (day === today()) return dayPoints(evn, day);
      const key = evn + '/' + day;
      if (!pastDays.has(key)) pastDays.set(key, dayPoints(evn, day));
      return pastDays.get(key);
    }

    // the info panel stays above the dock (CSS variable --dock-h)
    function setDockHeight() {
      requestAnimationFrame(() => document.body.style.setProperty('--dock-h', $('dock').offsetHeight + 'px'));
    }
    window.addEventListener('resize', () => { if (state.open) setDockHeight(); });

    function showMsg(text) { $('msg').textContent = text; $('msg').hidden = !text; }

    function fit(coords) {
      if (!coords.length) return;
      if (coords.length < 2) { map.jumpTo({ center: coords[0], zoom: 12 }); return; }
      const b = new maplibregl.LngLatBounds();
      for (const c of coords) b.extend(c);
      // keep the route clear of the info panel (right on desktop, top on phones) and the dock
      const phone = matchMedia('(max-width: 700px)').matches;
      const dockH = $('dock').offsetHeight || 190, panel = $('panel');
      const padding = phone
        ? { top: (panel.hidden ? 60 : panel.offsetHeight + 24), bottom: dockH + 30, left: 24, right: 24 }
        : { top: 70, bottom: dockH + 40, left: 50, right: 370 };
      map.fitBounds(b, { padding, maxZoom: 13, duration: 0 });
    }

    // Marker of the loco at the slider position – added once, on top of everything
    function ensureLayers() {
      if (!map.hasImage(LOCO_IMG)) map.addImage(LOCO_IMG, makeFallbackIcon());
      if (map.getSource('cursor')) return;
      map.addSource('cursor', { type: 'geojson', data: EMPTY });
      map.addLayer({ id: 'cursor-halo', type: 'circle', source: 'cursor',
        paint: { 'circle-radius': 18, 'circle-color': 'rgba(31,138,138,0.22)', 'circle-stroke-color': '#1f8a8a', 'circle-stroke-width': 2 } });
      map.addLayer({ id: 'cursor', type: 'symbol', source: 'cursor',
        layout: { 'icon-image': LOCO_IMG, 'icon-size': ['interpolate', ['linear'], ['zoom'], 6, 0.18, 14, 0.32], 'icon-allow-overlap': true } });
    }

    // Image of the marker: the one the live map uses, else realtimenext's own / same model, else fallback
    async function setMarkerImage(evn, liveIcon, token) {
      if (liveIcon && map.hasImage(liveIcon)) { map.setLayoutProperty('cursor', 'icon-image', liveIcon); return; }
      map.setLayoutProperty('cursor', 'icon-image', LOCO_IMG);
      if (map.hasImage(LOCO_IMG)) map.removeImage(LOCO_IMG);
      map.addImage(LOCO_IMG, makeFallbackIcon());
      try {
        const v = await getJSON(API + 'bkv/vehicles/' + encodeURIComponent(evn));
        let url = v?.icon?.url;
        const typ = v?.type?.name && v.type.name !== 'Ismeretlen' ? v.type.name : (v?.vehicleModel || '');
        if (!url || /null\.webp$/.test(url)) url = (lsGet('holateher.modelIcons', {}) || {})[v?.vehicleModel || typ] || null;
        if (!url || /null\.webp$/.test(url) || token !== state.openToken) return;
        const img = await map.loadImage(API + url.replace(/^\/+/, ''));
        if (token !== state.openToken) return;
        if (map.hasImage(LOCO_IMG)) map.removeImage(LOCO_IMG);
        map.addImage(LOCO_IMG, img.data);
      } catch (e) { /* keep fallback */ }
    }

    // ------------------------------------------------------------------
    // Loading the window
    // ------------------------------------------------------------------
    // Window [start, end] in unix seconds: ends now (today) or at the end of the chosen day
    function windowRange(n) {
      const end = endsNow() ? Date.now() / 1000 : parseYmd(addDays(state.day, 1)).getTime() / 1000 - 1;
      return { start: end - Math.max(1, n) * 86400 + 1, end };
    }

    // "this train" only makes sense for the train running now
    const effectiveRange = () => state.range === 0 && !endsNow() ? 1 : state.range;

    // Fetch the positions of the window, then build the route
    async function load(day, o = {}) {
      if (!state.open) return;
      const token = ++state.loadToken;
      const evn = state.evn;
      if (!o.keep) stop();
      state.day = day;
      state.raw = null;                       // no live extension while loading
      const range = effectiveRange();
      const { start } = windowRange(range === 0 ? 2 : range);
      const wanted = daysBetween(ymd(new Date(start * 1000)), day).filter(d => d === today() || !state.days.length || state.daySet.has(d));
      opts.onUrl?.(evn, endsNow() ? null : day, state.range);
      updateDayButtons();
      renderCalendar();
      if (!o.keep) showMsg('Loading …');

      const parts = await Promise.all(wanted.map(d => cachedDayPoints(evn, d)));
      if (token !== state.loadToken || !state.open) return;
      state.raw = parts.flat().sort((a, b) => a.time - b.time);
      build(o);
    }

    // Live update (every live poll): extend the route to the loco's new live position, without a new request
    function liveUpdate() {
      if (state.open && state.raw && endsNow()) build({ keep: true });
    }

    // Route, stops, trains and slider from the fetched positions (+ the current live position at the end)
    function build(o = {}) {
      if (!state.open || !state.raw) return;
      const evn = state.evn, day = state.day;
      const wasAtEnd = !state.pts.length || state.cur >= state.pts.length - 1;
      const keepTime = o.keep && !wasAtEnd ? state.times[state.cur] : null;
      const range = effectiveRange();
      const { start, end } = windowRange(range === 0 ? 2 : range);
      let pts = state.raw.filter(p => p.time >= start && p.time <= end);
      // live position at the end of the timeline
      const v = endsNow() ? opts.getLive?.(evn) : null;
      if (v && v.location_lat != null && pts.length) {
        const last = pts[pts.length - 1];
        if (Math.abs(last.location_lat - v.location_lat) > 1e-6 || Math.abs(last.location_lon - v.location_lon) > 1e-6) {
          pts.push({ location_lat: v.location_lat, location_lon: v.location_lon, time: Math.floor(Date.now() / 1000), route_id: v.trainNumber || '' });
        }
      }
      // this train: from its first point with the current train number
      let dayLine = EMPTY;
      if (range === 0) {
        const zug = String(v?.trainNumber || '').trim();
        // walk back from now: same number (gaps without a number and breaks up to 8 h are bridged), stop at another number
        let s = -1;
        if (zug) {
          for (let i = pts.length - 1; i >= 0; i--) {
            const rid = String(pts[i].route_id || '').trim();
            if (rid === zug) { if (s === -1 || pts[s].time - pts[i].time < 8 * 3600) s = i; else break; }
            else if (rid && s !== -1) break;
          }
        }
        if (s > 0) {
          // the rest of today before the train started: thin grey line
          const midnight = parseYmd(today()).getTime() / 1000;
          const before = pts.slice(0, s + 1).filter(p => p.time >= midnight);
          if (before.length > 1) dayLine = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: before.map(p => [p.location_lon, p.location_lat]) } };
          pts = pts.slice(s);
        } else if (!zug) {
          // no train number: last 24 h instead
          pts = pts.filter(p => p.time >= end - 86400);
        }
      }
      state.pts = pts;
      state.coords = pts.map(p => [p.location_lon, p.location_lat]);
      state.times = pts.map(p => +p.time);
      state.effRange = range;
      if (pts.length < 2) {
        setTrail(map);
        state.trains = []; state.speedAt = []; state.stats = {};
        $('slider').max = 0; $('trains').innerHTML = ''; $('info').innerHTML = '';
        $('time').textContent = '--:--';
        showMsg('No positions ' + (endsNow() ? 'in the last ' + rangeName(range) : (range > 1 ? 'in these days' : 'on ' + dayLong(day))) + '. Use ‹ › (A / D) or the calendar to pick a day with data.');
        setLive(endsNow() && online());
        updateLiveBadge();
        return;
      }
      showMsg('');
      const speed = buildSpeedGeo(state.coords, state.times);
      let stops = buildStopGeo(state.coords, state.times);
      if (range > 1) stops = { type: 'FeatureCollection', features: stops.features.filter(f => f.properties.min >= MULTI_DAY_MIN_STOP) };
      setTrail(map, dayLine, speed, stops);
      state.speedAt = new Array(pts.length).fill(0);
      for (const f of speed.features) for (let i = f.properties.pi; i < f.properties.pj; i++) state.speedAt[i] = f.properties.kmh;
      state.trains = buildTrains(pts);
      computeStats(speed, stops);
      renderTrains();
      $('slider').max = pts.length - 1;
      setDockHeight();
      if (o.fit) fit(state.coords);
      // slider: stays at "now" when it was there, else at the same time
      if (keepTime != null) {
        let i = state.times.findIndex(t => t >= keepTime);
        setCursor(i < 0 ? pts.length - 1 : i);
      } else setCursor(o.cursor === 'start' ? 0 : pts.length - 1);
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
      const multi = state.times.length && ymd(new Date(state.times[0] * 1000)) !== ymd(new Date(state.times[state.times.length - 1] * 1000));
      $('trains').innerHTML = state.trains.length
        ? state.trains.map((t, k) => `<span class="chip ${t.freight ? 'freight' : ''}" data-k="${k}" title="${esc(t.route)}">${multi ? esc(shortDate(state.times[t.i0])) + ' · ' : ''}${esc(t.rid)}<small>${hhmm(state.times[t.i0])}–${hhmm(state.times[t.i1])} ${esc(t.route)}</small></span>`).join('')
        : '<span class="chip"><small>no train numbers in this period</small></span>';
    }

    // ------------------------------------------------------------------
    // Live state: slider at "now" of a window that ends now, loco online, not playing
    // ------------------------------------------------------------------
    function setLive(on) {
      if (on === state.live) return;
      state.live = on;
      opts.onLiveChange?.(on);
    }
    function updateLiveBadge() {
      const b = $('btnBackLive');
      b.classList.toggle('is-live', state.live);
      b.innerHTML = state.live ? '<span class="live-dot"></span>LIVE' : 'Back to live';
      b.disabled = state.live;
      b.hidden = !state.live && !online();
    }
    function backToLive() {
      if (!endsNow()) { load(today()); return; }
      stop();
      setCursor(state.pts.length - 1);
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
      const multi = ymd(new Date(state.times[0] * 1000)) !== ymd(new Date(state.times[state.times.length - 1] * 1000));
      $('time').innerHTML = (multi ? `<small>${esc(shortDate(t0))}</small>` : '') + hhmmss(t0);
      setLive(endsNow() && online() && !state.playing && i === state.pts.length - 1);
      // live: the live symbol shows the loco; otherwise the marker at the slider position
      map.getSource('cursor')?.setData(state.live ? EMPTY : { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: state.coords[i] } });
      setTrailCursor(map, i);
      updateLiveBadge();
      const t = trainAt(i);
      const s = state.stats;
      $('info').innerHTML = `
        <span>${t ? `<b>${esc(t.rid)}</b> ${esc(t.route)}${t.freight ? ' · freight' : ''}` : 'no train'}</span>
        <span>speed <b>${state.speedAt[i] >= 120 ? '120+' : state.speedAt[i]} km/h</b></span>
        <span>${rangeName(state.effRange)}: <b>${(s.km || 0).toFixed(0)} km</b>, max <b>${s.vmax || 0} km/h</b>, ${s.stops || 0} stops, ${state.trains.length} trains (${s.freight || 0} freight)</span>`;
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
        if (state.cur + step >= state.pts.length - 1) { stop(); setCursor(state.pts.length - 1); return; }
        setCursor(state.cur + step);
      }
      raf = requestAnimationFrame(frame);
    }
    function play() {
      if (state.pts.length < 2) return;
      state.playing = true; lastTs = 0; acc = 0;
      if (state.cur >= state.pts.length - 1) setCursor(0);     // from "now": start at the beginning of the timeline
      else setCursor(state.cur);
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
      $('speedVal').textContent = $('speedBtn').textContent = fmtSpeed(state.speed);
      lsSet(LS.speed, state.speed);
    }

    // ------------------------------------------------------------------
    // Day navigation (only days with data; today is always allowed)
    // ------------------------------------------------------------------
    function navDays() {
      const t = today();
      return state.daySet.has(t) ? state.days : [...state.days, t];
    }
    function neighbour(delta) {
      const d = state.day, list = navDays();
      return delta > 0 ? list.find(x => x > d) : [...list].reverse().find(x => x < d);
    }
    function updateDayButtons() {
      $('prevDay').disabled = !neighbour(-1);
      $('nextDay').disabled = !neighbour(+1);
      const range = state.range === 0 && !endsNow() ? 1 : state.range;
      for (const b of $('rangeSeg').querySelectorAll('button')) {
        b.classList.toggle('on', +b.dataset.n === range);
        if (+b.dataset.n === 0) b.disabled = b.hidden = !endsNow();   // only for the train running now
      }
      if (endsNow()) $('dayLabel').textContent = range === 0 ? 'This train' : 'Last ' + rangeName(range);
      else {
        const first = addDays(state.day, -(Math.max(1, range) - 1));
        $('dayLabel').textContent = range > 1 ? dayName(first) + ' – ' + dayName(state.day) : dayLong(state.day);
      }
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
      const t = today();
      const range = Math.max(1, state.range);
      const win = new Set(daysBetween(addDays(state.day, -(range - 1)), state.day));
      const list = navDays();
      const minM = parseYmd(list[0]);
      const maxM = parseYmd(list[list.length - 1]);
      const canPrev = (m.getFullYear() * 12 + m.getMonth()) > (minM.getFullYear() * 12 + minM.getMonth());
      const canNext = (m.getFullYear() * 12 + m.getMonth()) < (maxM.getFullYear() * 12 + maxM.getMonth());
      let cells = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(w => `<span class="wd">${w}</span>`).join('');
      for (let i = 0; i < offset; i++) cells += '<span></span>';
      let monthCount = 0;
      for (let d = 1; d <= nDays; d++) {
        const key = m.getFullYear() + pad(m.getMonth() + 1) + pad(d);
        const has = state.daySet.has(key) || key === t;
        if (state.daySet.has(key)) monthCount++;
        const cls = [state.daySet.has(key) ? 'has' : '', key === state.day ? 'sel' : (win.has(key) ? 'inrange' : ''), key === t ? 'today' : ''].join(' ');
        cells += `<button type="button" class="${cls}" data-day="${key}" ${has ? '' : 'disabled'} title="${has ? dayLong(key) : 'no data'}">${d}</button>`;
      }
      $('cal').innerHTML = `
        <div class="cal-head">
          <button type="button" data-mon="-1" ${canPrev ? '' : 'disabled'} aria-label="Previous month">‹</button>
          <strong>${MON[m.getMonth()]} ${m.getFullYear()}</strong>
          <button type="button" data-mon="1" ${canNext ? '' : 'disabled'} aria-label="Next month">›</button>
        </div>
        <div class="cal-grid">${cells}</div>
        <div class="cal-foot"><span>${monthCount} day${monthCount === 1 ? '' : 's'} with data</span><button type="button" data-latest="1">now</button></div>`;
    }

    function toggleCalendar(on) {
      const cal = $('cal');
      on = on ?? cal.hidden;
      if (on) { const d = parseYmd(state.day); state.calMonth = new Date(d.getFullYear(), d.getMonth(), 1); renderCalendar(); }
      cal.hidden = !on;
    }

    // ------------------------------------------------------------------
    // UI (wired once; handlers do nothing while the timeline is closed)
    // ------------------------------------------------------------------
    function wireUI() {
      $('slider').addEventListener('input', e => { stop(); setCursor(+e.target.value); });
      $('btnPlay').addEventListener('click', () => state.playing ? (stop(), setCursor(state.cur)) : play());
      $('btnBackLive').addEventListener('click', backToLive);
      const sp = $('speed');
      setSpeed(state.speed);
      sp.addEventListener('input', () => setSpeed(toSpeed(+sp.value)));
      sp.addEventListener('dblclick', () => setSpeed(SPEED_DEFAULT));
      // phone: one button that steps through the playback speeds
      const PRESETS = [1, 2, 4, 8, 16, 32, 64, 100];
      $('speedBtn').addEventListener('click', () => setSpeed(PRESETS.find(p => p > state.speed + 0.01) || PRESETS[0]));
      $('prevDay').addEventListener('click', () => shiftDay(-1));
      $('nextDay').addEventListener('click', () => shiftDay(+1));
      $('rangeSeg').addEventListener('click', e => {
        const b = e.target.closest('button[data-n]');
        if (!b || b.disabled || +b.dataset.n === state.range) return;
        state.range = +b.dataset.n;
        load(state.day, { fit: true });
      });
      $('dayBtn').addEventListener('click', e => { e.stopPropagation(); toggleCalendar(); });
      $('cal').addEventListener('click', e => {
        e.stopPropagation();
        const mon = e.target.closest('button[data-mon]');
        if (mon) { state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + +mon.dataset.mon, 1); renderCalendar(); return; }
        const d = e.target.closest('button[data-day]');
        if (d && !d.disabled) { toggleCalendar(false); load(d.dataset.day); return; }
        if (e.target.closest('button[data-latest]')) { toggleCalendar(false); load(today()); }
      });
      document.addEventListener('click', () => toggleCalendar(false));
      $('btnFit').addEventListener('click', () => fit(state.coords));
      $('trains').addEventListener('click', e => {
        const c = e.target.closest('.chip[data-k]');
        if (!c) return;
        const t = state.trains[+c.dataset.k];
        stop();
        setCursor(t.i0);
        fit(state.coords.slice(t.i0, t.i1 + 1));
      });
      // Keys: Space play/pause, , . step, A D day, Q E speed, L live, Esc close. Arrow keys are left to the map (panning).
      window.addEventListener('keydown', e => {
        if (!state.open) return;
        const tag = (e.target.tagName || '').toLowerCase();
        if ((tag === 'input' && e.target.type !== 'range') || tag === 'textarea') return;
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        if (!$('tableView').hidden) return;                       // the loco table has the keyboard
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (k === 'Escape') {
          e.preventDefault(); e.stopPropagation();
          if (!$('cal').hidden) toggleCalendar(false); else opts.onCloseRequest?.();
        }
        else if (k === 'a' || k === 'd') { e.preventDefault(); if (!e.repeat) shiftDay(k === 'd' ? 1 : -1); }
        else if (k === 'q' || k === 'e') { e.preventDefault(); setSpeed(toSpeed(toSlider(state.speed) + (k === 'e' ? SPEED_KEY_STEP : -SPEED_KEY_STEP))); }
        else if (k === 'l') { e.preventDefault(); backToLive(); }
        else if (k === ' ') { e.preventDefault(); state.playing ? (stop(), setCursor(state.cur)) : play(); }
        else if (k === ',' || k === '.') { e.preventDefault(); stop(); setCursor(state.cur + (k === '.' ? 1 : -1)); }
      }, true);
    }

    // ------------------------------------------------------------------
    // Open / close
    // ------------------------------------------------------------------
    async function open(evn, o = {}) {
      if (!isEvn(evn)) return false;
      const token = ++state.openToken;
      ensureLayers();
      if (evn !== state.evn) { pastDays.clear(); state.days = []; state.daySet = new Set(); }
      state.evn = evn;
      state.open = true;
      state.pts = []; state.coords = []; state.times = []; state.trains = []; state.cur = 0;
      state.calMonth = null;
      state.live = null;            // unknown: the first setCursor reports the state to app.js
      stop();
      state.range = RANGES.includes(o.range) ? o.range : DEFAULT_RANGE;
      setTrail(map);
      map.getSource('cursor')?.setData(EMPTY);
      $('trains').innerHTML = ''; $('info').innerHTML = ''; $('time').textContent = '--:--';
      $('dock').hidden = false;
      document.body.classList.add('tl-open');
      setDockHeight();
      setMarkerImage(evn, o.icon, token);
      // days with data (for the arrows and the calendar); today works without it
      let day = parseYmd(o.day) ? o.day : null;
      if (!state.days.length) {
        try {
          const list = await getJSON(API + 'bkv/vehicles/' + encodeURIComponent(evn) + '/history-days');
          state.days = [...new Set((list || []).map(x => String(x.date)).filter(s => /^\d{8}$/.test(s)))].sort();
          state.daySet = new Set(state.days);
        } catch (e) { console.warn('history-days failed', e); }
      }
      if (token !== state.openToken || !state.open) return false;
      // offline locos without data today: their last day with data
      if (!day) day = (!online() && state.days.length && !state.daySet.has(today())) ? state.days[state.days.length - 1] : today();
      await load(day, { fit: o.fit });
      clearInterval(refreshTimer);
      refreshTimer = setInterval(() => { if (state.open && endsNow() && document.visibilityState === 'visible') load(state.day, { keep: true }); }, REFRESH_MS);
      return true;
    }

    function close() {
      if (!state.open) return;
      state.open = false;
      state.openToken++; state.loadToken++;
      clearInterval(refreshTimer); refreshTimer = null;
      stop();
      toggleCalendar(false);
      showMsg('');
      setTrail(map);
      map.getSource('cursor')?.setData(EMPTY);
      $('dock').hidden = true;
      document.body.classList.remove('tl-open');
      setLive(false);
      state.live = false;
    }

    wireUI();
    return {
      state, open, close, load, liveUpdate, setCursor, backToLive,
      isOpen: () => state.open, isLive: () => state.live, fit: () => fit(state.coords)
    };
  };
})();
