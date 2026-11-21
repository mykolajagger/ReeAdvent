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

/** Знаходить вигрузку країни в індексі Geofabrik (index-v1-nogeom.json); найвужча (за кількістю країн) перемагає. */
export function findPbf(index, cc) {
  const props = ((index && index.features) || []).map(f => f.properties).filter(p => p && p.urls && p.urls.pbf && Array.isArray(p['iso3166-1:alpha2']));
  const hit = props.filter(p => p['iso3166-1:alpha2'].includes(cc)).sort((a, b) => a['iso3166-1:alpha2'].length - b['iso3166-1:alpha2'].length || String(a.id).length - String(b.id).length)[0];
  return hit ? { id: hit.id, url: hit.urls.pbf, shared: hit['iso3166-1:alpha2'].length > 1 } : null;
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
