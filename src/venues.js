// Власна база закладів на основі OpenStreetMap (дані © OpenStreetMap contributors, ліцензія ODbL) + оцінки користувачів ReeAdvent.
// Безкоштовно: Overpass API (заклади) і Nominatim (координати міста). Наповнення йде фоном (cron кожні 10 хв, по одному місту),
// найбільші міста заповнені заздалегідь, нові міста ставляться в пріоритетну чергу в момент замовлення (готово за ~20–40 хв).
import { TOP_CITIES } from './top_cities.js';
import { rateLimit } from './promo.js';

const UA = 'ReeAdvent/1.0 (+https://reeadvent.fun; support@reeadvent.fun)';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const MAX_CONCURRENT = 2; // одночасно не більше двох міст у роботі: публічний Overpass має обмежену кількість «слотів»
const RADIUS = 6000, PER_SET = 400, KEEP = 20, REFRESH_MS = 7 * 864e5, VER = '2'; // VER: версія схеми/категорій; зміна ставить готові міста на повторне наповнення

/** Категорії закладів → теги OSM (значення: рядок, масив варіантів або '!a|b' — «крім»). */
export const CATS = {
  cafe: [{ amenity: 'cafe' }], restaurant: [{ amenity: 'restaurant' }], bar: [{ amenity: ['bar', 'pub'] }], pastry: [{ shop: ['pastry', 'confectionery', 'chocolate'] }],
  cinema: [{ amenity: 'cinema' }], theatre: [{ amenity: ['theatre', 'arts_centre'] }], museum: [{ tourism: 'museum' }], park: [{ leisure: 'park' }],
  viewpoint: [{ tourism: 'viewpoint' }], bowling: [{ leisure: 'bowling_alley' }], billiards: [{ sport: 'billiards' }], pool: [{ leisure: 'swimming_pool', access: '!private|no' }, { leisure: 'sports_centre', sport: 'swimming' }],
  spa: [{ leisure: ['sauna', 'spa'] }, { shop: 'massage' }], rink: [{ leisure: 'ice_rink' }], climbing: [{ sport: 'climbing' }], yoga: [{ sport: ['yoga', 'pilates'] }],
  church: [{ amenity: 'place_of_worship', building: ['cathedral', 'church'] }], garden: [{ leisure: 'garden' }], castle: [{ historic: ['castle', 'fort'] }],
  books: [{ shop: 'books' }], florist: [{ shop: 'florist' }], market: [{ amenity: 'marketplace' }], shelter: [{ amenity: 'animal_shelter' }], gift: [{ shop: 'gift' }],
  // магазини для підказок «де купити» до подарунків
  coffee: [{ shop: 'coffee' }], tea: [{ shop: 'tea' }], wine: [{ shop: 'wine' }], beer: [{ shop: ['alcohol', 'beverages'] }], cheese: [{ shop: 'cheese' }], photo: [{ shop: 'photo' }],
  jewelry: [{ shop: 'jewelry' }], toys: [{ shop: ['toys', 'games'] }], beauty: [{ shop: ['cosmetics', 'perfumery'] }]
};
// Українська пошукова фраза активності → категорія (перша відповідність)
const QUERY_CAT = [[/театр|філармон|афіш/, 'theatre'], [/кінотеатр/, 'cinema'], [/музей/, 'museum'], [/оглядов|пагорб/, 'viewpoint'], [/ботан|оранжер/, 'garden'], [/парк|ліс |ліс$|набереж/, 'park'],
  [/боулінг/, 'bowling'], [/більярд/, 'billiards'], [/басейн/, 'pool'], [/сауна|масаж/, 'spa'], [/ковзанк|каток/, 'rink'], [/скеледром/, 'climbing'], [/йога/, 'yoga'],
  [/храм|собор|церкв/, 'church'], [/замок|фортец/, 'castle'], [/книгарн/, 'books'], [/квіт/, 'florist'], [/ринок|ярмарок/, 'market'], [/притулок/, 'shelter'], [/сувенір|ялинк/, 'gift'],
  [/кондитер/, 'pastry'], [/коктейл|караоке|вин|глінтвейн|жива музика/, 'bar'], [/піцер|азійськ|ресторан/, 'restaurant'], [/кав.ярн|бранч|шоколад|настіл/, 'cafe']];
export const catOfQuery = q => { const s = String(q || '').toLowerCase(); for (const [re, c] of QUERY_CAT) if (re.test(s)) return c; return null; };

// Подарунок → категорія магазину (за українською назвою/запитом); шаблонні запити з {city} (кав’ярня, піца, кіно…) спадають на catOfQuery
const GIFT_CAT = [[/обсмажк/, 'coffee'], [/винн.*крамниц/, 'wine'], [/пиво|сидр/, 'beer'], [/сироварн/, 'cheese'], [/масаж спини/, 'spa'], [/фотодрук|магніт|фотоальбом|фоторамк/, 'photo'],
  [/гравіюван|сережк|браслет|кулон/, 'jewelry'], [/букет|сукулент|фіалк|вінок|сухоцвіт/, 'florist'], [/книг|комікс|манга|календар|блокнот/, 'books'], [/пазл|lego|настільна гра|головоломк|гральні|funko/, 'toys'],
  [/чай|чаюван/, 'tea'], [/шоколад|пряник|імбирн/, 'pastry'], [/свічк|аромадифузор/, 'gift'], [/парфум|крем|бальзам|гель для душу|сіль для ванни|бомбочки для ванни|масажна олія/, 'beauty']];
export const catOfGift = q => { const s = String(q || '').toLowerCase(); for (const [re, c] of GIFT_CAT) if (re.test(s)) return c; return s.includes('{city}') ? catOfQuery(s) : null; };

/** Години роботи з OSM (opening_hours) у зручному вигляді: «Пн–Пт 09:00–18:00». Складні правила скорочуються. */
export function formatHours(raw, lang = 'uk') {
  let s = String(raw || '').trim(); if (!s) return '';
  if (s === '24/7') return lang === 'en' ? '24/7' : 'цілодобово';
  const D = lang === 'en' ? { Mo: 'Mon', Tu: 'Tue', We: 'Wed', Th: 'Thu', Fr: 'Fri', Sa: 'Sat', Su: 'Sun', PH: 'holidays', off: 'closed' } : { Mo: 'Пн', Tu: 'Вт', We: 'Ср', Th: 'Чт', Fr: 'Пт', Sa: 'Сб', Su: 'Нд', PH: 'свята', off: 'вихідний' };
  s = s.replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH|off)\b/g, m => D[m]).replace(/(\d)-(\d)/g, '$1–$2').replace(/(\p{L})-(\p{L})/gu, '$1–$2').replace(/\s*;\s*/g, '; ');
  return s.length > 70 ? s.slice(0, 69).replace(/[;,\s]+\S*$/, '') + '…' : s;
}

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
  if (f) {
    // нова версія категорій/полів: уже готові міста ставимо на повторне наповнення (старі дані показуються, доки не оновляться)
    const v = await env.DB.prepare("SELECT value FROM settings WHERE key = 'venues_ver'").first();
    if (!v || v.value !== VER) {
      await env.DB.prepare("UPDATE venue_cities SET status = 'pending' WHERE status = 'ready' AND alias_of IS NULL AND priority = 0 AND lat IS NOT NULL").run();
      await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('venues_ver', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(VER, Date.now()).run();
    }
    return false;
  }
  await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('venues_ver', ?, ?) ON CONFLICT(key) DO NOTHING").bind(VER, Date.now()).run();
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
// Запити діляться на групи (великі міста типу Києва не витримують одного запиту на 33 категорії) і йдуть за прямокутником — це швидше за «around»
export const CAT_GROUPS = [['cafe', 'restaurant', 'bar', 'pastry'], ['cinema', 'theatre', 'museum', 'park', 'viewpoint', 'garden', 'castle', 'church', 'market'],
  ['bowling', 'billiards', 'pool', 'spa', 'rink', 'climbing', 'yoga', 'shelter'], ['books', 'florist', 'gift', 'coffee', 'tea', 'wine', 'beer', 'cheese', 'photo', 'jewelry', 'toys', 'beauty']];
export function overpassQueries(lat, lon, timeoutSec = 30) {
  const dLat = RADIUS / 111200, dLon = RADIUS / (111200 * Math.cos(lat * Math.PI / 180)), bbox = [lat - dLat, lon - dLon, lat + dLat, lon + dLon].map(x => x.toFixed(5)).join(',');
  return CAT_GROUPS.map(g => `[out:json][timeout:${timeoutSec}][maxsize:67108864];${g.map(cat => `(${CATS[cat].map(f => `nwr${flt(f)}["name"](${bbox});`).join('')});out center tags ${PER_SET};`).join('')}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
/** Запит до Overpass із запасними серверами. Два кола: після відмови всіх (429/5xx, таймаут) пауза й спроба ще раз. Відповідь із повідомленням про помилку виконання вважається невдалою. */
async function overpass(query, fetchImpl, pause = 5000, abortMs = 40000) {
  let last;
  for (let round = 0; round < 2; round++) {
    if (round) { if (!/overpass (429|50\d)/.test(String(last && last.message))) break; await sleep(pause); }
    for (const url of OVERPASS) {
      try {
        const r = await fetchImpl(url, { method: 'POST', headers: { 'User-Agent': UA, 'content-type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query), signal: AbortSignal.timeout(abortMs) });
        if (!r.ok) { last = new Error('overpass ' + r.status); continue; }
        const j = await r.json();
        if (j.remark && /runtime error|timed out|timeout|out of memory/i.test(j.remark)) { last = new Error('overpass remark: ' + String(j.remark).slice(0, 40)); continue; }
        return j;
      } catch (e) { last = e; }
    }
  }
  throw last;
}

/** Діагностика для адмінки: що відповідає кожне дзеркало Overpass на малий запит і на справжній (група 1, Львів). Дзеркала опитуються паралельно. */
export async function overpassProbe(fetchImpl = fetch) {
  const small = '[out:json][timeout:15];nwr["amenity"="cafe"]["name"](49.83,24.02,49.85,24.04);out center tags 3;', big = overpassQueries(49.8397, 24.0297)[0];
  const one = async (url, q) => {
    const t = Date.now();
    try {
      const r = await fetchImpl(url, { method: 'POST', headers: { 'User-Agent': UA, 'content-type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q), signal: AbortSignal.timeout(20000) });
      const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch {}
      return { status: r.status, ms: Date.now() - t, bytes: txt.length, n: j && j.elements ? j.elements.length : null, note: j && j.remark ? String(j.remark).slice(0, 80) : (r.ok ? '' : txt.replace(/\s+/g, ' ').slice(0, 80)) };
    } catch (e) { return { error: String(e && e.message || e).slice(0, 80), ms: Date.now() - t }; }
  };
  const status = async url => { const t = Date.now(); try { const r = await fetchImpl(url.replace('/interpreter', '/status'), { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) }); return { status: r.status, ms: Date.now() - t, note: (await r.text()).replace(/\s+/g, ' ').slice(0, 220) }; } catch (e) { return { error: String(e && e.message || e).slice(0, 60), ms: Date.now() - t }; } };
  return Promise.all(OVERPASS.map(async url => ({ mirror: new URL(url).host, status: await status(url), small: await one(url, small), group1: await one(url, big) })));
}
const RE_CACHE = new Map(), reOf = src => { let r = RE_CACHE.get(src); if (!r) RE_CACHE.set(src, r = new RegExp(`^(${src})$`)); return r; };
const tagMatch = (t, f) => { for (const k in f) { const v = f[k], x = t[k], not = typeof v === 'string' && v.charCodeAt(0) === 33; if (x == null) { if (!not) return false; continue; } if (Array.isArray(v) ? !v.includes(x) : not ? reOf(v.slice(1)).test(x) : x !== v) return false; } return true; };
// Індекс «ключ тегу → категорії»: для кожного елемента перевіряємо лише ті категорії, чиї ключі в нього є (економить процесорний час на великих містах)
const KEY_CATS = {}; for (const [cat, fs] of Object.entries(CATS)) for (const f of fs) for (const k of Object.keys(f)) (KEY_CATS[k] ||= new Set()).add(cat);
const dist = (a, b, c, d) => Math.hypot((a - c) * 111.2, (b - d) * 111.2 * Math.cos(a * Math.PI / 180)); // км, наближено

/** Перетворює відповідь Overpass на рядки для БД: до KEEP найкращих у кожній категорії за «багатством» тегів і близькістю до центру. */
export function pickVenues(elements, lat, lon) {
  const byCat = {}, seen = new Set();
  for (const e of elements || []) {
    const t = e.tags || {}, name = String(t.name || '').trim(); if (!name || name.length > 90) continue;
    const la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon; if (la == null || lo == null) continue;
    const cands = new Set(); for (const k in t) { const sc = KEY_CATS[k]; if (sc) for (const c of sc) cands.add(c); }
    let matched = null; for (const cat of cands) if (CATS[cat].some(f => tagMatch(t, f))) (matched ||= []).push(cat);
    if (!matched) continue;
    const prior = (t.website || t['contact:website'] ? 1 : 0) + (t.opening_hours ? 1 : 0) + (t.wikidata || t.wikipedia ? 2 : 0) + (t.phone || t['contact:phone'] ? 0.5 : 0) + (t.cuisine || t['name:en'] ? 0.3 : 0)
      + (t['addr:street'] ? 0.3 : 0) + Math.max(0, 1 - dist(la, lo, lat, lon) / (RADIUS / 1000)) * 1.5;
    const address = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ').slice(0, 80);
    for (const cat of matched) {
      const osm = `${e.type[0]}${e.id}`, k = osm + cat; if (seen.has(k)) continue; seen.add(k);
      (byCat[cat] ||= []).push({ osm, cat, name, address, lat: la, lon: lo, prior: Math.round(prior * 100) / 100, hours: t.opening_hours ? String(t.opening_hours).slice(0, 120) : null });
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
    const els = [], failed = [], counts = []; let lastErr; const errs = [];
    const T = Math.min(120, Math.max(15, parseInt(env.OVERPASS_TIMEOUT, 10) || 30)), qs = overpassQueries(lat, lon, T), par = fetchImpl === fetch ? 2 : 1;      // у бойовому режимі по дві групи паралельно (Overpass дозволяє 2 слоти на адресу)
    for (let g = 0; g < qs.length; g += par) {
      if (g) await sleep(fetchImpl === fetch ? 800 : 0);
      await Promise.all(qs.slice(g, g + par).map(async (q, k) => {
        const i = g + k;
        try { const d = (await overpass(q, fetchImpl, fetchImpl === fetch ? 5000 : 0, (T + 15) * 1000)).elements || []; counts[i] = d.length; els.push(...d); }
        catch (e) { counts[i] = -1; failed.push(i + 1); lastErr = e; errs.push(`${i + 1}: ${String(e && e.message || e).slice(0, 50)}`); }
      }));
    }
    failed.sort();
    if (failed.length === CAT_GROUPS.length) throw lastErr;     // не відповіла жодна група — повтор пізніше
    const rows = pickVenues(els, lat, lon);
    const st = rows.map(v => env.DB.prepare('INSERT INTO venues (city_id, osm, cat, name, address, lat, lon, prior, hours, seen_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(city_id, osm, cat) DO UPDATE SET name = excluded.name, address = excluded.address, lat = excluded.lat, lon = excluded.lon, prior = excluded.prior, hours = excluded.hours, seen_at = excluded.seen_at').bind(c.id, v.osm, v.cat, v.name, v.address, v.lat, v.lon, v.prior, v.hours, now));
    for (let i = 0; i < st.length; i += 100) await env.DB.batch(st.slice(i, i + 100));
    if (rows.length) await env.DB.prepare('DELETE FROM venues WHERE city_id = ? AND seen_at < ? AND r_cnt = 0').bind(c.id, now).run(); // зниклі з OSM без оцінок прибираємо
    await env.DB.prepare("UPDATE venue_cities SET status = 'ready', venues_count = ?, fetched_at = ?, attempts = 0, error = ? WHERE id = ?").bind(rows.length, now, failed.length ? 'partial: групи ' + failed.join(',') + ' (' + String(lastErr && lastErr.message || lastErr).slice(0, 60) + ')' : null, c.id).run();
    return { city: c.key, status: 'ready', venues: rows.length, raw: counts, ...(failed.length ? { failedGroups: failed, errors: errs } : {}) };
  } catch (e) {
    const failed = c.attempts + 1 >= 3;
    await env.DB.prepare('UPDATE venue_cities SET attempts = attempts + 1, status = ?, error = ?, fetched_at = ? WHERE id = ?').bind(failed ? 'failed' : (c.prev === 'ready' ? 'ready' : 'pending'), String(e.message || e).slice(0, 120), now, c.id).run();
    return { city: c.key, status: failed ? 'failed' : 'retry', error: String(e.message || e).slice(0, 80) };
  }
}

/** Один крок cron (кожні ~10 хв): наповнює одне місто. Спершу нові міста клієнтів, потім найбільші, вночі (UTC 0–4) — тижневе оновлення. */
/** Бере наступне місто й «захоплює» його (status = 'working'), щоб паралельні запуски не брали те саме. Зависле захоплення (> 10 хв) вважається вільним. */
async function nextCity(env, now) {
  const busy = await env.DB.prepare("SELECT COUNT(*) AS n FROM venue_cities WHERE status = 'working' AND fetched_at > ?").bind(Date.now() - 600000).first();
  if (busy.n >= (parseInt(env.VENUES_CONCURRENCY, 10) || MAX_CONCURRENT)) return null;
  for (let i = 0; i < 5; i++) {
    let c = await env.DB.prepare("SELECT * FROM venue_cities WHERE alias_of IS NULL AND (status = 'pending' OR (status = 'working' AND fetched_at < ?)) ORDER BY priority DESC, requested_at LIMIT 1").bind(Date.now() - 600000).first();
    if (!c) c = await env.DB.prepare("SELECT * FROM venue_cities WHERE status = 'ready' AND alias_of IS NULL AND error LIKE 'partial%' AND lat IS NOT NULL AND fetched_at < ? ORDER BY fetched_at LIMIT 1").bind(Date.now() - 1800000).first(); // часткові міста повторюємо через 30 хв
    if (!c) {
      const h = new Date(now).getUTCHours();
      if (h >= 0 && h < 4) c = await env.DB.prepare("SELECT * FROM venue_cities WHERE status IN ('ready','failed') AND alias_of IS NULL AND lat IS NOT NULL AND (fetched_at IS NULL OR fetched_at < ?) ORDER BY fetched_at LIMIT 1").bind(now - REFRESH_MS).first();
    }
    if (!c) return null;
    const r = await env.DB.prepare("UPDATE venue_cities SET status = 'working', fetched_at = ? WHERE id = ? AND status = ? AND COALESCE(fetched_at, 0) = ?").bind(Date.now(), c.id, c.status, c.fetched_at || 0).run();
    if (r.meta?.changes) return { ...c, prev: c.status === 'working' ? 'pending' : c.status };
  }
  return null;
}
/** За запуск обробляється VENUES_PER_RUN міст (за замовчуванням 1, максимум 10), але не довше budgetMs (HTTP — 25 с; Worker за розкладом — 100 с). */
export async function venuesPaused(env) { const r = await env.DB.prepare("SELECT value FROM settings WHERE key = 'venues_paused'").first(); return !!r && r.value === '1'; }
export async function setVenuesPaused(env, on) { await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('venues_paused', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(on ? '1' : '0', Date.now()).run(); }

export async function runVenues(env, { fetchImpl = fetch, now = Date.now(), budgetMs = 25000, onCity = null } = {}) {
  if (await venuesPaused(env)) return { paused: true };
  const seeded = await seedTop(env), per = Math.min(10, Math.max(1, parseInt(env.VENUES_PER_RUN, 10) || 1)), t0 = Date.now(), done = [];
  while (done.length < per && (done.length === 0 || Date.now() - t0 < budgetMs)) {
    const c = await nextCity(env, now); if (!c) break;
    done.push(await fillCity(env, c, fetchImpl)); if (onCity) await onCity(done[done.length - 1], done.length);
  }
  if (!done.length) return { seeded, idle: true };
  return { seeded, ...done[0], ...(done.length > 1 ? { cities: done } : {}) };
}

/** Невдалі й очікувані міста (для адмінки). */
export async function venueProblems(env) {
  const { results } = await env.DB.prepare("SELECT id, country, name, status, attempts, error, fetched_at FROM venue_cities WHERE alias_of IS NULL AND (status = 'failed' OR (status = 'pending' AND priority > 0) OR (status = 'ready' AND error LIKE 'partial%')) ORDER BY (status = 'failed') DESC, fetched_at DESC LIMIT 30").all();
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

/** runVenues із записом результату (або помилки) останнього запуску в settings: видно в адмінці без доступу до журналів Cloudflare. */
export async function runVenuesLogged(env, opts) {
  const save = v => env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('venues_last', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(JSON.stringify(v).slice(0, 900), Date.now()).run().catch(() => {});
  try { const out = await runVenues(env, { ...opts, onCity: (r, n) => save({ at: Date.now(), n, out: r, progress: true }) }); await save({ at: Date.now(), out }); return out; }
  catch (e) { await save({ at: Date.now(), error: String(e && e.message || e).slice(0, 300) }); throw e; }
}

export async function venueStats(env) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS cities, SUM(status = 'ready') AS ready, SUM(status = 'pending') AS pending, SUM(status = 'working') AS working, SUM(status = 'failed') AS failed FROM venue_cities WHERE alias_of IS NULL").first();
  const v = await env.DB.prepare('SELECT COUNT(*) AS n FROM venues').first(), rt = await env.DB.prepare('SELECT COUNT(*) AS n FROM venue_ratings').first();
  const lastRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'venues_last'").first(); let last = null; try { last = lastRow ? JSON.parse(lastRow.value) : null; } catch {}
  return { paused: await venuesPaused(env), cities: r.cities || 0, ready: r.ready || 0, pending: r.pending || 0, working: r.working || 0, failed: r.failed || 0, venues: v.n, ratings: rt.n, last };
}

// ---------- Видача рекомендацій і оцінки ----------
const bayes = v => (v.r_sum + 4 * 5) / (v.r_cnt + 5);           // середня з «апріорною» четвіркою: нових закладів не штрафуємо
const hash = s => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
async function cityId(env, country, name) {
  const c = await env.DB.prepare('SELECT t.id AS id, t.status AS status, t.venues_count AS n, t.lat AS lat, t.lon AS lon FROM venue_cities c JOIN venue_cities t ON t.id = COALESCE(c.alias_of, c.id) WHERE c.key = ?').bind(cityKey(country, name)).first();
  return c ? { id: c.id, status: c.status, n: c.n, lat: c.lat, lon: c.lon } : null;
}

/** До 3 закладів категорії: найкращі за (оцінки користувачів + повнота даних OSM), з варіативністю за учасником/днем. Порожньо, якщо база міста ще не готова. */
export async function venuePicks(env, { country, city, cat, seedKey, lang = 'uk' }) {
  const c = await cityId(env, country, city); if (!c || !cat || (c.status !== 'ready' && !(c.n > 0))) return [];
  const { results } = await env.DB.prepare('SELECT id, name, address, prior, r_sum, r_cnt, lat, lon, hours FROM venues WHERE city_id = ? AND cat = ?').bind(c.id, cat).all();
  const ok = results.filter(v => !(v.r_cnt >= 5 && v.r_sum / v.r_cnt < 3));
  ok.sort((a, b) => (bayes(b) + b.prior * 0.35) - (bayes(a) + a.prior * 0.35));
  const top = ok.slice(0, 9).map(v => ({ v, k: hash(seedKey + ':' + v.id) })).sort((a, b) => a.k - b.k).slice(0, 3).map(x => x.v);
  return top.sort((a, b) => bayes(b) - bayes(a)).map(v => ({ id: v.id, name: v.name, address: v.address || '', km: c.lat != null && v.lat != null ? Math.round(dist(v.lat, v.lon, c.lat, c.lon) * 10) / 10 : null, hours: formatHours(v.hours, lang), rating: v.r_cnt >= 3 ? Math.round(v.r_sum / v.r_cnt * 10) / 10 : null, count: v.r_cnt,
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
