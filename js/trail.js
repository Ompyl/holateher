// holateher – map layers of the timeline: route by speed, gaps, stops (clustered), and the loco marker.
import { SPEED_STOPS, STOP_COLOR, STOP_CORE_COLOR, ACCENT, FONT, LS, URLS } from './config.js?v=20261122g';
import { lsGet } from './util.js?v=20261122g';
import { EMPTY } from './track.js?v=20261122g';
import { fetchVehicle } from './api.js?v=20261122g';
import { map, fallbackIcon } from './map.js?v=20261122g';

const MARKER_IMG = 'tl-loco';
const OFFSET = 2;               // right of the travel direction: out and back side by side
const zoomWidth = (w6, w14) => ['interpolate', ['linear'], ['zoom'], 6, w6, 14, w14];

function arrowIcon() {
  const c = document.createElement('canvas'); c.width = c.height = 20;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(7, 5); g.lineTo(13, 10); g.lineTo(7, 15); g.stroke();
  return g.getImageData(0, 0, 20, 20);
}

// Added below the vehicle symbols (beforeId)
export function addTrailLayers(beforeId) {
  map.addImage('arrow', arrowIcon(), { pixelRatio: 2 });
  map.addImage(MARKER_IMG, fallbackIcon());
  map.addSource('trail-day', { type: 'geojson', data: EMPTY });
  map.addSource('trail-speed', { type: 'geojson', data: EMPTY });
  // stops close together on screen are merged (durations added); from zoom 15 always single stops
  map.addSource('trail-stops', { type: 'geojson', data: EMPTY, cluster: true, clusterRadius: 26, clusterMaxZoom: 14,
    clusterProperties: { min: ['+', ['get', 'min']] } });
  const lineLayout = { 'line-join': 'round', 'line-cap': 'round' };
  const solid = ['!', ['get', 'gap']];
  const add = l => map.addLayer(l, beforeId);

  add({ id: 'trail-day', type: 'line', source: 'trail-day', layout: lineLayout,
    paint: { 'line-color': '#7d8f96', 'line-width': zoomWidth(1.5, 3), 'line-opacity': 0.45, 'line-dasharray': [1, 2] } });
  add({ id: 'trail-gap', type: 'line', source: 'trail-speed', filter: ['get', 'gap'],
    paint: { 'line-color': '#8a9aa0', 'line-width': 2, 'line-dasharray': [1.5, 2], 'line-offset': OFFSET } });
  add({ id: 'trail-casing', type: 'line', source: 'trail-speed', layout: lineLayout, filter: solid,
    paint: { 'line-color': '#0d1418', 'line-width': zoomWidth(5.5, 9.5), 'line-offset': OFFSET } });
  add({ id: 'trail-line', type: 'line', source: 'trail-speed', layout: lineLayout, filter: solid,
    paint: { 'line-color': ['interpolate', ['linear'], ['get', 'kmh'], ...SPEED_STOPS.flat()], 'line-width': zoomWidth(3.5, 7), 'line-offset': OFFSET } });
  add({ id: 'trail-arrows', type: 'symbol', source: 'trail-speed', minzoom: 8, filter: ['all', solid, ['>', ['get', 'kmh'], 5]],
    layout: { 'symbol-placement': 'line', 'symbol-spacing': 70, 'icon-image': 'arrow',
      'icon-size': zoomWidth(0.6, 1), 'icon-allow-overlap': true, 'icon-rotation-alignment': 'map' } });

  // stop: purple disc (size = duration), dark centre fading out into the purple; no outline; hidden below zoom 8
  const radius = ['interpolate', ['linear'], ['get', 'min'], 2, 6, 30, 10, 180, 16, 720, 20];
  add({ id: 'trail-stops', type: 'circle', source: 'trail-stops', minzoom: 8,
    paint: { 'circle-color': STOP_COLOR, 'circle-opacity': 0.6, 'circle-radius': radius } });
  add({ id: 'trail-stop-core', type: 'circle', source: 'trail-stops', minzoom: 8,
    paint: { 'circle-color': STOP_CORE_COLOR, 'circle-opacity': 0.9, 'circle-radius': radius, 'circle-blur': 1 } });
  // "12 min" / "1 h 05"; clusters: "45 min · 2 stops" / "≈ 4 h · 3 stops"; from zoom 13 with times
  const dur = ['let', 'm', ['round', ['get', 'min']],
    ['case', ['<', ['var', 'm'], 60], ['concat', ['to-string', ['var', 'm']], ' min'],
      ['let', 'r', ['%', ['var', 'm'], 60],
        ['concat', ['to-string', ['floor', ['/', ['var', 'm'], 60]]], ' h ',
          ['case', ['<', ['var', 'r'], 10], ['concat', '0', ['to-string', ['var', 'r']]], ['to-string', ['var', 'r']]]]]]];
  const clusterText = ['concat',
    ['case', ['<', ['get', 'min'], 60], dur, ['concat', '≈ ', ['to-string', ['round', ['/', ['get', 'min'], 60]]], ' h']],
    ' · ', ['to-string', ['get', 'point_count']], ' stops'];
  add({ id: 'trail-stop-label', type: 'symbol', source: 'trail-stops', minzoom: 10,
    layout: {
      'text-field': ['step', ['zoom'],                           // zoom step must be the outermost expression
        ['case', ['has', 'point_count'], clusterText, ['get', 'short']], 13,
        ['case', ['has', 'point_count'], clusterText, ['get', 'long']]],
      'text-font': FONT, 'text-size': 11, 'text-offset': [0, 1.2], 'text-anchor': 'top',
      'symbol-sort-key': ['-', 0, ['get', 'min']]               // overlapping labels: the longer stop wins
    },
    paint: { 'text-color': '#f6ecff', 'text-halo-color': 'rgba(13,20,24,0.9)', 'text-halo-width': 1.6 } });

  // loco marker at the slider position (on top of everything)
  map.addSource('cursor', { type: 'geojson', data: EMPTY });
  map.addLayer({ id: 'cursor-halo', type: 'circle', source: 'cursor',
    paint: { 'circle-radius': 18, 'circle-color': 'rgba(31,138,138,0.22)', 'circle-stroke-color': ACCENT, 'circle-stroke-width': 2 } });
  map.addLayer({ id: 'cursor', type: 'symbol', source: 'cursor',
    layout: { 'icon-image': MARKER_IMG, 'icon-size': zoomWidth(0.18, 0.32), 'icon-allow-overlap': true } });
  setTrailCursor(Infinity);
}

export function setTrail(dayLine, speed, stops) {
  map.getSource('trail-day')?.setData(dayLine || EMPTY);
  map.getSource('trail-speed')?.setData(speed || EMPTY);
  map.getSource('trail-stops')?.setData(stops || EMPTY);
}

// Everything after point index `cur` is drawn faint
export function setTrailCursor(cur) {
  const op = (a, b) => ['case', ['<', ['get', 'pi'], cur === Infinity ? 1e9 : cur], a, b];
  map.setPaintProperty('trail-line', 'line-opacity', op(1, 0.3));
  map.setPaintProperty('trail-casing', 'line-opacity', op(0.55, 0.12));
  map.setPaintProperty('trail-gap', 'line-opacity', op(0.7, 0.3));
  map.setPaintProperty('trail-arrows', 'icon-opacity', op(0.85, 0));
}

export function setMarker(coord) {
  map.getSource('cursor')?.setData(coord ? { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: coord } } : EMPTY);
}

// Marker image: the loco's live symbol, else its realtimenext icon / the icon of its model, else the fallback
export async function setMarkerImage(evn, liveIcon, isCurrent) {
  if (liveIcon && map.hasImage(liveIcon)) { map.setLayoutProperty('cursor', 'icon-image', liveIcon); return; }
  const replace = data => { if (map.hasImage(MARKER_IMG)) map.removeImage(MARKER_IMG); map.addImage(MARKER_IMG, data); };
  replace(fallbackIcon());
  map.setLayoutProperty('cursor', 'icon-image', MARKER_IMG);
  try {
    const v = await fetchVehicle(evn);
    const model = v?.vehicleModel || (v?.type?.name !== 'Ismeretlen' ? v?.type?.name : '') || '';
    let url = v?.icon?.url;
    if (!url || /null\.webp$/.test(url)) url = lsGet(LS.modelIcons, {})?.[model] || null;
    if (!url || /null\.webp$/.test(url) || !isCurrent()) return;
    const img = await map.loadImage(URLS.asset(url));
    if (isCurrent()) replace(img.data);
  } catch { /* keep the fallback */ }
}
