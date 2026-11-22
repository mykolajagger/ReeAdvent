// Збагачення Overture: категорії, зіставлення з OSM, нові/закриті/«немає в Overture», вплив на видачу, захист від видалення при оновленні OSM.
import assert from 'node:assert/strict';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { makeDb } from './d1.js';
import { catOfOverture, nameSim, isClosedStatus, cityBox, enrichCity } from '../src/overture.js';
import { storeCityVenues, venuePicks, cityKey, ovAdj, dist } from '../src/venues.js';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), db = makeDb(root), raw = db._raw, env = { DB: db };

// категорії
for (const [tp, cat] of [['cafe', 'cafe'], ['coffee_shop', 'cafe'], ['pizza_restaurant', 'restaurant'], ['italian_restaurant', 'restaurant'], ['pub', 'bar'], ['cocktail_bar', 'bar'], ['movie_theater', 'cinema'], ['chocolatier', 'pastry'], ['bakery', 'pastry'], ['museum', 'museum'],
  ['art_museum', 'museum'], ['park', 'park'], ['bowling_alley', 'bowling'], ['yoga_studio', 'yoga'], ['coffee_roastery', 'coffee'], ['book_store', 'books'], ['florist', 'florist'], ['jewelry_store', 'jewelry'], ['church_cathedral', 'church'], ['day_spa', 'spa']]) assert.equal(catOfOverture(tp), cat, tp);
for (const tp of ['bank_or_credit_union', 'furniture_store', 'dental_clinic', 'hotel', 'warehouse', 'appliance_store', 'shopping_mall', '', null]) assert.equal(catOfOverture(tp), null, String(tp));
assert(nameSim('Pub House', 'The Pub House Uzhhorod')); assert(nameSim('Клепач', 'Паб Клепач')); assert(!nameSim('Клепач', 'Belfast Pub')); assert(!nameSim('Ab', 'Abc'), 'коротші за 3 літери не рахуються');
assert(isClosedStatus('closed') && isClosedStatus('permanently_closed') && isClosedStatus('temporarily_closed') && !isClosedStatus('open') && !isClosedStatus(null));
const box = cityBox(48.62, 22.29); assert(box[0] < 22.29 && box[2] > 22.29 && box[1] < 48.62 && box[3] > 48.62 && Math.abs(dist(48.62, box[0], 48.62, 22.29) - 6) < 0.1);

// місто з закладами OSM
raw.prepare("INSERT INTO venue_cities (key, country, name, lat, lon, status, requested_at, fetched_at) VALUES (?,?,?,?,?,?,?,?)").run(cityKey('UA', 'Uzhgorod'), 'UA', 'Uzhgorod', 48.6208, 22.2879, 'ready', 1, 1);
const city = raw.prepare('SELECT * FROM venue_cities').get(), now = Date.now();
const osmRows = [
  { osm: 'n1', cat: 'bar', name: 'Pub House', address: '', lat: 48.6210, lon: 22.2881, prior: 3, hours: null },        // є в Overture поруч → match
  { osm: 'n2', cat: 'bar', name: 'Клепач', address: '', lat: 48.6190, lon: 22.2850, prior: 3, hours: null },           // закрився: у Overture немає → miss
  { osm: 'n3', cat: 'cafe', name: 'Bloom Cafe', address: '', lat: 48.6225, lon: 22.2900, prior: 2, hours: null },      // у Overture позначений закритим → closed
  { osm: 'n4', cat: 'cafe', name: 'Нова кав’ярня', address: '', lat: 48.62, lon: 22.3, prior: 2, hours: null }];      // немає в Overture → miss
await storeCityVenues(env, city, osmRows, null, now - 1000);
const ovItems = [
  { id: 'a1', name: 'Pub House', tp: 'pub', conf: 0.995, st: null, lat: 48.62103, lon: 22.28812, web: 'x' },
  { id: 'a2', name: 'Bloom Cafe', tp: 'cafe', conf: 0.9, st: 'closed', lat: 48.62252, lon: 22.29003 },
  { id: 'a3', name: 'Ungweiser', tp: 'pub', conf: 0.995, st: null, lat: 48.6195, lon: 22.2905, web: 'y' },                // лише в Overture → додати
  { id: 'a4', name: 'Belfast Pub', tp: 'pub', conf: 0.99, st: null, lat: 48.6215, lon: 22.2800 },
  { id: 'a5', name: 'Банк', tp: 'bank_or_credit_union', conf: 0.99, st: null, lat: 48.62, lon: 22.29 },                    // не наша категорія
  { id: 'a6', name: 'Чужа кав’ярня', tp: 'cafe', conf: 0.95, st: null, lat: 49.5, lon: 23.5 }];                             // (далеко: відфільтрує індекс у скрипті; тут перевіряємо додавання)
// покриття < 100: «miss» не ставимо
let res = await enrichCity(env, city, ovItems.slice(0, 5), now);
assert.deepEqual([res.matched, res.closed, res.missing, res.added], [1, 1, 0, 2], JSON.stringify(res));
const st = id => raw.prepare('SELECT ov_state AS s, ov_conf AS c FROM venues WHERE osm = ?').get(id);
assert.deepEqual([st('n1').s, st('n3').s, st('n2').s], ['match', 'closed', null]); assert.equal(st('n1').c, 0.995);
assert.equal(st('ov:a3').s, 'ov'); assert(raw.prepare("SELECT prior FROM venues WHERE osm = 'ov:a3'").get().prior > 3, 'нові з Overture мають високий пріоритет');
assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM venues WHERE osm = 'ov:a5'").get().n, 0);
assert(raw.prepare('SELECT ov_at FROM venue_cities WHERE id = ?').get(city.id).ov_at >= now);

// добре покритий Overture: заклад OSM без пари стає «miss»
const many = Array.from({ length: 120 }, (_, i) => ({ id: 'z' + i, name: 'Заклад ' + i, tp: 'restaurant', conf: 0.9, st: null, lat: 48.6208 + (i % 10) * 0.002, lon: 22.2879 + (i % 12) * 0.002 }));
res = await enrichCity(env, city, [...ovItems.slice(0, 4), ...many], now + 10);
assert.equal(st('n2').s, 'miss'); assert.equal(st('n4').s, 'miss'); assert.equal(st('n1').s, 'match');
assert(raw.prepare("SELECT COUNT(*) AS n FROM venues WHERE osm LIKE 'ov:z%' AND cat = 'restaurant'").get().n === 40, 'не більше 40 нових на категорію');

// видача: підтверджений піднімається, «miss» опускається, закритий не показується
assert(ovAdj({ ov_state: 'match', ov_conf: 0.99 }) > 1.2 && ovAdj({ ov_state: 'miss' }) < 0 && ovAdj({}) === 0);
const shown = new Set(); for (const s of Array.from({ length: 30 }, (_, i) => 'k' + i)) for (const p of await venuePicks(env, { country: 'UA', city: 'Uzhgorod', cat: 'bar', seedKey: s })) shown.add(p.name);
assert(shown.has('Pub House') && shown.has('Ungweiser') && shown.has('Belfast Pub') && !shown.has('Клепач'), 'є 3 підтверджені: підозрілий «Клепач» не показується: ' + [...shown].join('|'));
const shownCafe = new Set(); for (const s of Array.from({ length: 20 }, (_, i) => 'c' + i)) for (const p of await venuePicks(env, { country: 'UA', city: 'Uzhgorod', cat: 'cafe', seedKey: s })) shownCafe.add(p.name);
assert(!shownCafe.has('Bloom Cafe'), 'закритий за Overture не показується');

// заклад OSM без пари в Overture, але нещодавно редагований, лишається в видачі (може бути новим)
raw.prepare("UPDATE venues SET edited = ? WHERE osm = 'n2'").run(Date.now() - 30 * 864e5);
const shown2 = new Set(); for (const s of Array.from({ length: 40 }, (_, i) => 'q' + i)) for (const p of await venuePicks(env, { country: 'UA', city: 'Uzhgorod', cat: 'bar', seedKey: s })) shown2.add(p.name);
assert(shown2.has('Клепач'), 'свіжо відредагований заклад без пари не відсікається: ' + [...shown2].join('|'));
raw.prepare("UPDATE venues SET edited = ? WHERE osm = 'n2'").run(Date.now() - 6 * 365 * 864e5);
const shown3 = new Set(); for (const s of Array.from({ length: 40 }, (_, i) => 'w' + i)) for (const p of await venuePicks(env, { country: 'UA', city: 'Uzhgorod', cat: 'bar', seedKey: s })) shown3.add(p.name);
assert(!shown3.has('Клепач'), 'давній без пари відсікається');

// оновлення з OSM не видаляє заклади з Overture й не стирає їхні позначки
await storeCityVenues(env, city, [{ osm: 'n1', cat: 'bar', name: 'Pub House', address: '', lat: 48.6210, lon: 22.2881, prior: 3, hours: null }], null, now + 100000);
assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM venues WHERE osm = 'ov:a3'").get().n, 1, 'ov-заклад пережив оновлення OSM'); assert.equal(st('n1').s, 'match', 'позначка збереглась');
assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM venues WHERE osm = 'n2'").get().n, 0, 'зниклий з OSM без оцінок видалено');
console.log('OVERTURE OK');
