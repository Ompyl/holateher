/* holateher – live map of freight trains in Hungary.
 * Data: realtimenext.hu (public API, CORS *). Shared code: common.js (window.HT). See PLAN.md.
 */
(() => {
  'use strict';
  const {
    API, BASE_STYLE, EMPTY, $, esc, isEvn, fmtEvn, countryOf, kindOf, ymd, hhmm, lsGet, lsSet,
    historyUrl, datasheetUrl, photosUrl, shortNo, getJSON, loadScript, parseCSV, dayPoints, buildSpeedGeo, buildStopGeo,
    makeFallbackIcon, addTrailLayers, setTrail, legendHTML, openGoogle, openOrm
  } = window.HT;

  // ------------------------------------------------------------------
  // Settings
  // ------------------------------------------------------------------
  const LIVE_URL = API + 'bkv/vehicles/online/map';
  const ICONS_URL = API + 'admin/icons/bkv';
  const POLL_MS = 10000;              // same as map.realtimenext.hu
  const TRAIL_REFRESH_MS = 60000;     // reload the selected train's route
  const IDLE_KEEP_MS = 48 * 3600e3;   // remember freight locos seen by this browser for 48 h
  const HU_VIEW = { center: [19.3, 47.2], zoom: 6.6 };
  const LS = { view: 'holateher.view', idle: 'holateher.showIdle', seen: 'holateher.seenFreight', modelIcons: 'holateher.modelIcons' };

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------
  const state = {
    live: [],                 // last live list (all vehicles)
    byEvn: new Map(),         // EVN -> live entry (rail only)
    known: new Map(),         // EVN -> row of loks.csv
    customImg: new Map(),     // bildkategorie -> image URL
    seen: lsGet(LS.seen, {}), // EVN -> { t, zug, rel, model } last seen as freight train (this browser)
    showIdle: lsGet(LS.idle, true),
    iconUrl: new Map(),       // realtimenext icon id -> URL
    loadedImg: new Set(),
    selected: null,
    trailInfo: null,
    timer: null
  };

  // ------------------------------------------------------------------
  // Map
  // ------------------------------------------------------------------
  const savedView = lsGet(LS.view, null);
  const map = new maplibregl.Map({
    container: 'map',
    style: BASE_STYLE,
    center: savedView ? savedView.center : HU_VIEW.center,
    zoom: savedView ? savedView.zoom : HU_VIEW.zoom,
    attributionControl: false
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  map.on('moveend', () => lsSet(LS.view, { center: map.getCenter().toArray(), zoom: map.getZoom() }));

  async function ensureImage(id, url) {
    if (state.loadedImg.has(id) || map.hasImage(id)) { state.loadedImg.add(id); return true; }
    state.loadedImg.add(id);
    try {
      const img = await map.loadImage(url);
      if (!map.hasImage(id)) map.addImage(id, img.data);
      return true;
    } catch (e) {
      console.warn('Image could not be loaded', id, url, e);
      return false;
    }
  }

  // Image for a vehicle: own category > realtimenext category > same model > fallback
  function imageFor(v, modelCat) {
    const own = state.known.get(v.rail_uic)?.bildkategorie;
    if (own && state.customImg.has(own)) return 'own:' + own;
    let cat = v.category != null ? String(v.category) : null;      // icon id 1 = grey "?"
    if ((!cat || cat === '1') && modelCat.has(v.vehicleModel)) cat = modelCat.get(v.vehicleModel);
    if (cat && cat !== '1' && state.iconUrl.has(cat)) return 'rtn:' + cat;
    return 'fallback';
  }

  async function loadImagesFor(features) {
    const jobs = [];
    for (const f of features) {
      const id = f.properties.img;
      if (state.loadedImg.has(id)) continue;
      if (id.startsWith('rtn:')) jobs.push(ensureImage(id, API + state.iconUrl.get(id.slice(4)).replace(/^\/+/, '')));
      else if (id.startsWith('own:')) jobs.push(ensureImage(id, state.customImg.get(id.slice(4))));
    }
    if (jobs.length) await Promise.allSettled(jobs);
  }

  // ------------------------------------------------------------------
  // Live data
  // ------------------------------------------------------------------
  function rememberFreight(list) {
    const now = Date.now();
    for (const v of list) {
      if (v.trainType === 'T' && isEvn(v.rail_uic)) {
        state.seen[v.rail_uic] = { t: now, zug: v.trainNumber || '', rel: v.relation || '', model: v.vehicleModel || '' };
      }
    }
    for (const [k, s] of Object.entries(state.seen)) if (now - s.t > IDLE_KEEP_MS) delete state.seen[k];
    lsSet(LS.seen, state.seen);
  }

  // Known freight loco that currently has no train?
  function isIdleFreight(v) {
    if (v.trainType) return false;
    return state.known.has(v.rail_uic) || !!state.seen[v.rail_uic];
  }

  function buildFeatures() {
    // most common realtimenext icon per model (replacement for missing images)
    const counts = new Map();
    for (const v of state.live) {
      if (v.category == null || String(v.category) === '1' || !v.vehicleModel) continue;
      const m = counts.get(v.vehicleModel) || new Map();
      m.set(String(v.category), (m.get(String(v.category)) || 0) + 1);
      counts.set(v.vehicleModel, m);
    }
    const modelCat = new Map([...counts].map(([k, m]) => [k, [...m].sort((a, b) => b[1] - a[1])[0][0]]));
    // for the history page: model -> image URL (used when a loco has no own image)
    const modelIcons = {};
    for (const [model, cat] of modelCat) if (state.iconUrl.has(cat)) modelIcons[model] = state.iconUrl.get(cat);
    if (Object.keys(modelIcons).length) lsSet(LS.modelIcons, modelIcons);

    const feats = [];
    let nFreight = 0, nIdle = 0;
    for (const v of state.live) {
      if (!v.is_rail_uic || v.location_lat == null || v.location_lon == null) continue;
      const freight = v.trainType === 'T';
      const idle = !freight && state.showIdle && isIdleFreight(v);
      if (!freight && !idle) continue;
      freight ? nFreight++ : nIdle++;
      feats.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [v.location_lon, v.location_lat] },
        properties: { evn: v.rail_uic, zug: v.trainNumber || '', idle: !freight, img: imageFor(v, modelCat), sel: v.rail_uic === state.selected }
      });
    }
    return { fc: { type: 'FeatureCollection', features: feats }, nFreight, nIdle };
  }

  async function refreshLive() {
    try {
      const list = await getJSON(LIVE_URL);
      if (!Array.isArray(list)) throw new Error('unexpected response');
      state.live = list;
      state.byEvn = new Map(list.filter(v => v.is_rail_uic).map(v => [v.rail_uic, v]));
      rememberFreight(list);
      await drawVehicles();
      setStatus('updated ' + new Date().toLocaleTimeString('en-GB'));
      if (state.selected) renderPanel();
      if (!$('tableView').hidden) renderTable();
    } catch (e) {
      console.error(e);
      setStatus('Could not load live data – retrying shortly', true);
    }
  }

  async function drawVehicles() {
    const { fc, nFreight, nIdle } = buildFeatures();
    await loadImagesFor(fc.features);
    map.getSource('vehicles')?.setData(fc);
    $('counts').textContent = nFreight + ' freight trains' + (state.showIdle ? ' · ' + nIdle + ' idle' : '');
  }

  function setStatus(text, error) {
    const el = $('status');
    el.textContent = text;
    el.classList.toggle('error', !!error);
  }

  // Poll only while the tab is visible
  function startPolling() { stopPolling(); refreshLive(); state.timer = setInterval(refreshLive, POLL_MS); }
  function stopPolling() { if (state.timer) clearInterval(state.timer); state.timer = null; }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') startPolling();
    else { stopPolling(); setStatus('paused (tab in background)'); }
  });

  // ------------------------------------------------------------------
  // Route travelled by the selected train
  // ------------------------------------------------------------------
  let trailToken = 0, trailTimer = null;

  function clearTrail() {
    trailToken++;
    if (trailTimer) clearInterval(trailTimer);
    trailTimer = null;
    setTrail(map);
  }

  // From the first point with the current train number until now.
  // If the train started before midnight, the previous day is added.
  async function loadTrail(evn) {
    const token = ++trailToken;
    const v = state.byEvn.get(evn);
    const zug = String(v?.trainNumber || '').trim();
    const today = new Date();
    let pts = await dayPoints(evn, ymd(today));
    let start = zug ? pts.findIndex(p => String(p.route_id || '').trim() === zug) : -1;
    if (zug && pts.length && (start === -1 || start === 0 || pts[start].time - pts[0].time < 1200)) {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      const prev = await dayPoints(evn, ymd(y));
      const ps = prev.findIndex(p => String(p.route_id || '').trim() === zug);
      if (ps !== -1) { pts = prev.slice(ps).concat(pts); start = 0; }
    }
    if (token !== trailToken) return;            // another train selected meanwhile
    if (!pts.length) { setTrail(map); state.trailInfo = { none: true }; renderPanel(); return; }
    if (v && v.location_lat != null) {           // append current live position
      const last = pts[pts.length - 1];
      if (Math.abs(last.location_lat - v.location_lat) > 1e-6 || Math.abs(last.location_lon - v.location_lon) > 1e-6) {
        pts.push({ location_lat: v.location_lat, location_lon: v.location_lon, time: Math.floor(Date.now() / 1000) });
      }
    }
    if (start < 0) start = 0;
    const coords = pts.map(p => [p.location_lon, p.location_lat]);
    const times = pts.map(p => +p.time);
    const trip = coords.slice(start), tripT = times.slice(start);
    setTrail(map,
      start > 0 ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords.slice(0, start + 1) } } : EMPTY,
      trip.length > 1 ? buildSpeedGeo(trip, tripT) : EMPTY,
      trip.length > 1 ? buildStopGeo(trip, tripT) : EMPTY);
    state.trailInfo = { from: tripT[0], zug };
    renderPanel();
  }

  // ------------------------------------------------------------------
  // Selection and info panel
  // ------------------------------------------------------------------
  function select(evn) {
    state.selected = evn;
    state.trailInfo = null;
    $('panel').hidden = false;
    renderPanel();
    drawVehicles();
    clearTrail();
    loadTrail(evn);
    trailTimer = setInterval(() => loadTrail(evn), TRAIL_REFRESH_MS);
  }
  function unselect() {
    state.selected = null;
    state.panelHtml = null;
    $('panel').hidden = true;
    clearTrail();
    drawVehicles();
  }

  function lastFreightText(evn) {
    const s = state.seen[evn], k = state.known.get(evn);
    if (s) return 'last freight train ' + s.zug + ' ' + s.rel;
    if (k?.letzter_gueterzug) return 'last freight train ' + k.letzter_gueterzug + ' ' + (k.letzte_strecke || '');
    return '';
  }

  function renderPanel() {
    const evn = state.selected;
    if (!evn) return;
    const v = state.byEvn.get(evn);
    const k = state.known.get(evn);
    const freight = v?.trainType === 'T';
    const title = freight ? 'Train ' + esc(v.trainNumber) : (v ? 'Loco without train' : 'Loco offline');
    const rel = freight ? (v.relation || '–') : lastFreightText(evn);
    const delay = v?.delayMin != null && freight ? (v.delayMin > 0 ? '+' + v.delayMin + ' min' : v.delayMin + ' min') : '–';
    const ti = state.trailInfo;
    const trailText = !ti ? '<span class="note">loading …</span>'
      : ti.none ? '<span class="note">no positions today</span>'
      : ti.zug ? 'of train ' + esc(ti.zug) + ' since ' + hhmm(ti.from) : 'today';
    const html = `
      <h3>${title}</h3>
      <div class="rel">${esc(rel)}</div>
      <dl>
        <dt>Loco</dt><dd>${esc(fmtEvn(evn))}</dd>
        <dt>Type</dt><dd>${esc(v?.vehicleModel || k?.loktyp || '–')}</dd>
        <dt>Kind</dt><dd>${esc(kindOf(evn) || '–')}</dd>
        <dt>Registered</dt><dd>${esc(countryOf(evn) || '–')}</dd>
        <dt>Delay</dt><dd>${esc(delay)}</dd>
        <dt>Status</dt><dd>${v ? (v.moving ? 'moving' : 'stopped') : 'no live data'}</dd>
        ${k?.beschreibung ? `<dt>Note</dt><dd>${esc(k.beschreibung)}${k.notiz ? ' · ' + esc(k.notiz) : ''}</dd>` : ''}
      </dl>
      <div class="actions">
        <a class="btn" href="${historyUrl(evn, ymd(new Date()))}">History</a>
        <a class="btn" href="${datasheetUrl(evn)}" target="_blank" rel="noopener" title="Vehicle page on realtimenext.hu (new tab)">Datasheet ↗</a>
        <a class="btn" href="${photosUrl(evn)}" target="_blank" rel="noopener" title="Photos of “${esc(shortNo(evn))}” on bahnbilder.de (new tab)">Photos ↗</a>
      </div>
      <div><strong>Route travelled</strong> ${trailText}</div>
      ${legendHTML(true)}`;
    // only rebuild when something changed (otherwise a click during an update could get lost)
    if (html !== state.panelHtml) { $('panelBody').innerHTML = html; state.panelHtml = html; }
  }

  // ------------------------------------------------------------------
  // Table of known freight locos
  // ------------------------------------------------------------------
  const COLS = [
    { key: 'status', label: 'Status' },
    { key: 'evnFmt', label: 'Number' },
    { key: 'beschreibung', label: 'Description' },
    { key: 'loktyp', label: 'Type' },
    { key: 'kind', label: 'Kind' },
    { key: 'country', label: 'Registered' },
    { key: 'zug', label: 'Last freight train' },
    { key: 'strecke', label: 'Route' },
    { key: 'zuletzt', label: 'Last seen' }
  ];
  const tableSort = { key: 'status', desc: false };

  function tableRows() {
    const evns = new Set([...state.known.keys(), ...Object.keys(state.seen)]);
    const rows = [];
    for (const evn of evns) {
      const k = state.known.get(evn) || {};
      const s = state.seen[evn];
      const v = state.byEvn.get(evn);
      let status, rank, cls;
      if (v?.trainType === 'T') { status = 'Freight ' + (v.trainNumber || ''); rank = 0; cls = 'st-freight'; }
      else if (v?.trainType) { status = (v.trainType === 'S' ? 'Passenger ' : 'Train ') + (v.trainNumber || ''); rank = 1; cls = 'st-other'; }
      else if (v) { status = 'no train'; rank = 2; cls = 'st-idle'; }
      else { status = 'offline'; rank = 3; cls = 'st-off'; }
      const seenDate = s ? new Date(s.t) : null;
      rows.push({
        evn, evnFmt: fmtEvn(evn), status, rank, cls, isNew: !state.known.has(evn),
        beschreibung: k.beschreibung || '',
        loktyp: k.loktyp || v?.vehicleModel || s?.model || '',
        kind: kindOf(evn), country: countryOf(evn),
        zug: s?.zug || k.letzter_gueterzug || '',
        strecke: s ? (s.rel || '') : (k.letzte_strecke || ''),
        zuletzt: seenDate ? seenDate.toISOString().slice(0, 10) + ' ' + seenDate.toTimeString().slice(0, 5) : (k.zuletzt_gueterzug || ''),
        online: !!v
      });
    }
    const f = $('tableFilter').value.trim().toLowerCase();
    const filtered = f ? rows.filter(r => [r.evn, r.evnFmt, r.beschreibung, r.loktyp, r.country, r.zug, r.strecke, r.status].join(' ').toLowerCase().includes(f)) : rows;
    const key = tableSort.key === 'status' ? 'rank' : tableSort.key;
    filtered.sort((a, b) => {
      const x = a[key], y = b[key];
      const c = typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true });
      return (tableSort.desc ? -c : c) || a.evn.localeCompare(b.evn);
    });
    return filtered;
  }

  function renderTable() {
    const thead = $('lokTable').tHead, tbody = $('lokTable').tBodies[0];
    thead.innerHTML = '<tr>' + COLS.map(c => `<th data-key="${c.key}" class="${tableSort.key === c.key ? 'sorted' + (tableSort.desc ? ' desc' : '') : ''}">${c.label}</th>`).join('') + '<th></th></tr>';
    tbody.innerHTML = tableRows().map(r => `
      <tr>
        <td class="${r.cls}">${esc(r.status)}</td>
        <td class="num">${esc(r.evnFmt)}${r.isNew ? '<span class="tag">new</span>' : ''}</td>
        <td>${esc(r.beschreibung)}</td>
        <td>${esc(r.loktyp)}</td>
        <td>${esc(r.kind)}</td>
        <td>${esc(r.country)}</td>
        <td class="num">${esc(r.zug)}</td>
        <td>${esc(r.strecke)}</td>
        <td class="num">${esc(r.zuletzt)}</td>
        <td>
          <a class="btn small" href="${historyUrl(r.evn)}">History</a>
          <a class="btn small" href="${datasheetUrl(r.evn)}" target="_blank" rel="noopener" title="Vehicle page on realtimenext.hu (new tab)">Info ↗</a>
          <a class="btn small" href="${photosUrl(r.evn)}" target="_blank" rel="noopener" title="Photos of “${esc(shortNo(r.evn))}” on bahnbilder.de (new tab)">Photos ↗</a>
          ${r.online ? `<button type="button" class="small" data-show="${r.evn}">Map</button>` : ''}
        </td>
      </tr>`).join('');
  }

  function showTable(on) {
    $('tableView').hidden = !on;
    $('tableBackdrop').hidden = !on;
    if (on) renderTable();
  }

  function showOnMap(evn) {
    const v = state.byEvn.get(evn);
    if (!v) return;
    showTable(false);
    if (!state.showIdle && v.trainType !== 'T') { state.showIdle = true; $('showIdle').checked = true; lsSet(LS.idle, true); }
    map.flyTo({ center: [v.location_lon, v.location_lat], zoom: Math.max(map.getZoom(), 11) });
    select(evn);
  }

  // Excel export (SheetJS is loaded on first use)
  async function exportExcel() {
    if (!window.XLSX) await loadScript('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js');
    const base = location.href.replace(/[^/]*$/, '');
    const rows = tableRows().map(r => ({
      'Number (EVN)': r.evn, 'Number formatted': r.evnFmt, 'Description': r.beschreibung, 'Type': r.loktyp,
      'Kind': r.kind, 'Registered': r.country, 'Status now': r.status, 'Last freight train': r.zug, 'Route': r.strecke,
      'Last seen': r.zuletzt, 'In loks.csv': r.isNew ? 'no' : 'yes', 'History': base + historyUrl(r.evn)
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [16, 18, 40, 22, 20, 22, 18, 16, 40, 17, 10, 60].map(w => ({ wch: w }));
    rows.forEach((r, i) => { const cell = ws[XLSX.utils.encode_cell({ r: i + 1, c: 11 })]; if (cell) cell.l = { Target: r.History }; });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Freight locos');
    XLSX.writeFile(wb, 'holateher-freight-locos-' + ymd(new Date()) + '.xlsx');
  }

  // ------------------------------------------------------------------
  // UI wiring
  // ------------------------------------------------------------------
  function wireUI() {
    $('showIdle').checked = state.showIdle;
    $('showIdle').addEventListener('change', e => { state.showIdle = e.target.checked; lsSet(LS.idle, state.showIdle); drawVehicles(); });
    $('btnGoogle').addEventListener('click', () => openGoogle(map));
    $('btnOrm').addEventListener('click', () => openOrm(map));
    $('btnTable').addEventListener('click', () => showTable(true));
    $('tableClose').addEventListener('click', () => showTable(false));
    $('tableBackdrop').addEventListener('click', () => showTable(false));   // click next to the window closes it
    $('tableFilter').addEventListener('input', renderTable);
    $('btnExport').addEventListener('click', () => exportExcel().catch(e => { console.error(e); alert('Excel export failed.'); }));
    $('lokTable').addEventListener('click', e => {
      const th = e.target.closest('th[data-key]');
      if (th) {
        const key = th.dataset.key;
        tableSort.desc = tableSort.key === key ? !tableSort.desc : false;
        tableSort.key = key;
        renderTable();
        return;
      }
      const b = e.target.closest('button[data-show]');
      if (b) showOnMap(b.dataset.show);
    });
    $('panelClose').addEventListener('click', unselect);
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (!$('tableView').hidden) showTable(false);
      else if (state.selected) unselect();
    });
  }

  // ------------------------------------------------------------------
  // Start
  // ------------------------------------------------------------------
  async function loadStatic() {
    const [loks, bilder, icons] = await Promise.allSettled([
      fetch('data/loks.csv', { cache: 'no-cache' }).then(r => r.ok ? r.text() : ''),
      fetch('data/bildkategorien.csv', { cache: 'no-cache' }).then(r => r.ok ? r.text() : ''),
      getJSON(ICONS_URL)
    ]);
    if (loks.status === 'fulfilled') for (const row of parseCSV(loks.value)) if (isEvn(row.evn)) state.known.set(row.evn, row);
    if (bilder.status === 'fulfilled') for (const row of parseCSV(bilder.value)) if (row.kategorie && row.bild) state.customImg.set(row.kategorie, row.bild);
    if (icons.status === 'fulfilled' && Array.isArray(icons.value)) for (const ic of icons.value) state.iconUrl.set(String(ic.id), ic.url);
    else console.warn('realtimenext icon list not loaded, using fallback symbols only');
  }

  function addLayers() {
    map.addImage('fallback', makeFallbackIcon());
    state.loadedImg.add('fallback');
    addTrailLayers(map);
    map.addSource('vehicles', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'vehicle-sel', type: 'circle', source: 'vehicles', filter: ['==', ['get', 'sel'], true],
      paint: { 'circle-radius': 20, 'circle-color': 'rgba(31,138,138,0.25)', 'circle-stroke-color': '#1f8a8a', 'circle-stroke-width': 2 } });
    map.addLayer({ id: 'vehicles', type: 'symbol', source: 'vehicles',
      layout: {
        'icon-image': ['get', 'img'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 6, 0.16, 14, 0.3],
        'icon-allow-overlap': true,
        'symbol-sort-key': ['case', ['get', 'idle'], 0, 1],   // freight trains on top
        'text-field': ['get', 'zug'], 'text-font': ['Noto Sans Regular'], 'text-size': 11,
        'text-offset': [0, 1.5], 'text-anchor': 'top', 'text-optional': true
      },
      paint: {
        'icon-opacity': ['case', ['get', 'idle'], 0.45, 1],
        'text-color': '#1b262b', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5,
        'text-opacity': ['case', ['get', 'idle'], 0.5, 1]
      } });

    // If symbols overlap, a moving freight train wins over a faint idle loco
    map.on('click', 'vehicles', e => {
      const fs = e.features || [];
      const f = fs.find(x => !x.properties.idle) || fs[0];
      if (f) select(f.properties.evn);
    });
    map.on('mouseenter', 'vehicles', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'vehicles', () => { map.getCanvas().style.cursor = ''; });
  }

  wireUI();
  const staticReady = loadStatic();
  map.on('load', async () => {
    addLayers();
    await staticReady;
    if (document.visibilityState === 'visible') startPolling();
    else setStatus('paused (tab in background)');
  });

  window.holateher = { state, map, refreshLive, select };
})();
