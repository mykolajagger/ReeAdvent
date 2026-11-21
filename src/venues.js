// Власна база закладів на основі OpenStreetMap (дані © OpenStreetMap contributors, ліцензія ODbL) + оцінки користувачів ReeAdvent.
// Безкоштовно: Overpass API (заклади) і Nominatim (координати міста). Наповнення йде фоном (cron кожні 10 хв, по одному місту),
// найбільші міста заповнені заздалегідь, нові міста ставляться в пріоритетну чергу в момент замовлення (готово за ~20–40 хв).
import { TOP_CITIES } from './top_cities.js';
import { rateLimit } from './promo.js';

const UA = 'ReeAdvent/1.0 (+https://reeadvent.fun; support@reeadvent.fun)';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const RADIUS = 8000, PER_SET = 400, KEEP = 25, REFRESH_MS = 7 * 864e5;

/** Категорії закладів → теги OSM (значення: рядок, масив варіантів або '!a|b' — «крім»). */
export const CATS = {
  cafe: [{ amenity: 'cafe' }], restaurant: [{ amenity: 'restaurant' }], bar: [{ amenity: ['bar', 'pub'] }], pastry: [{ shop: ['pastry', 'confectionery', 'chocolate'] }],
  cinema: [{ amenity: 'cinema' }], theatre: [{ amenity: ['theatre', 'arts_centre'] }], museum: [{ tourism: 'museum' }], park: [{ leisure: 'park' }],
  viewpoint: [{ tourism: 'viewpoint' }], bowling: [{ leisure: 'bowling_alley' }], billiards: [{ sport: 'billiards' }], pool: [{ leisure: 'swimming_pool', access: '!private|no' }, { leisure: 'sports_centre', sport: 'swimming' }],
  spa: [{ leisure: ['sauna', 'spa'] }, { shop: 'massage' }], rink: [{ leisure: 'ice_rink' }], climbing: [{ sport: 'climbing' }], yoga: [{ sport: ['yoga', 'pilates'] }],
  church: [{ amenity: 'place_of_worship', building: ['cathedral', 'church'] }], garden: [{ leisure: 'garden' }], castle: [{ historic: ['castle', 'fort'] }],
  books: [{ shop: 'books' }], florist: [{ shop: 'florist' }], market: [{ amenity: 'marketplace' }], shelter: [{ amenity: 'animal_shelter' }], gift: [{ shop: 'gift' }]
};
// Українська пошукова фраза активності → категорія (перша відповідність)
const QUERY_CAT = [[/театр|філармон|афіш/, 'theatre'], [/кінотеатр/, 'cinema'], [/музей/, 'museum'], [/оглядов|пагорб/, 'viewpoint'], [/ботан|оранжер/, 'garden'], [/парк|ліс |ліс$|набереж/, 'park'],
  [/боулінг/, 'bowling'], [/більярд/, 'billiards'], [/басейн/, 'pool'], [/сауна|масаж/, 'spa'], [/ковзанк|каток/, 'rink'], [/скеледром/, 'climbing'], [/йога/, 'yoga'],
  [/храм|собор|церкв/, 'church'], [/замок|фортец/, 'castle'], [/книгарн/, 'books'], [/квіт/, 'florist'], [/ринок|ярмарок/, 'market'], [/притулок/, 'shelter'], [/сувенір|ялинк/, 'gift'],
  [/кондитер/, 'pastry'], [/коктейл|караоке|вин|глінтвейн|жива музика/, 'bar'], [/піцер|азійськ|ресторан/, 'restaurant'], [/кав.ярн|бранч|шоколад|настіл/, 'cafe']];
export const catOfQuery = q => { const s = String(q || '').toLowerCase(); for (const [re, c] of QUERY_CAT) if (re.test(s)) return c; return null; };

const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'‘`ʼ]/g, '').replace(/\s+/g, ' ').trim();
export const cityKey = (country, name) => `${String(country || 'UA').toUpperCase()}|${norm(name)}`;

// ---------- Черга міст ----------
/** Ставить місто в пріоритетну чергу, якщо його ще немає (викликається при замовленні; помилки ігноруємо). */
export async function ensureCity(env, country, name) {
  try {
    const key = cityKey(country, name); if (!name || !key.split('|')[1]) return;
    await env.DB.prepare("INSERT INTO venue_cities (key, country, name, status, priority, requested_at) VALUES (?, ?, ?, 'pending', 1, ?) ON CONFLICT(key) DO NOTHING").bind(key, String(country || 'UA').toUpperCase(), String(name).slice(0, 80), Date.now()).run();
  } catch (e) { console.error('ensureCity', e); }
}
async function seedTop(env) {
  const f = await env.DB.prepare("SELECT value FROM settings WHERE key = 'venues_seeded'").first();
  if (f) return false;
  const now = Date.now(), st = TOP_CITIES.map(([cc, name, lat, lon]) => env.DB.prepare("INSERT INTO venue_cities (key, country, name, lat, lon, status, priority, requested_at) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?) ON CONFLICT(key) DO NOTHING").bind(cityKey(cc, name), cc, name, lat, lon, now));
  for (let i = 0; i < st.length; i += 100) await env.DB.batch(st.slice(i, i + 100));
  await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('venues_seeded', '1', ?) ON CONFLICT(key) DO NOTHING").bind(now).run();
  return true;
}

// ---------- Мережа: Nominatim, Overpass ----------
async function geocode(name, country, fetchImpl) {
  const u = `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=en&countrycodes=${country.toLowerCase()}&q=${encodeURIComponent(name)}`;
  const r = await fetchImpl(u, { headers: { 'User-Agent': UA } }); if (!r.ok) throw new Error('nominatim ' + r.status);
  const j = await r.json(); if (!j.length) return null;
  const lat = Number(j[0].lat), lon = Number(j[0].lon); return isFinite(lat) && isFinite(lon) ? { lat, lon } : null;
}
const flt = f => Object.entries(f).map(([k, v]) => Array.isArray(v) ? `["${k}"~"^(${v.join('|')})$"]` : String(v).startsWith('!') ? `["${k}"!~"^(${v.slice(1)})$"]` : `["${k}"="${v}"]`).join('');
export function overpassQuery(lat, lon) {
  const sets = Object.values(CATS).map(fs => `(${fs.map(f => `nwr${flt(f)}["name"](around:${RADIUS},${lat},${lon});`).join('')});out center tags ${PER_SET};`);
  return `[out:json][timeout:60][maxsize:67108864];${sets.join('')}`;
}
async function overpass(query, fetchImpl) {
  let last;
  for (const url of OVERPASS) {
    try { const r = await fetchImpl(url, { method: 'POST', headers: { 'User-Agent': UA, 'content-type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query) }); if (r.ok) return await r.json(); last = new Error('overpass ' + r.status); }
    catch (e) { last = e; }
  }
  throw last;
}
const tagMatch = (t, f) => Object.entries(f).every(([k, v]) => { const x = t[k]; if (x == null) return String(v).startsWith('!'); return Array.isArray(v) ? v.includes(x) : String(v).startsWith('!') ? !new RegExp(`^(${v.slice(1)})$`).test(x) : x === v; });
const dist = (a, b, c, d) => Math.hypot((a - c) * 111.2, (b - d) * 111.2 * Math.cos(a * Math.PI / 180)); // км, наближено

/** Перетворює відповідь Overpass на рядки для БД: до KEEP найкращих у кожній категорії за «багатством» тегів і близькістю до центру. */
export function pickVenues(elements, lat, lon) {
  const byCat = {}, seen = new Set();
  for (const e of elements || []) {
    const t = e.tags || {}, name = String(t.name || '').trim(); if (!name || name.length > 90) continue;
    const la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon; if (la == null || lo == null) continue;
    const prior = (t.website || t['contact:website'] ? 1 : 0) + (t.opening_hours ? 1 : 0) + (t.wikidata || t.wikipedia ? 2 : 0) + (t.phone || t['contact:phone'] ? 0.5 : 0) + (t.cuisine || t['name:en'] ? 0.3 : 0)
      + (t['addr:street'] ? 0.3 : 0) + Math.max(0, 1 - dist(la, lo, lat, lon) / (RADIUS / 1000)) * 1.5;
    const address = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ').slice(0, 80);
    for (const [cat, fs] of Object.entries(CATS)) {
      if (!fs.some(f => tagMatch(t, f))) continue;
      const osm = `${e.type[0]}${e.id}`, k = osm + cat; if (seen.has(k)) continue; seen.add(k);
      (byCat[cat] ||= []).push({ osm, cat, name, address, lat: la, lon: lo, prior: Math.round(prior * 100) / 100 });
    }
  }
  return Object.values(byCat).flatMap(a => a.sort((x, y) => y.prior - x.prior).slice(0, KEEP));
}

// ---------- Наповнення одного міста ----------
async function fillCity(env, c, fetchImpl) {
  const now = Date.now();
  let { lat, lon } = c;
  try {
    if (lat == null || lon == null) {
      const g = await geocode(c.name, c.country, fetchImpl);
      if (!g) { await env.DB.prepare("UPDATE venue_cities SET status = 'failed', error = 'geocode_not_found', fetched_at = ? WHERE id = ?").bind(now, c.id).run(); return { city: c.key, status: 'failed' }; }
      ({ lat, lon } = g);
      // те саме місто під іншою назвою (Львів / Lviv): не дублюємо — посилаємося на вже наявне
      const twin = await env.DB.prepare("SELECT id FROM venue_cities WHERE country = ? AND id != ? AND alias_of IS NULL AND lat IS NOT NULL AND ABS(lat - ?) < 0.12 AND ABS(lon - ?) < 0.18 ORDER BY (status = 'ready') DESC, id LIMIT 1").bind(c.country, c.id, lat, lon).first();
      if (twin) { await env.DB.prepare("UPDATE venue_cities SET priority = 1 WHERE id = ? AND status = 'pending'").bind(twin.id).run(); await env.DB.prepare("UPDATE venue_cities SET alias_of = ?, lat = ?, lon = ?, status = 'ready', fetched_at = ? WHERE id = ?").bind(twin.id, lat, lon, now, c.id).run(); return { city: c.key, status: 'alias' }; }
      await env.DB.prepare('UPDATE venue_cities SET lat = ?, lon = ? WHERE id = ?').bind(lat, lon, c.id).run();
    }
    const data = await overpass(overpassQuery(lat, lon), fetchImpl);
    const rows = pickVenues(data.elements, lat, lon);
    const st = rows.map(v => env.DB.prepare('INSERT INTO venues (city_id, osm, cat, name, address, lat, lon, prior, seen_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(city_id, osm, cat) DO UPDATE SET name = excluded.name, address = excluded.address, lat = excluded.lat, lon = excluded.lon, prior = excluded.prior, seen_at = excluded.seen_at').bind(c.id, v.osm, v.cat, v.name, v.address, v.lat, v.lon, v.prior, now));
    for (let i = 0; i < st.length; i += 100) await env.DB.batch(st.slice(i, i + 100));
    if (rows.length) await env.DB.prepare('DELETE FROM venues WHERE city_id = ? AND seen_at < ? AND r_cnt = 0').bind(c.id, now).run(); // зниклі з OSM без оцінок прибираємо
    await env.DB.prepare("UPDATE venue_cities SET status = 'ready', venues_count = ?, fetched_at = ?, attempts = 0, error = NULL WHERE id = ?").bind(rows.length, now, c.id).run();
    return { city: c.key, status: 'ready', venues: rows.length };
  } catch (e) {
    const failed = c.attempts + 1 >= 3;
    await env.DB.prepare('UPDATE venue_cities SET attempts = attempts + 1, status = ?, error = ?, fetched_at = ? WHERE id = ?').bind(failed ? 'failed' : (c.status === 'ready' ? 'ready' : 'pending'), String(e.message || e).slice(0, 120), now, c.id).run();
    return { city: c.key, status: failed ? 'failed' : 'retry', error: String(e.message || e).slice(0, 80) };
  }
}

/** Один крок cron (кожні ~10 хв): наповнює одне місто. Спершу нові міста клієнтів, потім найбільші, вночі (UTC 0–4) — тижневе оновлення. */
async function nextCity(env, now) {
  let c = await env.DB.prepare("SELECT * FROM venue_cities WHERE status = 'pending' AND alias_of IS NULL ORDER BY priority DESC, requested_at LIMIT 1").first();
  if (!c) {
    const h = new Date(now).getUTCHours();
    if (h >= 0 && h < 4) c = await env.DB.prepare("SELECT * FROM venue_cities WHERE status IN ('ready','failed') AND alias_of IS NULL AND lat IS NOT NULL AND (fetched_at IS NULL OR fetched_at < ?) ORDER BY fetched_at LIMIT 1").bind(now - REFRESH_MS).first();
  }
  return c;
}
/** За запуск обробляється VENUES_PER_RUN міст (за замовчуванням 1, максимум 10), але не довше ~40 с. */
export async function runVenues(env, { fetchImpl = fetch, now = Date.now() } = {}) {
  const seeded = await seedTop(env), per = Math.min(10, Math.max(1, parseInt(env.VENUES_PER_RUN, 10) || 1)), t0 = Date.now(), done = [];
  while (done.length < per && (done.length === 0 || Date.now() - t0 < 25000)) {
    const c = await nextCity(env, now); if (!c) break;
    done.push(await fillCity(env, c, fetchImpl));
  }
  if (!done.length) return { seeded, idle: true };
  return { seeded, ...done[0], ...(done.length > 1 ? { cities: done } : {}) };
}

/** Невдалі й очікувані міста (для адмінки). */
export async function venueProblems(env) {
  const { results } = await env.DB.prepare("SELECT id, country, name, status, attempts, error, fetched_at FROM venue_cities WHERE alias_of IS NULL AND (status = 'failed' OR (status = 'pending' AND priority > 0)) ORDER BY (status = 'failed') DESC, requested_at DESC LIMIT 30").all();
  return results;
}
/** Повертає в чергу одне місто (id) або всі невдалі. */
export async function retryCities(env, id) {
  const r = id ? await env.DB.prepare("UPDATE venue_cities SET status = 'pending', attempts = 0, error = NULL, priority = 1 WHERE id = ? AND alias_of IS NULL").bind(id).run()
    : await env.DB.prepare("UPDATE venue_cities SET status = 'pending', attempts = 0, error = NULL, priority = 1 WHERE status = 'failed' AND alias_of IS NULL").run();
  return r.meta?.changes || 0;
}
/** Ручне додавання міста в чергу (адмін). */
export async function queueCity(env, country, name) {
  country = String(country || '').toUpperCase(); name = String(name || '').trim().slice(0, 80);
  if (!/^[A-Z]{2}$/.test(country) || name.length < 2) return false;
  await ensureCity(env, country, name); return true;
}

export async function venueStats(env) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS cities, SUM(status = 'ready') AS ready, SUM(status = 'pending') AS pending, SUM(status = 'failed') AS failed FROM venue_cities WHERE alias_of IS NULL").first();
  const v = await env.DB.prepare('SELECT COUNT(*) AS n FROM venues').first(), rt = await env.DB.prepare('SELECT COUNT(*) AS n FROM venue_ratings').first();
  return { cities: r.cities || 0, ready: r.ready || 0, pending: r.pending || 0, failed: r.failed || 0, venues: v.n, ratings: rt.n };
}

// ---------- Видача рекомендацій і оцінки ----------
const bayes = v => (v.r_sum + 4 * 5) / (v.r_cnt + 5);           // середня з «апріорною» четвіркою: нових закладів не штрафуємо
const hash = s => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
async function cityId(env, country, name) {
  const c = await env.DB.prepare('SELECT t.id AS id, t.status AS status FROM venue_cities c JOIN venue_cities t ON t.id = COALESCE(c.alias_of, c.id) WHERE c.key = ?').bind(cityKey(country, name)).first();
  return c ? { id: c.id, status: c.status } : null;
}

/** До 3 закладів категорії: найкращі за (оцінки користувачів + повнота даних OSM), з варіативністю за учасником/днем. Порожньо, якщо база міста ще не готова. */
export async function venuePicks(env, { country, city, cat, seedKey }) {
  const c = await cityId(env, country, city); if (!c || c.status !== 'ready' || !cat) return [];
  const { results } = await env.DB.prepare('SELECT id, name, address, prior, r_sum, r_cnt FROM venues WHERE city_id = ? AND cat = ?').bind(c.id, cat).all();
  const ok = results.filter(v => !(v.r_cnt >= 5 && v.r_sum / v.r_cnt < 3));
  ok.sort((a, b) => (bayes(b) + b.prior * 0.35) - (bayes(a) + a.prior * 0.35));
  const top = ok.slice(0, 9).map(v => ({ v, k: hash(seedKey + ':' + v.id) })).sort((a, b) => a.k - b.k).slice(0, 3).map(x => x.v);
  return top.sort((a, b) => bayes(b) - bayes(a)).map(v => ({ id: v.id, name: v.name, address: v.address || '', rating: v.r_cnt >= 3 ? Math.round(v.r_sum / v.r_cnt * 10) / 10 : null, count: v.r_cnt,
    url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.name + ' ' + city)}`, source: 'osm' }));
}

/** Оцінка закладу від учасника (1–5); повторна оцінка замінює попередню. Лише для закладів міста календаря. */
export async function rateVenue(env, { memberId, country, city, venueId, stars }) {
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return { ok: false, error: 'bad_stars' };
  if (!(await rateLimit(env, 'vrate:' + memberId, 40, 86400))) return { ok: false, error: 'too_many' };
  const c = await cityId(env, country, city), v = c && await env.DB.prepare('SELECT id FROM venues WHERE id = ? AND city_id = ?').bind(venueId, c.id).first();
  if (!v) return { ok: false, error: 'not_found' };
  const prev = await env.DB.prepare('SELECT stars FROM venue_ratings WHERE venue_id = ? AND member_id = ?').bind(venueId, memberId).first();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO venue_ratings (venue_id, member_id, stars, created_at) VALUES (?,?,?,?) ON CONFLICT(venue_id, member_id) DO UPDATE SET stars = excluded.stars, created_at = excluded.created_at').bind(venueId, memberId, stars, Date.now()),
    env.DB.prepare('UPDATE venues SET r_sum = r_sum + ?, r_cnt = r_cnt + ? WHERE id = ?').bind(stars - (prev ? prev.stars : 0), prev ? 0 : 1, venueId)
  ]);
  return { ok: true };
}
