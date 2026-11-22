// holateher – small helpers without map or app state.

export const $ = id => document.getElementById(id);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const pad = n => String(n).padStart(2, '0');

// ---- dates (local time) ----
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const ymd = d => d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
export const today = () => ymd(new Date());
export const parseYmd = s => /^\d{8}$/.test(s || '') ? new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) : null;
export const addDays = (d, n) => { const x = parseYmd(d); x.setDate(x.getDate() + n); return ymd(x); };
export const daysBetween = (a, b) => { const out = []; for (let d = a; d <= b; d = addDays(d, 1)) out.push(d); return out; };
export const dayName = d => { const x = parseYmd(d); return WD[x.getDay()] + ' ' + x.getDate() + ' ' + MON[x.getMonth()]; };
export const dayLong = d => { const x = parseYmd(d); return WD[x.getDay()] + ', ' + x.getDate() + ' ' + MON[x.getMonth()] + ' ' + x.getFullYear(); };
export const shortDate = t => dayName(ymd(new Date(t * 1000)));
export const hhmm = t => { const d = new Date(t * 1000); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
export const hhmmss = t => { const d = new Date(t * 1000); return hhmm(t) + ':' + pad(d.getSeconds()); };
export const durText = s => { const m = Math.round(s / 60); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + pad(m % 60); };
export const clockText = () => new Date().toLocaleTimeString('en-GB');

// ---- localStorage (JSON, never throws) ----
export const lsGet = (k, def) => { try { const v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch { return def; } };
export const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or blocked */ } };

// ---- misc ----
export function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}

// Distance in metres between [lon, lat] points
export function distM(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// CSV reader (quotes, commas and line breaks inside fields) -> array of objects by header
export function parseCSV(text) {
  const rows = []; let row = [], field = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const head = (rows.shift() || []).map(h => h.trim());
  return rows.filter(r => r.some(v => v.trim() !== ''))
    .map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

// Tiny event hub shared by the modules
const handlers = new Map();
export const on = (name, fn) => { if (!handlers.has(name)) handlers.set(name, []); handlers.get(name).push(fn); };
export const emit = (name, ...args) => { for (const fn of handlers.get(name) || []) fn(...args); };
