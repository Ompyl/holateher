// Downloads the OpenRailwayMap vector style and writes a cleaned copy to data/ormstyle.json.
// openrailwaymap.app/style.json has no CORS header, so the page cannot load it directly; the tiles,
// TileJSON and sprites are CORS-enabled and stay live. Re-run now and then:  node tools/fetch-orm-style.mjs
// Usage policy: https://github.com/hiddewie/OpenRailwayMap-vector/blob/master/USAGE.md
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ORM = 'https://openrailwaymap.app';
const OUT = fileURLToPath(new URL('../data/ormstyle.json', import.meta.url));
const UA = 'holateher/1.0 (+https://github.com/Ompyl/holateher)';
// hillshade, ORM's own base map, routing and search are not needed
const DROP_SOURCES = new Set(['dem', 'openhistoricalmap', 'route', 'route_stops', 'search']);
const GLYPHS = 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf';

const abs = u => typeof u === 'string' && u.startsWith('/') ? ORM + u : u;

// ORM uses MapLibre 6 "font-faces" (font files); MapLibre 5 needs glyph PBFs, so map the font stacks
// (text-font can be an expression with literal arrays: walk it)
function swapFonts(v) {
  if (!Array.isArray(v)) return v;
  if (v.length && typeof v[0] === 'string' && /^(Noto-Sans|Fira-Code)/.test(v[0]))
    return [/Italic/.test(v[0]) ? 'Noto Sans Italic' : /Bold|Fira/.test(v[0]) ? 'Noto Sans Medium' : 'Noto Sans Regular'];
  return v.map(swapFonts);
}

const res = await fetch(ORM + '/style.json', { headers: { 'User-Agent': UA } });
if (!res.ok) throw new Error('HTTP ' + res.status);
const st = await res.json();

const sources = {};
for (const [k, src] of Object.entries(st.sources)) {
  if (DROP_SOURCES.has(k)) continue;
  // without encoding "mlt": MapLibre 5 does not send the MLT Accept header, so the server answers with MVT
  const { encoding, ...rest } = src;
  const s = { ...rest };
  if (src.url) s.url = abs(src.url);
  if (src.tiles) s.tiles = src.tiles.map(abs);
  sources[k] = s;
}
const layers = st.layers.filter(l => l.source && sources[l.source]).map(l => {
  if (l.layout?.['text-font']) l.layout['text-font'] = swapFonts(l.layout['text-font']);
  return l;
});
const state = { ...st.state, theme: { default: 'dark' }, openHistoricalMap: { default: false }, hillshade: { default: false } };
const sprite = Array.isArray(st.sprite) ? st.sprite.map(x => ({ ...x, url: abs(x.url) })) : abs(st.sprite);

const out = { fetched: new Date().toISOString().slice(0, 10), glyphs: GLYPHS, sprite, state, sources, layers };
writeFileSync(OUT, JSON.stringify(out));
console.log(`data/ormstyle.json: ${layers.length} layers, ${Object.keys(sources).length} sources, ${(JSON.stringify(out).length / 1024).toFixed(0)} kB`);
