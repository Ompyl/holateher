// holateher – window "Known freight locos": loks.csv + freight locos this browser saw in 48 h, sorting, filter, Excel.
import { LS } from './config.js?v=20261124h';
import { $, esc, lsGet, lsSet, ymd, loadScript, on } from './util.js?v=20261124h';
import { fmtEvn, kindOf, countryOf, shortNo, locoUrl, vehicleUrl, photosUrl } from './evn.js?v=20261124h';
import { state } from './state.js?v=20261124h';
import { map } from './map.js?v=20261124h';
import { setIdle, setPass } from './menu.js?v=20261124h';
import { select, ICONS } from './selection.js?v=20261124h';

// extra: only with "All columns"; grow: takes the free width, long text cut with "…"
const COLS = [
  { key: 'status', label: 'Status', cell: r => `<td class="${r.cls}">${esc(r.status)}</td>` },
  { key: 'evnFmt', label: 'Number', cell: r => `<td class="num">${esc(r.evnFmt)}${r.isNew ? '<span class="tag">new</span>' : ''}</td>` },
  { key: 'beschreibung', label: 'Description', grow: true },
  { key: 'loktyp', label: 'Type' },
  { key: 'kind', label: 'Kind', extra: true },
  { key: 'country', label: 'Registered', extra: true },
  { key: 'zug', label: 'Last freight train', num: true },
  { key: 'strecke', label: 'Route', extra: true, grow: true },
  { key: 'zuletzt', label: 'Last seen', num: true }
];
const sort = { key: 'status', desc: false };
let allCols = lsGet(LS.allCols, false);
export const tableOpen = () => document.body.classList.contains('table-open');

function cell(c, r) {
  if (c.cell) return c.cell(r);
  const v = esc(r[c.key]);
  return c.grow ? `<td class="grow" title="${v}">${v}</td>` : `<td${c.num ? ' class="num"' : ''}>${v}</td>`;
}

function rows() {
  const out = [];
  for (const evn of new Set([...state.known.keys(), ...Object.keys(state.seen)])) {
    const k = state.known.get(evn) || {}, s = state.seen[evn], v = state.byEvn.get(evn);
    let status, rank, cls;
    if (v?.trainType === 'T') { status = 'Freight ' + (v.trainNumber || ''); rank = 0; cls = 'st-freight'; }
    else if (v?.trainType) { status = (v.trainType === 'S' ? 'Passenger ' : 'Train ') + (v.trainNumber || ''); rank = 1; cls = 'st-other'; }
    else if (v) { status = 'no train'; rank = 2; cls = 'st-idle'; }
    else { status = 'offline'; rank = 3; cls = 'st-off'; }
    const seen = s ? new Date(s.t) : null;
    out.push({
      evn, evnFmt: fmtEvn(evn), status, rank, cls, isNew: !state.known.has(evn), online: !!v,
      beschreibung: k.beschreibung || '',
      loktyp: k.loktyp || v?.vehicleModel || s?.model || '',
      kind: kindOf(evn), country: countryOf(evn),
      zug: s?.zug || k.letzter_gueterzug || '',
      strecke: s ? s.rel || '' : k.letzte_strecke || '',
      zuletzt: seen ? ymd(seen).replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3') + ' ' + seen.toTimeString().slice(0, 5) : k.zuletzt_gueterzug || ''
    });
  }
  const f = $('tableFilter').value.trim().toLowerCase();
  const list = f ? out.filter(r => [r.evn, r.evnFmt, r.beschreibung, r.loktyp, r.country, r.zug, r.strecke, r.status].join(' ').toLowerCase().includes(f)) : out;
  const key = sort.key === 'status' ? 'rank' : sort.key;
  return list.sort((a, b) => {
    const x = a[key], y = b[key];
    const c = typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true });
    return (sort.desc ? -c : c) || a.evn.localeCompare(b.evn);
  });
}

function render() {
  const cols = COLS.filter(c => allCols || !c.extra);
  const t = $('lokTable');
  t.tHead.innerHTML = '<tr>' + cols.map(c => `<th data-key="${c.key}" class="${sort.key === c.key ? 'sorted' + (sort.desc ? ' desc' : '') : ''}">${c.label}</th>`).join('') + '<th class="acts"></th></tr>';
  t.tBodies[0].innerHTML = rows().map(r => `
    <tr>${cols.map(c => cell(c, r)).join('')}
      <td class="acts">
        <a class="rowbtn" href="${locoUrl(r.evn)}" data-hist="${r.evn}" title="History" aria-label="History">${ICONS.history}</a>
        <a class="rowbtn" href="${vehicleUrl(r.evn)}" target="_blank" rel="noopener" title="Vehicle page on realtimenext.hu (new tab)" aria-label="Vehicle info">${ICONS.info}</a>
        <a class="rowbtn" href="${photosUrl(r.evn)}" target="_blank" rel="noopener" title="Photos of “${esc(shortNo(r.evn))}” on bahnbilder.de (new tab)" aria-label="Photos">${ICONS.photos}</a>
        ${r.online ? `<button type="button" class="rowbtn" data-show="${r.evn}" title="Show on map" aria-label="Show on map">${ICONS.map}</button>` : '<span class="rowbtn ghost"></span>'}
      </td>
    </tr>`).join('');
}

export function showTable(on) {
  document.body.classList.toggle('table-open', on);
  $('tableView').hidden = $('tableBackdrop').hidden = !on;
  if (on) render();
}

function showOnMap(evn) {
  const v = state.byEvn.get(evn);
  if (!v) return;
  showTable(false);
  if (v.trainType && v.trainType !== 'T' && !state.showPass) setPass(true);
  else if (!v.trainType && !state.showIdle) setIdle(true);
  map.flyTo({ center: [v.location_lon, v.location_lat], zoom: Math.max(map.getZoom(), 11) });
  select(evn);
}

// SheetJS is loaded on the first click only
async function exportExcel() {
  if (!window.XLSX) await loadScript('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js');
  const base = location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
  const data = rows().map(r => ({
    'Number (EVN)': r.evn, 'Number formatted': r.evnFmt, 'Description': r.beschreibung, 'Type': r.loktyp,
    'Kind': r.kind, 'Registered': r.country, 'Status now': r.status, 'Last freight train': r.zug, 'Route': r.strecke,
    'Last seen': r.zuletzt, 'In loks.csv': r.isNew ? 'no' : 'yes', 'History': base + locoUrl(r.evn)
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [16, 18, 40, 22, 20, 22, 18, 16, 40, 17, 10, 60].map(w => ({ wch: w }));
  data.forEach((r, i) => { const c = ws[XLSX.utils.encode_cell({ r: i + 1, c: 11 })]; if (c) c.l = { Target: r.History }; });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Freight locos');
  XLSX.writeFile(wb, 'holateher-freight-locos-' + ymd(new Date()) + '.xlsx');
}

export function initTable() {
  on('table', showTable);
  on('live', () => { if (tableOpen()) render(); });
  $('tableClose').addEventListener('click', () => showTable(false));
  $('tableBackdrop').addEventListener('click', () => showTable(false));
  $('tableFilter').addEventListener('input', render);
  $('allCols').checked = allCols;
  $('allCols').addEventListener('change', e => { allCols = e.target.checked; lsSet(LS.allCols, allCols); render(); });
  $('btnExport').addEventListener('click', () => exportExcel().catch(e => { console.error(e); alert('Excel export failed.'); }));
  $('lokTable').addEventListener('click', e => {
    const th = e.target.closest('th[data-key]');
    if (th) {
      sort.desc = sort.key === th.dataset.key ? !sort.desc : false;
      sort.key = th.dataset.key;
      render();
      return;
    }
    const show = e.target.closest('button[data-show]');
    if (show) { showOnMap(show.dataset.show); return; }
    // History: open the loco with its timeline (middle click / modifier = new tab via the link)
    const a = e.target.closest('a[data-hist]');
    if (a && e.button === 0 && !e.ctrlKey && !e.shiftKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      showTable(false);
      select(a.dataset.hist, { fit: true });
    }
  });
}
