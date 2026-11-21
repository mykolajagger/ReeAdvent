import assert from 'node:assert/strict';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { makeDb } from './d1.js';
import { handle } from '../src/api.js';
import { runVenues, venuePicks, rateVenue, ensureCity, catOfQuery, catOfGift, formatHours, cityKey, overpassQuery, pickVenues, venueStats, CATS } from '../src/venues.js';
import { TOP_CITIES } from '../src/top_cities.js';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = makeDb(root), raw = db._raw;
const env = { DB: db, DEV: '1', CRON_SECRET: 'c'.repeat(24), BASE_URL: 'http://x', PAYMENT_MODE: 'stub', EMAIL_MODE: 'stub', PRICE_UAH: '400', NOW_OVERRIDE: '2026-11-20T10:00:00Z' };

// ----- категорії запитів
assert.equal(catOfQuery('кав’ярня Львів'), 'cafe'); assert.equal(catOfQuery('театр драми Київ'), 'theatre'); assert.equal(catOfQuery('ресторан української кухні X'), 'restaurant');
assert.equal(catOfQuery('майстер-клас кераміка X'), null); assert.equal(catOfQuery('ліс X прогулянка'), 'park'); assert.equal(catOfQuery('жива музика X'), 'bar');
assert.equal(cityKey('ua', 'Ľviv'), 'UA|lviv'); assert(TOP_CITIES.length > 280 && TOP_CITIES.filter(c => c[0] === 'UA').length >= 24);
assert(!TOP_CITIES.some(c => ['Donetsk', 'Luhansk', 'Simferopol'].includes(c[1])), 'окуповані міста не в базі');
const q = overpassQuery(49.84, 24.03); assert(q.includes('"amenity"="cafe"') && q.includes('around:8000,49.84,24.03') && q.includes('"access"!~'), q.slice(0, 200));

// ----- подарунки: де купити; години роботи
assert.equal(catOfGift('обсмажка кави {city}'), 'coffee'); assert.equal(catOfGift('винна крамниця {city}'), 'wine'); assert.equal(catOfGift('срібний кулон'), 'jewelry'); assert.equal(catOfGift('кав’ярня {city}'), 'cafe'); assert.equal(catOfGift('плед флісовий'), null);
assert.equal(formatHours('Mo-Fr 09:00-18:00; Sa 10:00-16:00; Su off'), 'Пн–Пт 09:00–18:00; Сб 10:00–16:00; Нд вихідний'); assert.equal(formatHours('24/7'), 'цілодобово'); assert.equal(formatHours('Mo-Su 08:00-22:00', 'en'), 'Mon–Sun 08:00–22:00'); assert.equal(formatHours(''), '');
assert(formatHours('Mo 09:00-10:00; Tu 09:00-10:00; We 09:00-10:00; Th 09:00-10:00; Fr 09:00-10:00; Sa 09:00-10:00').length <= 71);

// ----- відбір із відповіді Overpass
const el = (id, tags, lat = 49.84, lon = 24.03) => ({ type: 'node', id, lat, lon, tags });
const picked = pickVenues([el(1, { amenity: 'cafe', name: 'Копальня', website: 'x', opening_hours: '24/7' }), el(2, { amenity: 'cafe', name: 'Нова' }, 49.9, 24.1), el(3, { amenity: 'cafe' }), el(4, { tourism: 'museum', name: 'Музей', wikidata: 'Q1' }),
  { type: 'way', id: 5, center: { lat: 49.841, lon: 24.031 }, tags: { leisure: 'swimming_pool', access: 'private', name: 'Приватний' } }, el(6, { leisure: 'swimming_pool', name: 'Басейн' })], 49.84, 24.03);
assert.deepEqual(picked.filter(p => p.cat === 'cafe').map(p => p.name), ['Копальня', 'Нова'], 'безіменні відкинуто, багатші тегами вище');
assert.deepEqual(picked.filter(p => p.cat === 'pool').map(p => p.name), ['Басейн'], 'приватні відкинуто');
assert.equal(picked.filter(p => p.cat === 'museum').length, 1);
const hv = pickVenues([el(11, { shop: 'coffee', name: 'Roastery', opening_hours: 'Mo-Su 09:00-20:00' })], 49.84, 24.03); assert.equal(hv[0].cat, 'coffee'); assert.equal(hv[0].hours, 'Mo-Su 09:00-20:00');

// ----- мок мережі: Nominatim + Overpass
let calls = { nom: 0, op: 0 }, failOverpass = 0;
const cafes = Array.from({ length: 40 }, (_, i) => el(100 + i, { amenity: 'cafe', name: 'Кав’ярня ' + i, ...(i < 5 ? { website: 'w' } : {}) }, 49.84 + i * 0.0005, 24.03));
const mockFetch = async (url, init) => {
  const u = String(url);
  if (u.includes('nominatim')) { calls.nom++; const city = decodeURIComponent(u.split('q=')[1]); return new Response(JSON.stringify(city === 'Нікуди' ? [] : [{ lat: '49.8397', lon: '24.0297' }]), { status: 200 }); }
  if (u.includes('overpass')) { calls.op++; if (failOverpass > 0) { failOverpass--; return new Response('busy', { status: 429 }); } return new Response(JSON.stringify({ elements: [...cafes, el(900, { tourism: 'museum', name: 'Музей Лева' }), el(901, { shop: 'coffee', name: 'Обсмажка Лева', opening_hours: 'Mo-Fr 09:00-18:00' }, 49.85, 24.04)] }), { status: 200 }); }
  throw new Error('unexpected ' + u);
};

// ----- замовлення з новим містом → пріоритетна черга
await ensureCity(env, 'UA', 'Жовква'); await ensureCity(env, 'UA', 'жовква');
assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM venue_cities WHERE key = 'UA|жовква'").get().n, 1, 'без дублів');
const r1 = await runVenues(env, { fetchImpl: mockFetch, now: Date.parse('2026-11-20T10:00:00Z') });
assert.equal(r1.seeded, true); assert.equal(r1.city, 'UA|жовква', 'нове місто клієнта — першим, перед найбільшими'); assert(['alias', 'ready'].includes(r1.status));
// Жовква геокодується в ті самі координати, що й Lviv у топ-списку → alias на Lviv, Lviv піднято в пріоритет
const lv = raw.prepare("SELECT * FROM venue_cities WHERE key = 'UA|lviv'").get(); assert(lv);
const zh = raw.prepare("SELECT * FROM venue_cities WHERE key = 'UA|жовква'").get();
if (zh.alias_of) { assert.equal(zh.alias_of, lv.id); assert.equal(lv.priority, 1); assert.equal((await venuePicks(env, { country: 'UA', city: 'Жовква', cat: 'cafe', seedKey: 's' })).length, 0, 'ціль ще не готова'); }
const r2 = await runVenues(env, { fetchImpl: mockFetch }); assert.equal(r2.city, 'UA|lviv'); assert.equal(r2.status, 'ready'); assert(r2.venues >= 21);
assert(raw.prepare("SELECT COUNT(*) AS n FROM venues WHERE city_id = ? AND cat = 'cafe'").get(lv.id).n === 20, 'не більше 20 на категорію');

// ----- видача: аліас і місто-ціль
let picks = await venuePicks(env, { country: 'UA', city: 'Жовква', cat: 'cafe', seedKey: 'm1:1' });
assert.equal(picks.length, 3); assert(picks.every(p => p.id && p.url.includes('google.com/maps/search') && p.source === 'osm' && p.rating === null));
assert.equal((await venuePicks(env, { country: 'UA', city: 'Жовква', cat: 'planetarium', seedKey: 's' })).length, 0);
assert.equal((await venuePicks(env, { country: 'UA', city: 'Невідоме', cat: 'cafe', seedKey: 's' })).length, 0);

const gp = await venuePicks(env, { country: 'UA', city: 'Жовква', cat: 'coffee', seedKey: 'g:1' });
assert.equal(gp.length, 1); assert.equal(gp[0].hours, 'Пн–Пт 09:00–18:00'); assert(gp[0].km > 0.5 && gp[0].km < 3, 'відстань від центру, км: ' + gp[0].km);

// ----- оцінки
const vid = picks[0].id;
for (let i = 1; i <= 4; i++) assert.equal((await rateVenue(env, { memberId: 'u' + i, country: 'UA', city: 'Жовква', venueId: vid, stars: 5 })).ok, true);
assert.equal((await rateVenue(env, { memberId: 'u1', country: 'UA', city: 'Жовква', venueId: vid, stars: 3 })).ok, true, 'повторна оцінка замінює');
let v = raw.prepare('SELECT r_sum, r_cnt FROM venues WHERE id = ?').get(vid); assert.equal(v.r_cnt, 4); assert.equal(v.r_sum, 5 * 3 + 3);
assert.equal((await rateVenue(env, { memberId: 'u9', country: 'UA', city: 'Жовква', venueId: vid, stars: 6 })).error, 'bad_stars');
assert.equal((await rateVenue(env, { memberId: 'u9', country: 'PL', city: 'Warsaw', venueId: vid, stars: 5 })).error, 'not_found', 'лише заклади свого міста');
picks = await venuePicks(env, { country: 'UA', city: 'Жовква', cat: 'cafe', seedKey: 'x' }); const mine = picks.find(p => p.id === vid);
if (mine) { assert.equal(mine.rating, 4.5); assert.equal(mine.count, 4); }
// низька оцінка (≥5 голосів, середня <3) виключає заклад
for (let i = 1; i <= 5; i++) await rateVenue(env, { memberId: 'bad' + i, country: 'UA', city: 'Жовква', venueId: picks.find(p => p.id !== vid).id, stars: 1 });
const badId = picks.find(p => p.id !== vid).id;
for (const s of ['a', 'b', 'c', 'd', 'e', 'f']) assert(!(await venuePicks(env, { country: 'UA', city: 'Жовква', cat: 'cafe', seedKey: s })).some(p => p.id === badId), 'погано оцінений прихований');

// ----- помилки: повтор, потім failed; геокодування не знайшло
failOverpass = 99; await ensureCity(env, 'PL', 'Zakopane'); raw.prepare("UPDATE venue_cities SET lat = 49.3, lon = 19.9 WHERE key = 'PL|zakopane'").run();
let rr = await runVenues(env, { fetchImpl: mockFetch }); assert.equal(rr.city, 'PL|zakopane'); assert.equal(rr.status, 'retry');
await runVenues(env, { fetchImpl: mockFetch }); rr = await runVenues(env, { fetchImpl: mockFetch }); assert.equal(rr.status, 'failed'); failOverpass = 0;
await ensureCity(env, 'UA', 'Нікуди'); rr = await runVenues(env, { fetchImpl: mockFetch }); assert.equal(rr.city, 'UA|нікуди'); assert.equal(rr.status, 'failed');

// ----- нічне тижневе оновлення: лише вночі й коли дані старші за 7 днів
raw.prepare("UPDATE venue_cities SET status = 'ready', fetched_at = ? WHERE status = 'pending'").run(Date.parse('2026-11-20T10:00:00Z')); // решта «готові»
raw.prepare("UPDATE venue_cities SET fetched_at = ? WHERE id = ?").run(Date.parse('2026-11-01T00:00:00Z'), lv.id);
assert.equal((await runVenues(env, { fetchImpl: mockFetch, now: Date.parse('2026-11-20T12:00:00Z') })).idle, true, 'вдень не оновлюємо');
const rf = await runVenues(env, { fetchImpl: mockFetch, now: Date.parse('2026-11-20T02:00:00Z') }); assert(rf.city && rf.status === 'ready', JSON.stringify(rf));
const st = await venueStats(env); assert(st.cities > 280 && st.venues > 0 && st.ratings >= 5);

// ----- cron-ендпоінт захищений секретом
const hit = (secret) => handle(new Request('http://x/api/cron/venues', { method: 'POST', headers: secret ? { 'x-cron-secret': secret } : {} }), env);
assert.equal((await hit(null)).status, 404); assert.equal((await hit('wrong'.repeat(5))).status, 404);
raw.prepare('UPDATE venue_cities SET fetched_at = ?').run(Date.now() + 864e5 * 400); // нічого не потребує оновлення: реальну мережу не чіпаємо
const okRes = await hit(env.CRON_SECRET); assert.equal(okRes.status, 200); assert.equal((await okRes.json()).ok, true);
// ----- кілька міст за запуск і керування чергою з адмінки
raw.prepare("UPDATE venue_cities SET status = 'ready', fetched_at = ?").run(Date.now() + 864e5 * 400);
for (const n of ['Сколе', 'Стрий', 'Дрогобич']) { await ensureCity(env, 'UA', n); raw.prepare("UPDATE venue_cities SET lat = 49.0 + ?, lon = 23.5 WHERE key = ?").run(Math.random() * 2, cityKey('UA', n)); }
env.VENUES_PER_RUN = '2';
let multi = await runVenues(env, { fetchImpl: mockFetch }); assert.equal(multi.cities.length, 2, JSON.stringify(multi));
env.VENUES_PER_RUN = '99'; multi = await runVenues(env, { fetchImpl: mockFetch }); assert.equal((multi.cities || [multi]).length, 1, 'лишилось одне місто'); delete env.VENUES_PER_RUN;
const { venueProblems, retryCities, queueCity } = await import('../src/venues.js');
assert(await queueCity(env, 'pl', 'Zakopane2')); assert(!(await queueCity(env, 'POL', 'x'))); assert(!(await queueCity(env, 'UA', '')));
raw.prepare("UPDATE venue_cities SET status = 'failed', error = 'geocode_not_found' WHERE key = 'UA|нікуди'").run();
const pr = await venueProblems(env); assert(pr.some(p => p.name === 'Нікуди' && p.status === 'failed'), JSON.stringify(pr));
assert((await retryCities(env, null)) >= 1); assert.equal(raw.prepare("SELECT status FROM venue_cities WHERE key = 'UA|нікуди'").get().status, 'pending');
console.log('VENUES OK');
