// Sets one new version (?v=…) on every own file reference, so a browser never mixes old and new files.
// Usage: node tools/bump-version.mjs [version]   (default: YYYYMMDD + letter, e.g. 20261122b)
// Run it before every push that changes index.html, style.css or js/*.js.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = ['index.html', ...readdirSync(join(root, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f)];
const RE = /\?v=([0-9a-z]+)/g;

const found = new Set();
for (const f of files) for (const m of readFileSync(join(root, f), 'utf8').matchAll(RE)) found.add(m[1]);

let version = process.argv[2];
if (!version) {
  const d = new Date(), day = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  const used = [...found].filter(v => v.startsWith(day)).map(v => v.slice(8)).sort();
  const last = used[used.length - 1];
  version = day + (last ? String.fromCharCode(last.charCodeAt(0) + 1) : 'a');
}

let changed = 0;
for (const f of files) {
  const p = join(root, f), before = readFileSync(p, 'utf8'), after = before.replace(RE, '?v=' + version);
  if (after !== before) { writeFileSync(p, after); changed++; }
}
console.log(`version ${version} (was: ${[...found].join(', ') || 'none'}), ${changed} files updated`);
