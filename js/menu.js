// holateher – header bar (desktop) = fold-out menu (phone): counts, clock, layer switches, links.
import { LS } from './config.js?v=20261124h';
import { $, lsSet, on, emit, clockText } from './util.js?v=20261124h';
import { googleUrl, ormUrl, openTab } from './evn.js?v=20261124h';
import { state } from './state.js?v=20261124h';
import { map, drawVehicles } from './map.js?v=20261124h';

const bar = () => $('bar');
export const menuOpen = () => document.body.classList.contains('menu-open');
export function showMenu(on) {
  document.body.classList.toggle('menu-open', on);
  $('menuBtn').setAttribute('aria-expanded', String(on));
}

export function setIdle(v) { state.showIdle = v; lsSet(LS.showIdle, v); $('showIdle').checked = v; drawVehicles(); }
export function setPass(v) { state.showPass = v; lsSet(LS.showPass, v); $('showPass').checked = v; drawVehicles(); }

function countsText(c) {
  return c.freight + ' live freight' + (c.freight === 1 ? '' : 's') +
    (state.showIdle ? ' · ' + c.idle + ' idle' : '') + (state.showPass ? ' · ' + c.pass + ' passenger' : '');
}

function tickClock() {
  $('clock').textContent = clockText();
  setTimeout(tickClock, 1000 - (Date.now() % 1000) + 5);   // on the full second
}

// 7 quick clicks on the clock (< 1.5 s apart) open a page – nothing hints at it
function easterEgg() {
  let n = 0, last = 0;
  $('clock').addEventListener('click', () => {
    const now = Date.now();
    n = now - last < 1500 ? n + 1 : 1;
    last = now;
    if (n >= 7) { n = 0; openTab('https://server.properties/'); }
  });
}

export function initMenu() {
  $('showIdle').checked = state.showIdle;
  $('showPass').checked = state.showPass;
  $('showIdle').addEventListener('change', e => setIdle(e.target.checked));
  $('showPass').addEventListener('change', e => setPass(e.target.checked));
  $('btnTable').addEventListener('click', () => { showMenu(false); emit('table', true); });
  $('btnGoogle').addEventListener('click', () => { showMenu(false); openTab(googleUrl(map)); });
  $('btnOrm').addEventListener('click', () => { showMenu(false); openTab(ormUrl(map)); });
  $('menuBtn').addEventListener('click', e => { e.stopPropagation(); showMenu(!menuOpen()); });
  bar().addEventListener('click', e => e.stopPropagation());
  document.addEventListener('click', () => { if (menuOpen()) showMenu(false); });
  map.on('movestart', () => { if (menuOpen()) showMenu(false); });
  on('counts', c => { $('counts').textContent = countsText(c); });
  tickClock();
  easterEgg();
}
