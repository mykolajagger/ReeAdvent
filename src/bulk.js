// Масове наповнення бази закладів із щоденних вигрузок OpenStreetMap по країнах (Geofabrik). Чисті функції, без мережі й файлів:
// ними користується tools/bulk-venues.mjs (GitHub Actions), а тести перевіряють їх без Geofabrik.
import { CATS, RADIUS, dist } from './venues.js';

/** Вирази для `osmium tags-filter`: об'єкти, що мають хоч один потрібний тег. Точний відбір за категоріями робить pickVenues. */
export function osmiumExpressions() {
  const m = {};
  for (const fs of Object.values(CATS)) for (const f of fs) for (const [k, v] of Object.entries(f)) {
    if (typeof v === 'string' && v.startsWith('!')) continue;               // умови «крім» (access) перевіряє Node
    const set = (m[k] ||= new Set()); for (const x of Array.isArray(v) ? v : [v]) set.add(x);
  }
  return Object.entries(m).map(([k, set]) => `nwr/${k}=${[...set].join(',')}`);
}

/** Країни, які Geofabrik віддає у спільних або по-іншому названих вигрузках (id вигрузки в каталозі). */
export const GEOFABRIK_ALIAS = { AE: 'gcc-states', SA: 'gcc-states', QA: 'gcc-states', KW: 'gcc-states', BH: 'gcc-states', OM: 'gcc-states', IL: 'israel-and-palestine', PS: 'israel-and-palestine',
  MY: 'malaysia-singapore-brunei', SG: 'malaysia-singapore-brunei', BN: 'malaysia-singapore-brunei', MK: 'macedonia', BA: 'bosnia-herzegovina', SN: 'senegal-and-gambia', GM: 'senegal-and-gambia',
  TW: 'taiwan', CZ: 'czech-republic', GB: 'united-kingdom', IE: 'ireland-and-northern-ireland', KR: 'south-korea', ZA: 'south-africa', NZ: 'new-zealand', DO: 'haiti-and-domrep', HT: 'haiti-and-domrep',
  TL: 'east-timor', MM: 'myanmar', LA: 'laos', KH: 'cambodia', RS: 'serbia', XK: 'kosovo', LK: 'sri-lanka', CD: 'congo-democratic-republic', CG: 'congo-brazzaville', CI: 'ivory-coast', SZ: 'swaziland' };
const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const codesOf = p => { const out = []; for (const [k, v] of Object.entries(p)) if (/alpha2|iso3166-1/i.test(k)) for (const x of [].concat(v)) if (typeof x === 'string') out.push(x.toUpperCase()); return out; };
/** Знаходить вигрузку країни в індексі Geofabrik (index-v1-nogeom.json): за кодом ISO (найвужча вигрузка перемагає), а якщо поля з кодами немає, за назвою країни. */
export function findPbf(index, cc, countryName = null) {
  const props = ((index && index.features) || []).map(f => f.properties).filter(p => p && p.urls && p.urls.pbf);
  const byCode = props.filter(p => codesOf(p).includes(cc)).sort((a, b) => codesOf(a).length - codesOf(b).length || String(a.id).length - String(b.id).length)[0];
  if (byCode) return { id: byCode.id, url: byCode.urls.pbf, shared: codesOf(byCode).length > 1 };
  const al = GEOFABRIK_ALIAS[cc], byAlias = al && props.find(p => String(p.id) === al || String(p.id).split('/').pop() === al);
  if (byAlias) return { id: byAlias.id, url: byAlias.urls.pbf, shared: true };
  if (countryName) {                                                         // запасний варіант: назва країни = назва вигрузки (Ukraine → ukraine)
    const want = slug(countryName), byName = props.find(p => slug(p.name) === want || String(p.id).split('/').pop() === want);
    if (byName) return { id: byName.id, url: byName.urls.pbf, shared: false };
  }
  return null;
}
/** Короткий опис індексу для журналу, якщо країну не знайдено. */
export function describeIndex(index) {
  const f = ((index && index.features) || []); const p = (f[0] && f[0].properties) || {};
  const withPbf = f.filter(x => x.properties && x.properties.urls && x.properties.urls.pbf).length;
  return `об'єктів ${f.length}, з pbf ${withPbf}, поля першого: ${Object.keys(p).join(',')}; приклад: ${JSON.stringify(f.find(x => x.properties && x.properties.urls && x.properties.urls.pbf)?.properties || p).slice(0, 300)}`;
}

function bbox(c, b) {
  if (typeof c[0] === 'number') { if (c[0] < b[0]) b[0] = c[0]; if (c[0] > b[2]) b[2] = c[0]; if (c[1] < b[1]) b[1] = c[1]; if (c[1] > b[3]) b[3] = c[1]; return; }
  for (const x of c) bbox(x, b);
}
/** Центр геометрії GeoJSON як [lon, lat] (середина обмежувальної рамки). */
export function centerOf(g) {
  if (!g || !g.coordinates) return null;
  const b = [Infinity, Infinity, -Infinity, -Infinity]; bbox(g.coordinates, b);
  return isFinite(b[0]) ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : null;
}

/** Один рядок geojsonseq від `osmium export --add-unique-id=type_id` → елемент у форматі Overpass (для pickVenues) або null. */
export function parseFeature(line) {
  line = String(line).replace(/^\x1e/, '').trim(); if (!line) return null;
  let f; try { f = JSON.parse(line); } catch { return null; }
  const t = f && f.properties, id = String(f && f.id || '').match(/^([nwra])(\d+)$/);
  if (!t || !t.name || !f.geometry || !id) return null;
  const c = centerOf(f.geometry); if (!c || !isFinite(c[0]) || !isFinite(c[1])) return null;
  return { type: { n: 'node', w: 'way', r: 'relation', a: 'way' }[id[1]], id: Number(id[2]), tags: t, lat: c[1], lon: c[0] };
}

/** Розкладає об'єкти по містах, до яких вони близько (радіус пошуку як в Overpass-версії). */
export class CityIndex {
  constructor(cities, radiusKm = RADIUS / 1000, cap = 80000) {
    this.radiusKm = radiusKm; this.cap = cap; this.cell = 0.1; this.grid = new Map(); this.byCity = new Map();
    for (const c of cities) { this.byCity.set(c.id, []); const k = this.key(c.lat, c.lon); (this.grid.get(k) || this.grid.set(k, []).get(k)).push(c); }
  }
  key(lat, lon) { return Math.floor(lat / this.cell) + ',' + Math.floor(lon / this.cell); }
  add(e) {
    const ci = Math.floor(e.lat / this.cell), cj = Math.floor(e.lon / this.cell); let n = 0;
    for (let di = -1; di <= 1; di++) for (let dj = -2; dj <= 2; dj++) {            // по довготі ±2 клітинки: на високих широтах 0,1° менше за радіус
      const list = this.grid.get((ci + di) + ',' + (cj + dj)); if (!list) continue;
      for (const c of list) if (dist(e.lat, e.lon, c.lat, c.lon) <= this.radiusKm) { const arr = this.byCity.get(c.id); if (arr.length < this.cap) { arr.push(e); n++; } }
    }
    return n;
  }
}

// ---------- Черга: що потребує наповнення ----------
const DAY = 864e5;
/** У черзі, зависле захоплення, невдале понад тиждень тому, часткове, або готове понад 30 днів тому (оновлення). */
const NEED = "alias_of IS NULL AND (status = 'pending' OR (status = 'working' AND fetched_at < ?1) OR (status = 'failed' AND (fetched_at IS NULL OR fetched_at < ?2)) OR (status = 'ready' AND (fetched_at < ?3 OR error LIKE 'partial%')))";
const needArgs = (now = Date.now()) => [now - 600000, now - 7 * DAY, now - 30 * DAY];
/** Країни з містами в черзі: спершу ті, де є міста клієнтів (priority), потім за кількістю міст. */
export async function queueCountries(env, now = Date.now()) {
  const { results } = await env.DB.prepare(`SELECT country, COUNT(*) AS n, MAX(priority) AS p FROM venue_cities WHERE ${NEED} GROUP BY country ORDER BY p DESC, n DESC`).bind(...needArgs(now)).all();
  return results;
}
export async function queueCities(env, cc, now = Date.now()) {
  const { results } = await env.DB.prepare(`SELECT * FROM venue_cities WHERE country = ?4 AND ${NEED} ORDER BY priority DESC, requested_at`).bind(...needArgs(now), cc).all();
  return results;
}

/** Варіанти адреси файлу: з каталогу (europe/ukraine/ukraine-latest…) і «пласка» (europe/ukraine-latest…). Geofabrik інколи віддає лише одну з них. */
export const GF_BASES = ['https://download.geofabrik.de/', 'https://ftp5.gwdg.de/pub/misc/openstreetmap/download.geofabrik.de/'];   // головний сервер і дзеркало GWDG
export function urlVariants(url) {
  const m = String(url).match(/^(.*)\/([^/]+)\/\2-latest\.osm\.pbf$/), forms = m ? [url, `${m[1]}/${m[2]}-latest.osm.pbf`] : [url];
  const out = [...forms];
  for (const f of forms) if (f.startsWith(GF_BASES[0])) out.push(GF_BASES[1] + f.slice(GF_BASES[0].length));          // те саме на дзеркалі
  const g = String(url).match(/^https:\/\/download\.geofabrik\.de\/([^/]+)\/(?:.*\/)?([^/]+)-latest\.osm\.pbf$/);   // незалежне джерело: країнові вигрузки OSM-France
  if (g) out.push(`https://download.openstreetmap.fr/extracts/${g[1]}/${g[2]}.osm.pbf`);
  return out;
}
