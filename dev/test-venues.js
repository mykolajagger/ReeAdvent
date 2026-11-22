import assert from 'node:assert/strict';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { makeDb } from './d1.js';
import { handle } from '../src/api.js';
import { runVenues, venuePicks, rateVenue, ensureCity, catOfQuery, catOfGift, formatHours, cityKey, overpassProbe, setVenuesPaused, catalogCountries, catalogCities, catalogCity, dedupeByName, reportVenue, setVenueHidden, mapUrl, isClosedTags, overpassQueries, CAT_GROUPS, pickVenues, venueStats, CATS } from '../src/venues.js';
import { TOP_CITIES } from '../src/top_cities.js';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = makeDb(root), raw = db._raw;
const env = { DB: db, DEV: '1', CRON_SECRET: 'c'.repeat(24), BASE_URL: 'http://x', PAYMENT_MODE: 'stub', EMAIL_MODE: 'stub', PRICE_UAH: '400', NOW_OVERRIDE: '2026-11-20T10:00:00Z' };

// ----- категорії запитів
assert.equal(catOfQuery('кав’ярня Львів'), 'cafe'); assert.equal(catOfQuery('театр драми Київ'), 'theatre'); assert.equal(catOfQuery('ресторан української кухні X'), 'restaurant');
assert.equal(catOfQuery('майстер-клас кераміка X'), null); assert.equal(catOfQuery('ліс X прогулянка'), 'park'); assert.equal(catOfQuery('жива музика X'), 'bar');
assert.equal(cityKey('ua', 'Ľviv'), 'UA|lviv'); assert(TOP_CITIES.length > 280 && TOP_CITIES.filter(c => c[0] === 'UA').length >= 24);
assert(!TOP_CITIES.some(c => ['Donetsk', 'Luhansk', 'Simferopol'].includes(c[1])), 'окуповані міста не в базі');
const qs = overpassQueries(49.84, 24.03), q = qs.join('\n'); assert.equal(qs.length, 7); assert(q.includes('"amenity"="cafe"') && q.includes('"access"!~') && q.includes('timeout:30') && !q.includes('around'), q.slice(0, 300)); assert.deepEqual([...CAT_GROUPS.flat()].sort(), Object.keys(CATS).sort(), 'кожна категорія входить рівно в одну групу');

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
assert(raw.prepare("SELECT COUNT(*) AS n FROM venues WHERE city_id = ? AND cat = 'cafe'").get(lv.id).n === 40, "не більше 40 на категорію");

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
failOverpass = 9999; await ensureCity(env, 'PL', 'Zakopane'); raw.prepare("UPDATE venue_cities SET lat = 49.3, lon = 19.9 WHERE key = 'PL|zakopane'").run();
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
// ----- паралельні запуски не беруть те саме місто
raw.prepare("UPDATE venue_cities SET status = 'ready', fetched_at = ?").run(Date.now() + 864e5 * 400);
for (const n of ['Яремче', 'Косів']) { await ensureCity(env, 'UA', n); raw.prepare('UPDATE venue_cities SET lat = 48.4 + ?, lon = 24.5 WHERE key = ?').run(Math.random(), cityKey('UA', n)); }
const par = await Promise.all([runVenues(env, { fetchImpl: mockFetch }), runVenues(env, { fetchImpl: mockFetch })]);
assert.deepEqual(par.map(x => x.city).sort(), ['UA|косів', 'UA|яремче'], JSON.stringify(par));
assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM venue_cities WHERE status = 'working'").get().n, 0, 'захоплення знято');
// ----- часткова відповідь: одна група запитів не відповіла, місто все одно готове
raw.prepare("UPDATE venue_cities SET status = 'ready', fetched_at = ?").run(Date.now() + 864e5 * 400);
await ensureCity(env, 'UA', 'Косів2'); raw.prepare("UPDATE venue_cities SET lat = 48.3, lon = 25.0 WHERE key = ?").run(cityKey('UA', 'Косів2'));
let n = 0; const flaky = async (url, init) => String(url).includes('overpass') && ++n >= 3 && n <= 8 ? new Response('x', { status: 504 }) : mockFetch(url, init); // 3–8-й виклики: група 3 (три дзеркала в обох колах)
const part = await runVenues(env, { fetchImpl: flaky }); assert.equal(part.status, 'ready'); assert.deepEqual(part.failedGroups, [3], JSON.stringify(part));
assert.match(raw.prepare("SELECT error FROM venue_cities WHERE key = 'UA|косів2'").get().error, /partial/);
// ----- діагностика Overpass для адмінки
const pr2 = await overpassProbe(async (u, i) => String(u).includes('kumi') ? new Response('Too Many Requests', { status: 429 }) : new Response(JSON.stringify({ elements: [1, 2, 3] }), { status: 200 }));
assert.equal(pr2.length, 3); assert.equal(pr2.find(x => x.mirror.includes('kumi')).small.status, 429); assert.equal(pr2.find(x => x.mirror.includes('overpass-api')).group1.n, 3);
const adminHit = await handle(new Request('http://x/api/admin/venues/test', { method: 'POST', headers: { 'x-admin': '1' } }), env); assert([401, 403].includes(adminHit.status), 'лише для адміністраторів: ' + adminHit.status);
await setVenuesPaused(env, true); assert.equal((await runVenues(env, { fetchImpl: mockFetch })).paused, true); assert.equal((await venueStats(env)).paused, true); await setVenuesPaused(env, false); assert.equal((await venueStats(env)).paused, false);
// ----- каталог для адмінки
const cc2 = await catalogCountries(env); assert(cc2.some(x => x.country === 'UA' && x.cities >= 1), JSON.stringify(cc2.slice(0, 2)));
const uaCities = await catalogCities(env, 'ua'); assert(uaCities.length > 5 && uaCities[0].venues_count >= uaCities.at(-1).venues_count, 'міста відсортовані за кількістю закладів');
const withV = uaCities.find(x => x.venues_count > 0 && !x.alias_of), detail = await catalogCity(env, withV.id); assert(detail.venues.length > 0 && detail.city.name === withV.name && detail.venues[0].cat && detail.venues.every(v => v.name));
assert.equal(await catalogCity(env, 99999999), null);
const al = uaCities.find(x => x.alias_of); if (al) { const d2 = await catalogCity(env, al.id); assert(d2.alias && d2.alias.id === al.alias_of, 'аліас показує заклади цільового міста'); }
for (const p of ['/api/admin/venues/countries', '/api/admin/venues/cities?country=UA', '/api/admin/venues/city/1']) assert([401, 403].includes((await handle(new Request('http://x' + p, { headers: { 'x-admin': '1' } }), env)).status), 'лише для адміністраторів: ' + p);
// ----- закриті заклади, свіжість, нові; посилання; скарги; приховування
const nowMs = Date.now(), iso = ms => new Date(ms).toISOString(), yr = 365.25 * 864e5, tcase = (id, tags, extra = {}) => ({ type: 'node', id, lat: 49.84, lon: 24.03, tags: { amenity: 'pub', name: 'Pub ' + id, ...tags }, ...extra });
assert(isClosedTags({ disused: 'yes' }) && isClosedTags({ abandoned: 'yes' }) && isClosedTags({ opening_hours: 'off' }) && isClosedTags({ end_date: '2020-05-01' }) && !isClosedTags({ end_date: '2999-01-01' }) && !isClosedTags({ opening_hours: 'Mo-Su 10:00-22:00' }));
const fr = pickVenues([tcase(1, { disused: 'yes' }), tcase(2, { opening_hours: 'off' }), tcase(3, { end_date: '2019' }),
  tcase(10, { website: 'x' }, { timestamp: iso(nowMs - 0.3 * yr) }), tcase(11, { website: 'x' }, { timestamp: iso(nowMs - 8 * yr) }), tcase(12, { website: 'x', check_date: iso(nowMs - 0.5 * yr).slice(0, 10) }, { timestamp: iso(nowMs - 9 * yr) }),
  tcase(13, { website: 'x', start_date: iso(nowMs - 0.4 * yr).slice(0, 7) }, { timestamp: iso(nowMs - 3 * yr) })], 49.84, 24.03);
assert.deepEqual(fr.map(x => x.osm).sort(), ['n10', 'n11', 'n12', 'n13'], 'закриті відсіяні');
const pri = Object.fromEntries(fr.map(x => [x.osm, x.prior])); assert(pri.n10 > pri.n11 + 1, 'нещодавно редагований вище за давній: ' + JSON.stringify(pri)); assert(pri.n12 > pri.n11 + 1, 'check_date рятує давній об\'єкт'); assert(pri.n13 > pri.n11 + 1, 'недавно відкритий (start_date) отримує бонус');
assert.equal(fr.find(x => x.osm === 'n10').edited > 0, true);
assert.equal(mapUrl({ name: 'Клепач', address: 'вул. Корзо 1', lat: 48.6208, lon: 22.2879 }, 'Ужгород'), 'https://www.google.com/maps/search/%D0%9A%D0%BB%D0%B5%D0%BF%D0%B0%D1%87%20%D0%B2%D1%83%D0%BB.%20%D0%9A%D0%BE%D1%80%D0%B7%D0%BE%201/@48.620800,22.287900,18z');
assert(mapUrl({ name: 'X' }, 'Київ').includes('api=1&query='), 'без координат — запасне посилання');
// скарги: після 2 різних користувачів заклад зникає з видачі; адмін може повернути
const rv = raw.prepare("SELECT v.id AS id, c.country AS country, c.name AS city, v.cat AS cat FROM venues v JOIN venue_cities c ON c.id = v.city_id WHERE c.name = 'Lviv' OR c.name = 'Жовква' LIMIT 1").get() || raw.prepare("SELECT v.id AS id, c.country AS country, c.name AS city, v.cat AS cat FROM venues v JOIN venue_cities c ON c.id = v.city_id WHERE c.alias_of IS NULL AND v.hidden = 0 LIMIT 1").get();
assert((await reportVenue(env, { memberId: 'r1', country: rv.country, city: rv.city, venueId: rv.id })).ok);
assert((await reportVenue(env, { memberId: 'r1', country: rv.country, city: rv.city, venueId: rv.id })).ok, 'повторна скарга того самого — без ефекту');
assert.equal(raw.prepare('SELECT closed_reports AS n FROM venues WHERE id = ?').get(rv.id).n, 1);
assert((await reportVenue(env, { memberId: 'r2', country: rv.country, city: rv.city, venueId: rv.id })).ok); assert.equal(raw.prepare('SELECT closed_reports AS n FROM venues WHERE id = ?').get(rv.id).n, 2);
const shown = async () => { const out = []; for (const s of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) out.push(...(await venuePicks(env, { country: rv.country, city: rv.city, cat: rv.cat, seedKey: s })).map(p => p.id)); return out; };
assert(!(await shown()).includes(rv.id), 'після двох скарг заклад не показується');
assert.equal((await reportVenue(env, { memberId: 'r3', country: 'PL', city: 'Nowhere', venueId: rv.id })).error, 'not_found');
await setVenueHidden(env, rv.id, false); assert.equal(raw.prepare('SELECT closed_reports AS n, hidden FROM venues WHERE id = ?').get(rv.id).n, 0, 'повернення скидає скарги');
await setVenueHidden(env, rv.id, true); assert(!(await shown()).includes(rv.id), 'прихований адміном не показується'); await setVenueHidden(env, rv.id, false);
assert((await catalogCity(env, raw.prepare('SELECT city_id AS c FROM venues WHERE id = ?').get(rv.id).c)).venues.every(v => 'hidden' in v && 'closed_reports' in v && 'edited' in v), 'каталог віддає прапорці');
// ----- дублі (точка й будівля того самого закладу)
const dd = dedupeByName([{ name: 'Lab Pub', lat: 48.6208, lon: 22.2879 }, { name: 'LAB  pub', lat: 48.6209, lon: 22.2880 }, { name: 'Lab Pub', lat: 48.7, lon: 22.4 }, { name: 'Labda', lat: 48.6208, lon: 22.2879 }]);
assert.deepEqual(dd.map(x => x.name), ['Lab Pub', 'Lab Pub', 'Labda'], 'близький дубль прибрано, однойменний далеко залишено');
const dupRows = pickVenues([{ type: 'node', id: 1, lat: 48.6208, lon: 22.2879, tags: { amenity: 'pub', name: 'Lab Pub', website: 'x' } }, { type: 'way', id: 2, center: { lat: 48.62082, lon: 22.28792 }, tags: { amenity: 'pub', name: 'Lab Pub' } }], 48.62, 22.29);
assert.equal(dupRows.length, 1); assert.equal(dupRows[0].osm, 'n1', 'лишається запис із вищим пріоритетом');
console.log('VENUES OK');
