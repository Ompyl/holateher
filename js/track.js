// holateher – pure route calculations (no map, no DOM): speed pieces, stops, train list, figures.
import { TRACK, SPEED_CAP } from './config.js?v=20261124h';
import { distM, durText, hhmm } from './util.js?v=20261124h';
import { looksFreight, cleanRoute } from './evn.js?v=20261124h';

export const EMPTY = { type: 'FeatureCollection', features: [] };
const fc = features => ({ type: 'FeatureCollection', features });

// Route as short pieces, each with its own smoothed speed. pi / pj = index of start / end point.
// Single pieces instead of long lines keep the sideways offset (out and back side by side) clean.
export function buildSpeedGeo(coords, times) {
  const kept = [0];
  for (let i = 1; i < coords.length; i++) if (distM(coords[kept[kept.length - 1]], coords[i]) >= TRACK.minStepM) kept.push(i);
  const steps = [];
  for (let k = 0; k < kept.length - 1; k++) {
    const i = kept[k], j = kept[k + 1];
    const dt = times[j] - times[j - 1];        // only the last step counts: before that the loco stood near coords[i]
    steps.push({ i, j, d: distM(coords[i], coords[j]), dt, gap: dt > TRACK.gapS });
  }
  return fc(steps.map((s, k) => {
    let d = 0, dt = 0;
    for (let n = Math.max(0, k - TRACK.smooth); n <= Math.min(steps.length - 1, k + TRACK.smooth); n++) {
      if (steps[n].gap || steps[n].dt <= 0) continue;
      d += steps[n].d; dt += steps[n].dt;
    }
    const kmh = dt > 0 ? d / dt * 3.6 : SPEED_CAP;
    return {
      type: 'Feature',
      properties: { kmh: Math.min(SPEED_CAP, Math.round(kmh)), gap: s.gap, pi: s.i, pj: s.j },
      geometry: { type: 'LineString', coordinates: [coords[s.i], coords[s.j]] }
    };
  }));
}

function stopFeature(coords, times, i0, i1, center) {
  const dur = times[i1] - times[i0];
  return {
    type: 'Feature',
    properties: { min: dur / 60, short: durText(dur), long: hhmm(times[i0]) + '–' + hhmm(times[i1]) + ' (' + durText(dur) + ')', i0, i1 },
    geometry: { type: 'Point', coordinates: center }
  };
}

// Stops: loco ≥ 2 min within 60 m; consecutive stops < 400 m apart with ≤ 20 min between are merged
export function buildStopGeo(coords, times) {
  const out = [];
  let i = 0;
  while (i < coords.length) {
    let j = i;
    while (j + 1 < coords.length && distM(coords[i], coords[j + 1]) < TRACK.stopRadiusM) j++;
    if (times[j] - times[i] >= TRACK.stopMinS) {
      let lon = 0, lat = 0;
      for (let k = i; k <= j; k++) { lon += coords[k][0]; lat += coords[k][1]; }
      const f = stopFeature(coords, times, i, j, [lon / (j - i + 1), lat / (j - i + 1)]);
      const p = out[out.length - 1];
      if (p && distM(p.geometry.coordinates, f.geometry.coordinates) < TRACK.stopMergeM &&
          times[i] - times[p.properties.i1] <= TRACK.stopMergeGapS) {
        const w = p.properties.min / (p.properties.min + f.properties.min);   // weighted by duration
        const c = p.geometry.coordinates.map((x, k) => x * w + f.geometry.coordinates[k] * (1 - w));
        out[out.length - 1] = stopFeature(coords, times, p.properties.i0, j, c);
      } else out.push(f);
      i = j + 1;
    } else i++;
  }
  return fc(out);
}

// Train list: consecutive points with the same route_id (breaks up to 8 h are bridged)
export function buildTrains(pts) {
  const out = [];
  let cur = null;
  pts.forEach((p, i) => {
    const rid = String(p.route_id || '').trim();
    if (!rid) return;
    if (cur && cur.rid === rid && p.time - pts[cur.i1].time < TRACK.trainBridgeS) {
      cur.i1 = i;
      if (!cur.route) cur.route = cleanRoute(p.headsign);
      return;
    }
    cur = { rid, route: cleanRoute(p.headsign), i0: i, i1: i, freight: looksFreight(rid, p.headsign) };
    out.push(cur);
  });
  return out;
}

// "This train": index of the first point of the current train number, walking back from the end
// (same number; points without a number and breaks < 8 h are bridged; another number stops). -1 = not found.
export function trainStart(pts, number) {
  let s = -1;
  if (!number) return s;
  for (let i = pts.length - 1; i >= 0; i--) {
    const rid = String(pts[i].route_id || '').trim();
    if (rid === number) { if (s === -1 || pts[s].time - pts[i].time < TRACK.trainBridgeS) s = i; else break; }
    else if (rid && s !== -1) break;
  }
  return s;
}

// Speed per point (the last point gets the speed of the last piece instead of 0)
export function speedPerPoint(speed, n) {
  const out = new Array(n).fill(0);
  for (const f of speed.features) for (let i = f.properties.pi; i < f.properties.pj; i++) out[i] = f.properties.kmh;
  const last = speed.features[speed.features.length - 1];
  if (last && last.properties.pj === n - 1 && !last.properties.gap) out[n - 1] = last.properties.kmh;
  return out;
}

export function figures(speed, stops, trains) {
  let km = 0, vmax = 0;
  for (const f of speed.features) {
    if (f.properties.gap) continue;
    km += distM(...f.geometry.coordinates) / 1000;
    if (f.properties.kmh < SPEED_CAP) vmax = Math.max(vmax, f.properties.kmh);
  }
  return { km, vmax, stops: stops.features.length, trains: trains.length, freight: trains.filter(t => t.freight).length };
}
