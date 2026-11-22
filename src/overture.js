// Збагачення бази закладів відкритими даними Overture Maps (places): рівень достовірності (confidence) як ознака популярності й актуальності,
// статус «працює/закрито», нові заклади, яких ще немає в OpenStreetMap. Чисті функції + запис у D1 (без мережі).
// Дані Overture Maps Foundation (places) поширюються за відкритою ліцензією CDLA Permissive 2.0.
import { dist, RADIUS } from './venues.js';

const KEEP_OV = 40;
/** Категорія Overture (taxonomy.primary) → наша категорія. Порядок важливий: перша відповідність. */
const OV_MAP = [
  [/coffee_roast|coffee_store|coffee_shop_retail/, 'coffee'], [/^(tea_room|tea_house|tea_shop|tea_store)/, 'tea'],
  [/(^|_)(cafe|coffee_shop|internet_cafe|cat_cafe)($|_)/, 'cafe'],
  [/bakery|patisserie|chocolatier|dessert|confectioner|candy|ice_cream|gelato|donut/, 'pastry'],
  [/(^|_)(pub|bar|cocktail_bar|wine_bar|beer_bar|sports_bar|lounge|beer_garden|gastropub|irish_pub)($|_)|(_bar|_pub)$/, 'bar'],
  [/restaurant|diner|bistro|eatery|steakhouse|brasserie|trattoria|pizzeria|sushi|ramen|food_court|buffet|noodle|burger|kebab|bbq/, 'restaurant'],
  [/movie_theater|cinema/, 'cinema'], [/(^|_)(theatre|theater|performing_arts|concert_hall|opera|comedy_club|cultural_center|arts_centre)/, 'theatre'],
  [/museum|art_gallery/, 'museum'], [/(^|_)(park|national_park|city_park|dog_park)$|^park$/, 'park'], [/scenic_lookout|viewpoint|observation_deck/, 'viewpoint'],
  [/bowling/, 'bowling'], [/pool_hall|billiard/, 'billiards'], [/swimming_pool|water_park|aquatic/, 'pool'], [/(^|_)(spa|day_spa|massage|sauna|hot_spring|thermal)/, 'spa'],
  [/ice_skating|skating_rink/, 'rink'], [/climbing/, 'climbing'], [/yoga|pilates/, 'yoga'], [/church|cathedral|monastery/, 'church'], [/botanical|garden$/, 'garden'],
  [/(^|_)(castle|fort|fortress)($|_)/, 'castle'], [/book_store|bookstore|bookshop|book_shop/, 'books'], [/florist|flower/, 'florist'], [/farmers_market|flea_market|street_market|^market$/, 'market'],
  [/animal_shelter/, 'shelter'], [/gift_shop|souvenir/, 'gift'], [/wine_shop|wine_store|wine_wholesale|winery/, 'wine'], [/liquor_store|beer_store|craft_beer/, 'beer'], [/cheese/, 'cheese'],
  [/photograph|photo_/, 'photo'], [/jewel/, 'jewelry'], [/toy_store|game_store|hobby/, 'toys'], [/cosmetic|perfum|beauty_supply/, 'beauty']
];
export const catOfOverture = tp => { const s = String(tp || '').toLowerCase(); for (const [re, c] of OV_MAP) if (re.test(s)) return c; return null; };

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const tokens = s => norm(s).split(' ').filter(t => t.length >= 3);
/** Збіг назв: хоч одне слово (від 3 літер) однієї назви міститься в іншій. Різні алфавіти (кирилиця/латиниця) тут не збігаються: тоді вирішує відстань. */
export const nameSim = (a, b) => { const A = tokens(a), B = norm(b); return A.some(t => B.includes(t)) || tokens(b).some(t => norm(a).includes(t)); };
export const isClosedStatus = s => /closed/i.test(String(s || ''));

/** Прямокутник пошуку навколо центру міста (для DuckDB): [west, south, east, north]. */
export function cityBox(lat, lon, radiusM = RADIUS) {
  const dLat = radiusM / 111200, dLon = radiusM / (111200 * Math.cos(lat * Math.PI / 180));
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
}

/**
 * Зіставляє заклади міста з Overture і записує результат:
 *  - збіг (та сама категорія, ≤ 60 м, або ≤ 150 м зі схожою назвою) → ov_state 'match' + confidence;
 *  - заклад OSM без пари в місті з гарною покриттям Overture (≥ 100 закладів) → 'miss' (можливо, закрився);
 *  - у Overture закритий → 'closed' (не показуємо);
 *  - заклад є лише в Overture → додаємо як новий (osm = 'ov:<id>', ov_state 'ov').
 */
export async function enrichCity(env, c, items, now = Date.now()) {
  const { results: venues } = await env.DB.prepare('SELECT id, osm, cat, name, lat, lon FROM venues WHERE city_id = ?').bind(c.id).all();
  const osmv = venues.filter(v => !String(v.osm).startsWith('ov:'));
  const ov = (items || []).map(x => ({ ...x, cat: catOfOverture(x.tp), conf: Number(x.conf) || 0 })).filter(x => x.cat && x.name && isFinite(x.lat) && isFinite(x.lon));
  const live = ov.filter(x => !isClosedStatus(x.st)).sort((a, b) => b.conf - a.conf), dead = ov.filter(x => isClosedStatus(x.st));
  const byCat = {}; for (const v of osmv) (byCat[v.cat] ||= []).push(v);
  const upd = new Map(), used = new Set(), only = [];
  const nearest = (p, pool, maxM) => { let best = null, bd = Infinity; for (const v of pool || []) { if (used.has(v.id)) continue; const d = dist(p.lat, p.lon, v.lat, v.lon) * 1000; if (d < bd && (d <= 60 || (d <= maxM && nameSim(p.name, v.name)))) { best = v; bd = d; } } return best; };
  for (const p of live) { const v = nearest(p, byCat[p.cat], 150); if (v) { used.add(v.id); upd.set(v.id, { conf: p.conf, state: 'match' }); } else only.push(p); }
  for (const p of dead) { const v = nearest(p, byCat[p.cat], 100); if (v) { used.add(v.id); upd.set(v.id, { conf: p.conf, state: 'closed' }); } }
  const covered = live.length >= 100;                                          // у місті Overture добре покриває: відсутність пари — підозра на закриття
  for (const v of osmv) if (!upd.has(v.id) && covered) upd.set(v.id, { conf: null, state: 'miss' });
  const st = [];
  for (const [id, u] of upd) st.push(env.DB.prepare('UPDATE venues SET ov_conf = ?, ov_state = ? WHERE id = ?').bind(u.conf, u.state, id));
  // нові заклади лише з Overture: до KEEP_OV найдостовірніших у кожній категорії
  const perCat = {}; let added = 0;
  for (const p of only) {
    const n = (perCat[p.cat] = (perCat[p.cat] || 0) + 1); if (n > KEEP_OV) continue;
    const centrality = Math.max(0, 1 - dist(p.lat, p.lon, c.lat, c.lon) / (RADIUS / 1000)) * 1.5;
    const prior = Math.round((p.conf * 3 + (p.web ? 0.7 : 0) + centrality) * 100) / 100;
    st.push(env.DB.prepare("INSERT INTO venues (city_id, osm, cat, name, address, lat, lon, prior, hours, edited, seen_at, ov_conf, ov_state) VALUES (?,?,?,?,?,?,?,?,NULL,NULL,?,?, 'ov') ON CONFLICT(city_id, osm, cat) DO UPDATE SET name = excluded.name, lat = excluded.lat, lon = excluded.lon, prior = excluded.prior, seen_at = excluded.seen_at, ov_conf = excluded.ov_conf, ov_state = 'ov'")
      .bind(c.id, 'ov:' + String(p.id).slice(0, 40), p.cat, String(p.name).slice(0, 90), '', p.lat, p.lon, prior, now, p.conf)); added++;
  }
  for (let i = 0; i < st.length; i += 100) await env.DB.batch(st.slice(i, i + 100));
  // нові з Overture, яких більше немає в поточному релізі й без оцінок, прибираємо
  await env.DB.prepare("DELETE FROM venues WHERE city_id = ? AND osm LIKE 'ov:%' AND seen_at < ? AND r_cnt = 0").bind(c.id, now).run();
  await env.DB.prepare('UPDATE venue_cities SET ov_at = ? WHERE id = ?').bind(now, c.id).run();
  return { matched: [...upd.values()].filter(u => u.state === 'match').length, missing: [...upd.values()].filter(u => u.state === 'miss').length, closed: [...upd.values()].filter(u => u.state === 'closed').length, added, ovTotal: ov.length };
}
