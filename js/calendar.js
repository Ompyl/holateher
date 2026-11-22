// holateher – calendar popover of the timeline (days with data are marked, opens upwards).
import { $, pad, MON, parseYmd, addDays, daysBetween, dayLong, today } from './util.js?v=20261122f';

// ctx: { day(): selected day, range(): days in the window, days: Set of days with data, navDays(): allowed days, pick(day) }
export function createCalendar(ctx) {
  const el = $('cal');
  let month = null;           // first day of the shown month

  function render() {
    const day = ctx.day();
    if (!day) return;
    if (!month) { const d = parseYmd(day); month = new Date(d.getFullYear(), d.getMonth(), 1); }
    const y = month.getFullYear(), m = month.getMonth();
    const offset = (new Date(y, m, 1).getDay() + 6) % 7;            // Monday first
    const nDays = new Date(y, m + 1, 0).getDate();
    const t = today(), has = ctx.days();
    const win = new Set(daysBetween(addDays(day, -(Math.max(1, ctx.range()) - 1)), day));
    const list = ctx.navDays();
    const idx = d => d.getFullYear() * 12 + d.getMonth();
    const canPrev = idx(month) > idx(parseYmd(list[0]));
    const canNext = idx(month) < idx(parseYmd(list[list.length - 1]));
    let cells = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(w => `<span class="wd">${w}</span>`).join('');
    cells += '<span></span>'.repeat(offset);
    let count = 0;
    for (let d = 1; d <= nDays; d++) {
      const key = y + pad(m + 1) + pad(d);
      const data = has.has(key);
      if (data) count++;
      const ok = data || key === t;
      const cls = [data ? 'has' : '', key === day ? 'sel' : win.has(key) ? 'inrange' : '', key === t ? 'today' : ''].join(' ');
      cells += `<button type="button" class="${cls}" data-day="${key}" ${ok ? '' : 'disabled'} title="${ok ? dayLong(key) : 'no data'}">${d}</button>`;
    }
    el.innerHTML = `
      <div class="cal-head">
        <button type="button" data-mon="-1" ${canPrev ? '' : 'disabled'} aria-label="Previous month">‹</button>
        <strong>${MON[m]} ${y}</strong>
        <button type="button" data-mon="1" ${canNext ? '' : 'disabled'} aria-label="Next month">›</button>
      </div>
      <div class="cal-grid">${cells}</div>
      <div class="cal-foot"><span>${count} day${count === 1 ? '' : 's'} with data</span><button type="button" data-now="1">now</button></div>`;
  }

  function toggle(on) {
    on = on ?? el.hidden;
    if (on) { month = null; render(); }
    el.hidden = !on;
  }

  el.addEventListener('click', e => {
    e.stopPropagation();
    const mon = e.target.closest('button[data-mon]');
    if (mon) { month = new Date(month.getFullYear(), month.getMonth() + +mon.dataset.mon, 1); render(); return; }
    const d = e.target.closest('button[data-day]');
    if (d && !d.disabled) { toggle(false); ctx.pick(d.dataset.day); return; }
    if (e.target.closest('button[data-now]')) { toggle(false); ctx.pick(today()); }
  });
  $('dayBtn').addEventListener('click', e => { e.stopPropagation(); toggle(); });
  document.addEventListener('click', () => { if (!el.hidden) toggle(false); });

  return { render: () => { if (!el.hidden) render(); }, toggle, isOpen: () => !el.hidden };
}
