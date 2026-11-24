// holateher – start: load static data, create the map and wire the modules. See PLAN.md.
import { $, on, parseCSV } from './util.js?v=20261124d';
import { isEvn } from './evn.js?v=20261124d';
import { fetchIcons, stats } from './api.js?v=20261124d';
import { state } from './state.js?v=20261124d';
import { createMap, addVehicleLayers, drawVehicles } from './map.js?v=20261124d';
import { addTrailLayers } from './trail.js?v=20261124d';
import { startLive, refresh } from './live.js?v=20261124d';
import { initMenu, menuOpen, showMenu } from './menu.js?v=20261124d';
import { initSelection, select, unselect } from './selection.js?v=20261124d';
import { initTimeline, tl, load, setCursor, backToLive, fitRoute } from './timeline.js?v=20261124d';
import { initTable, showTable, tableOpen } from './table.js?v=20261124d';
import { initDebug, toggleDebug } from './debug.js?v=20261124d';
import { loadRailStyle, buildStyle, initRails } from './rails.js?v=20261124d';

const text = url => fetch(url, { cache: 'no-cache' }).then(r => r.ok ? r.text() : '').catch(() => '');

async function loadStatic() {
  const [loks, imgs, icons] = await Promise.all([text('data/loks.csv'), text('data/bildkategorien.csv'), fetchIcons()]);
  for (const row of parseCSV(loks)) if (isEvn(row.evn)) state.known.set(row.evn, row);
  for (const row of parseCSV(imgs)) if (row.kategorie && row.bild) state.customImg.set(row.kategorie, row.bild);
  for (const [id, url] of icons) state.iconUrl.set(id, url);
}

const staticReady = loadStatic();
const map = createMap(buildStyle(await loadRailStyle()));   // base map + railway lines in one style
initRails(map);
initMenu();
initTimeline();
initSelection();
initTable();
initDebug();
on('live', drawVehicles);

// Esc: menu > table > selection (the timeline handles Esc itself while it is open)
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (menuOpen()) showMenu(false);
  else if (tableOpen()) showTable(false);
  else if (state.selected) unselect();
});

// --dock-h for the CSS (info panel above the dock, status line); one observer instead of measuring everywhere
new ResizeObserver(([e]) => document.body.style.setProperty('--dock-h', Math.ceil(e.borderBoxSize?.[0]?.blockSize ?? e.target.offsetHeight) + 'px'))
  .observe($('dock'));

// style.load, not load: load waits for every railway tile, the trains should not wait for that
map.once('style.load', async () => {
  addVehicleLayers();
  addTrailLayers('vehicle-sel');
  await staticReady;
  const first = startLive();
  // ?loco=<EVN>[&date=YYYYMMDD][&days=3|7|14]: open that loco with its timeline after the first live list
  const q = new URLSearchParams(location.search);
  const evn = (q.get('loco') || '').replace(/\D/g, '');
  if (isEvn(evn)) {
    await first;
    const days = +q.get('days');
    select(evn, { day: q.get('date'), range: days > 1 ? days : undefined, fit: true });
  }
});

// for testing in the console
window.holateher = { state, map, refresh, select, unselect, debug: toggleDebug, api: { stats }, tl: { state: tl, load, setCursor, backToLive, fit: fitRoute } };
