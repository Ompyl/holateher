// holateher – constants (API addresses, timings, colours, storage keys). See PLAN.md.

export const API = 'https://api.realtimenext.hu/api/';
export const URLS = {
  live: API + 'bkv/vehicles/online/map',            // ~1 MB, uncompressed – poll sparingly
  icons: API + 'admin/icons/bkv',
  vehicle: evn => API + 'bkv/vehicles/' + encodeURIComponent(evn),
  historyDays: evn => API + 'bkv/vehicles/' + encodeURIComponent(evn) + '/history-days',
  day: (evn, day) => API + 'bkv/vehicles/' + encodeURIComponent(evn) + '/' + day,
  asset: path => API + String(path).replace(/^\/+/, '')
};

// Traffic to realtimenext (small hobby site: be gentle)
export const POLL_MS = 10_000;                 // live list, same as map.realtimenext.hu, only while the tab is visible
export const INACTIVE_MS = 10 * 60_000;        // no mouse / touch / key for this long: pause polling until the next interaction
export const TODAY_REFRESH_MS = 60_000;        // reload today's positions of the selected loco
export const ICONS_CACHE_MS = 24 * 3600_000;   // icon list kept in localStorage
export const PAST_DAYS_CACHE = 80;             // past days (per loco) kept in memory, across locos

export const SEEN_KEEP_MS = 48 * 3600_000;     // freight locos seen by this browser count as "known" for 48 h
export const HU_VIEW = { center: [19.3, 47.2], zoom: 6.6 };
export const PHONE_MQ = '(max-width: 700px)';

export const LS = {
  view: 'holateher.view',
  showIdle: 'holateher.showIdle',
  showPass: 'holateher.showPassenger',
  seen: 'holateher.seenFreight',
  modelIcons: 'holateher.modelIcons',
  allCols: 'holateher.allCols',
  playSpeed: 'holateher.playSpeed',
  icons: 'holateher.icons',
  railMode: 'holateher.railMode'
};

// Base map: OSM raster tiles, darkened like OpenRailwayMap's dark theme (saturation 50 %, opacity 50 % over the page colour)
export const BASE_STYLE = {
  version: 8,
  glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',   // same as the railway style
  sources: {
    osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19 }
  },
  layers: [
    { id: 'base-bg', type: 'background', paint: { 'background-color': '#1b262b' } },
    { id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-saturation': -0.5, 'raster-opacity': 0.5 } }
  ]
};
export const FONT = ['Noto Sans Regular'];

// Route colours by speed (neon, smooth)
export const SPEED_STOPS = [[0, '#c04bff'], [15, '#ff2e63'], [40, '#ff8c1a'], [70, '#ffe81a'], [100, '#7cff4f'], [120, '#00f5a0']];
export const SPEED_CAP = 120;                  // from 120 km/h mostly a GPS jump: same colour, not counted as max
export const STOP_COLOR = '#b23cff';
export const STOP_CORE_COLOR = '#2e0a4d';
export const ACCENT = '#1f8a8a';

// Track calculation
export const TRACK = {
  minStepM: 20,           // smaller moves = GPS jitter
  gapS: 600,              // longer without data: dashed grey
  smooth: 2,              // speed averaged over ±2 neighbouring pieces
  stopRadiusM: 60,
  stopMinS: 120,
  stopMergeM: 400,        // consecutive stops this close …
  stopMergeGapS: 20 * 60, // … and this close in time are one stop
  trainBridgeS: 8 * 3600, // train list / "this train": breaks up to 8 h are bridged
  multiDayMinStop: 10     // minutes: shortest stop shown for 3 / 7 / 14 days
};
