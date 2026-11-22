// holateher – vehicle numbers (EVN), external links, train number rules.

const COUNTRY = {
  '80': 'Germany', '81': 'Austria', '55': 'Hungary', '54': 'Czechia', '56': 'Slovakia',
  '53': 'Romania', '51': 'Poland', '79': 'Slovenia', '78': 'Croatia', '72': 'Serbia',
  '52': 'Bulgaria', '85': 'Switzerland', '83': 'Italy', '84': 'Netherlands', '88': 'Belgium',
  '86': 'Denmark', '74': 'Sweden', '87': 'France', '43': 'Hungary/Austria (GySEV)'
};
const KIND = {
  '90': 'Other', '91': 'Electric loco', '92': 'Diesel loco', '93': 'Electric multiple unit',
  '94': 'Electric multiple unit', '95': 'Diesel multiple unit', '97': 'Diesel shunter', '98': 'Shunter'
};

export const isEvn = s => /^\d{12}$/.test(String(s || ''));
export const fmtEvn = n => isEvn(n) ? `${n.slice(0, 2)} ${n.slice(2, 4)} ${n.slice(4, 8)} ${n.slice(8, 11)}-${n[11]}` : String(n || '');
export const countryOf = n => isEvn(n) ? (COUNTRY[n.slice(2, 4)] || 'Code ' + n.slice(2, 4)) : '';
export const kindOf = n => isEvn(n) ? (KIND[n.slice(0, 2)] || '') : '';
// short number as painted on the loco, e.g. "193 837"
export const shortNo = n => isEvn(n) ? n.slice(5, 8) + ' ' + n.slice(8, 11) : String(n || '');

// Links (external ones open in a new tab)
export const locoUrl = (evn, day, days) => '?loco=' + encodeURIComponent(evn) + (day ? '&date=' + day : '') + (days > 1 ? '&days=' + days : '');
export const vehicleUrl = evn => 'https://realtimenext.hu/vehicles/' + encodeURIComponent(evn);
export const photosUrl = evn => 'https://www.bahnbilder.de/name/galerie/kategorie/suchen/suchbegriff/' + encodeURIComponent(shortNo(evn)).replace(/%20/g, '+') + '.html';
export function googleUrl(map) {
  const c = map.getCenter();
  return `https://www.google.com/maps/@${c.lat.toFixed(5)},${c.lng.toFixed(5)},${Math.round(map.getZoom() + 1)}z`;   // Google zoom ≈ MapLibre + 1
}
export function ormUrl(map) {
  const c = map.getCenter();
  return `https://openrailwaymap.app/#view=${Math.round(map.getZoom() * 10) / 10}/${c.lat.toFixed(5)}/${c.lng.toFixed(5)}`;
}
export const openTab = url => window.open(url, '_blank', 'noopener');

// History data has no train type: 5-digit number from 30000 without a passenger headsign = probably freight
export const looksFreight = (rid, headsign) => /^\d{5}$/.test(rid) && +rid >= 30000 &&
  !/intercity|személy|railjet|eurocity|euronight|gyors|sebes|expressz|nightjet|regional/i.test(headsign || '');
// "42408 -> Hegyeshalom -> Ferencváros" -> "Hegyeshalom → Ferencváros"
export const cleanRoute = h => String(h || '').replace(/^\s*\d+\s*(->)?\s*/, '').replace(/\s*->\s*/g, ' → ').trim();
