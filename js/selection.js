// holateher – selecting a loco: info panel, timeline, ?loco= address, back button closes the selection.
import { SPEED_STOPS, SPEED_CAP } from './config.js?v=20261122g';
import { $, esc, on } from './util.js?v=20261122g';
import { fmtEvn, kindOf, countryOf, shortNo, locoUrl, vehicleUrl, photosUrl } from './evn.js?v=20261122g';
import { state, kindOfLive, lastFreightText, delayText, motionText } from './state.js?v=20261122g';
import { drawVehicles, showOtherVehicles } from './map.js?v=20261122g';
import { openTimeline, closeTimeline, liveUpdate } from './timeline.js?v=20261122g';

export const ICONS = {
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></g></svg>',
  photos: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 7h3l2-3h6l2 3h3v13H4z"/><circle cx="12" cy="13" r="3.5"/></g></svg>',
  history: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></g></svg>',
  map: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.6A2.6 2.6 0 1 1 12 6.4a2.6 2.6 0 0 1 0 5.2z"/></svg>'
};

const legendHtml = () => `
  <div class="legend">
    <div class="gradient" style="background:linear-gradient(to right, ${SPEED_STOPS.map(([k, c]) => c + ' ' + Math.round(k / SPEED_CAP * 100) + '%').join(', ')})"></div>
    <div class="ticks"><span>0</span><span>30</span><span>60</span><span>90</span><span>120+ km/h</span></div>
    <div class="legend2"><span><span class="dot"></span> stop ≥ 2 min</span><span><span class="dash"></span> no data</span><span><span class="dash day"></span> earlier today</span></div>
  </div>`;

let panelHtml = null;

function renderPanel() {
  const evn = state.selected;
  if (!evn) return;
  const v = state.byEvn.get(evn), k = state.known.get(evn), kind = kindOfLive(v);
  const running = kind === 'freight' || kind === 'pass';
  const title = kind === 'freight' ? 'Train ' + (v.trainNumber || '') : kind === 'pass' ? 'Passenger train ' + (v.trainNumber || '')
    : v ? 'Loco without train' : 'Loco offline';
  const rel = running ? (v.relation || '–') : lastFreightText(evn);
  const type = v?.vehicleModel || k?.loktyp || '';
  const delay = delayText(v);
  const html = `
    <h3>${esc(title)}</h3>
    <div class="rel desk-only">${esc(rel)}</div>
    <div class="mini phone-only">${esc([rel === '–' ? '' : rel, type, delay, motionText(v)].filter(Boolean).join(' · '))}</div>
    <dl class="desk-only">
      <dt>Loco</dt><dd>${esc(fmtEvn(evn))}</dd>
      <dt>Type</dt><dd>${esc(type || '–')}</dd>
      <dt>Kind</dt><dd>${esc(kindOf(evn) || '–')}</dd>
      <dt>Registered</dt><dd>${esc(countryOf(evn) || '–')}</dd>
      <dt>Delay</dt><dd>${esc(delay || '–')}</dd>
      <dt>Status</dt><dd>${motionText(v)}</dd>
      ${k?.beschreibung || k?.notiz ? `<dt>Note</dt><dd>${esc([k.beschreibung, k.notiz].filter(Boolean).join(' · '))}</dd>` : ''}
    </dl>
    <div class="actions">
      <a class="btn" href="${vehicleUrl(evn)}" target="_blank" rel="noopener" title="Vehicle page on realtimenext.hu (new tab)" aria-label="Vehicle info">${ICONS.info}<span>Vehicle info ↗</span></a>
      <a class="btn" href="${photosUrl(evn)}" target="_blank" rel="noopener" title="Photos of “${esc(shortNo(evn))}” on bahnbilder.de (new tab)" aria-label="Photos">${ICONS.photos}<span>Photos ↗</span></a>
    </div>
    ${legendHtml()}`;
  // only rebuild when something changed (a click during the 10 s update would get lost otherwise)
  if (html !== panelHtml) { $('panelBody').innerHTML = html; panelHtml = html; }
}

// Address while a loco is selected: ?loco=…[&date=…][&days=…] (keeps the {sel} history entry)
function setUrl(evn, day, range) {
  const search = evn ? locoUrl(evn, day, range) : '';
  if (location.search !== search) history.replaceState(history.state, '', search || location.pathname);
}

// o: { day, range, fit } – fit zooms to the route (from the table or a link)
export function select(evn, o = {}) {
  // one history entry per selection (also when tapping several trains in a row): back closes it
  if (!history.state?.sel) history.pushState({ sel: true }, '', location.href);
  state.selected = evn;
  panelHtml = null;
  $('panel').hidden = false;
  renderPanel();
  drawVehicles();
  openTimeline(evn, { ...o, icon: state.imgByEvn.get(evn) });
}

// fromPopstate: the browser already went back; otherwise go back ourselves and let popstate close it
export function unselect(fromPopstate = false) {
  if (!state.selected) return;
  if (!fromPopstate && history.state?.sel) { history.back(); return; }
  state.selected = null;
  panelHtml = null;
  $('panel').hidden = true;
  closeTimeline();
  showOtherVehicles(true);
  setUrl(null);
  drawVehicles();
}

export function initSelection() {
  $('panelClose').addEventListener('click', () => unselect());
  window.addEventListener('popstate', () => { if (state.selected && !history.state?.sel) unselect(true); });
  on('pick', evn => select(evn));
  on('close-request', () => unselect());
  on('tl-live', live => showOtherVehicles(live));
  on('tl-url', setUrl);
  on('live', () => { if (state.selected) { renderPanel(); liveUpdate(); } });
}
