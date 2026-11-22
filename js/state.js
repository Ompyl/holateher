// holateher – shared app state (filled by live.js / main.js, read by the other modules).
import { LS } from './config.js?v=20261122f';
import { lsGet } from './util.js?v=20261122f';

export const state = {
  live: [],                    // last live list (all vehicles)
  byEvn: new Map(),            // EVN -> live entry (rail vehicles only)
  known: new Map(),            // EVN -> row of data/loks.csv
  customImg: new Map(),        // bildkategorie -> image URL (data/bildkategorien.csv)
  iconUrl: new Map(),          // realtimenext category id -> image path
  seen: lsGet(LS.seen, {}),    // EVN -> { t, zug, rel, model }: seen as freight train by this browser (48 h)
  showIdle: lsGet(LS.showIdle, true),
  showPass: lsGet(LS.showPass, false),
  selected: null,              // EVN of the selected loco
  imgByEvn: new Map(),         // EVN -> image id of its live symbol (reused for the timeline marker)
  counts: { freight: 0, idle: 0, pass: 0 }
};

// Kind of a live entry: 'freight' | 'pass' | 'idle' (known freight loco without train) | null
export function kindOfLive(v) {
  if (!v) return null;
  if (v.trainType === 'T') return 'freight';
  if (v.trainType) return 'pass';
  return state.known.has(v.rail_uic) || state.seen[v.rail_uic] ? 'idle' : null;
}

export function lastFreightText(evn) {
  const s = state.seen[evn], k = state.known.get(evn);
  if (s) return ('last freight train ' + s.zug + ' ' + s.rel).trim();
  if (k?.letzter_gueterzug) return ('last freight train ' + k.letzter_gueterzug + ' ' + (k.letzte_strecke || '')).trim();
  return '';
}

export const delayText = v => v?.trainType && v.delayMin != null ? (v.delayMin > 0 ? '+' : '') + v.delayMin + ' min' : '';
export const motionText = v => v ? (v.moving ? 'moving' : 'stopped') : 'no live data';
