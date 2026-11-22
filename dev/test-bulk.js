// Масове наповнення з вигрузок OSM: перевіряємо все, що не потребує мережі й osmium (вирази, пошук файлу, розбір, розкладання по містах, запис, черга).
import assert from 'node:assert/strict';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { makeDb } from './d1.js';
import { osmiumExpressions, findPbf, describeIndex, urlVariants, centerOf, parseFeature, CityIndex, queueCountries, queueCities } from '../src/bulk.js';
import { pickVenues, storeCityVenues, venuePicks, cityKey, dist } from '../src/venues.js';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), db = makeDb(root), raw = db._raw, env = { DB: db };

// ----- вирази osmium
const ex = osmiumExpressions(), exs = ex.join(' ');
assert(ex.every(e => e.startsWith('nwr/')), exs); assert(ex.some(e => /^nwr\/amenity=.*\bcafe\b.*\brestaurant\b/.test(e)), exs);
assert(exs.includes('nwr/shop=') && exs.includes('coffee') && exs.includes('nwr/tourism=museum,viewpoint') && exs.includes('nwr/building=cathedral,church') && exs.includes('nwr/historic=castle,fort'), exs);
assert(!exs.includes('access') && !exs.includes('!'), 'умови «крім» не потрапляють у фільтр');

// ----- індекс Geofabrik
const idx = { features: [
  { properties: { id: 'europe', name: 'Europe', urls: { pbf: 'https://x/europe.pbf' } } },
  { properties: { id: 'ukraine', 'iso3166-1:alpha2': ['UA'], urls: { pbf: 'https://x/ukraine.pbf' } } },
  { properties: { id: 'senegal-and-gambia', 'iso3166-1:alpha2': ['SN', 'GM'], urls: { pbf: 'https://x/sn-gm.pbf' } } },
  { properties: { id: 'gambia-only', 'iso3166-1:alpha2': ['GM'], urls: { pbf: 'https://x/gm.pbf' } } },
  { properties: { id: 'no-pbf', 'iso3166-1:alpha2': ['ZZ'], urls: {} } }] };
assert.deepEqual(findPbf(idx, 'UA'), { id: 'ukraine', url: 'https://x/ukraine.pbf', shared: false });
assert.equal(findPbf(idx, 'SN').shared, true); assert.equal(findPbf(idx, 'GM').id, 'gambia-only', 'вужча вигрузка має перевагу');
assert.equal(findPbf(idx, 'ZZ'), null); assert.equal(findPbf({ features: [{ properties: { id: 'europe/ukraine', name: 'Ukraine', urls: { pbf: 'https://x/u.pbf' } } }] }, 'UA', 'Ukraine').url, 'https://x/u.pbf', 'пошук за назвою, якщо немає кодів');
assert.equal(findPbf({ features: [{ properties: { id: 'ukraine', 'iso3166-1:alpha2': 'UA', urls: { pbf: 'https://x/u2.pbf' } } }] }, 'UA').url, 'https://x/u2.pbf', 'код рядком, а не масивом'); assert.equal(findPbf(idx, 'FR'), null); assert.equal(findPbf({}, 'UA'), null);

assert(describeIndex(idx).includes('з pbf 4'), describeIndex(idx));
const gccIdx = { features: [{ properties: { id: 'gcc-states', name: 'GCC States', urls: { pbf: 'https://x/asia/gcc-states-latest.osm.pbf' } } }, { properties: { id: 'israel-and-palestine', name: 'Israel and Palestine', urls: { pbf: 'https://x/asia/israel-and-palestine-latest.osm.pbf' } } }] };
assert.equal(findPbf(gccIdx, 'AE', 'United Arab Emirates').id, 'gcc-states'); assert.equal(findPbf(gccIdx, 'SA').id, 'gcc-states'); assert.equal(findPbf(gccIdx, 'IL', 'Israel').id, 'israel-and-palestine'); assert.equal(findPbf(gccIdx, 'AE').shared, true);
assert.deepEqual(urlVariants('https://d/europe/ukraine/ukraine-latest.osm.pbf'), ['https://d/europe/ukraine/ukraine-latest.osm.pbf', 'https://d/europe/ukraine-latest.osm.pbf']);
assert.deepEqual(urlVariants('https://d/asia/gcc-states-latest.osm.pbf'), ['https://d/asia/gcc-states-latest.osm.pbf']);

// ----- розбір рядків geojsonseq
assert.deepEqual(centerOf({ type: 'Point', coordinates: [24, 49] }), [24, 49]);
assert.deepEqual(centerOf({ type: 'Polygon', coordinates: [[[24, 49], [26, 49], [26, 51], [24, 51], [24, 49]]] }), [25, 50]);
assert.deepEqual(centerOf({ type: 'MultiPolygon', coordinates: [[[[0, 0], [2, 0], [2, 2], [0, 0]]], [[[4, 4], [6, 4], [6, 6], [4, 4]]]] }), [3, 3]);
assert.equal(centerOf(null), null); assert.equal(centerOf({ coordinates: [] }), null);
const line = (id, tags, geometry) => JSON.stringify({ type: 'Feature', id, properties: tags, geometry });
const pt = (lon, lat) => ({ type: 'Point', coordinates: [lon, lat] });
let e = parseFeature('\x1e' + line('n42', { amenity: 'cafe', name: 'Копальня' }, pt(24.03, 49.84)) + '\n');
assert.deepEqual([e.type, e.id, e.lat, e.lon, e.tags.name], ['node', 42, 49.84, 24.03, 'Копальня']);
assert.equal(parseFeature(line('w7', { amenity: 'cafe', name: 'X' }, { type: 'Polygon', coordinates: [[[1, 1], [3, 1], [3, 3], [1, 1]]] })).type, 'way');
assert.equal(parseFeature(line('a9', { shop: 'books', name: 'Y' }, pt(1, 1))).type, 'way');
assert.equal(parseFeature(line('r5', { leisure: 'park', name: 'P' }, pt(1, 1))).type, 'relation');
for (const bad of ['', '\x1e', '{не json', line('n1', { amenity: 'cafe' }, pt(1, 1)), line('n1', { name: 'A' }, null), line('zz', { name: 'A' }, pt(1, 1))]) assert.equal(parseFeature(bad), null, bad);

// ----- розкладання по містах
const cities = [{ id: 1, lat: 49.84, lon: 24.03 }, { id: 2, lat: 50.45, lon: 30.52 }, { id: 3, lat: 60.17, lon: 24.94 }];
const ci = new CityIndex(cities);
const el = (lat, lon) => ({ type: 'node', id: Math.round(lat * 1e5 + lon * 1e3), tags: { amenity: 'cafe', name: 'c' }, lat, lon });
assert.equal(ci.add(el(49.85, 24.04)), 1); assert.equal(ci.byCity.get(1).length, 1);
assert.equal(ci.add(el(50.2, 28)), 0, 'далеко від усіх міст');
assert.equal(ci.add(el(49.95, 24.03)), 0, 'за 12 км — поза радіусом 6 км');
assert.equal(ci.add(el(49.84, 24.03 + 5.5 / (111.2 * Math.cos(49.84 * Math.PI / 180)))), 1, 'на межі радіуса на схід');
const helsE = 24.94 + 5.9 / (111.2 * Math.cos(60.17 * Math.PI / 180)); assert(Math.abs(dist(60.17, helsE, 60.17, 24.94) - 5.9) < 0.1);
assert.equal(ci.add(el(60.17, helsE)), 1, 'на високій широті 0,1° довготи менше за радіус: сусідні клітинки перевіряються');
const overlap = new CityIndex([{ id: 10, lat: 50, lon: 30 }, { id: 11, lat: 50.02, lon: 30.02 }]); assert.equal(overlap.add(el(50.01, 30.01)), 2, 'заклад між двома близькими містами потрапляє в обидва');

// ----- від рядків до записів у базі
const now = Date.now();
const mk = (key, name, lat, lon, extra = {}) => { raw.prepare("INSERT INTO venue_cities (key, country, name, lat, lon, status, priority, requested_at, fetched_at) VALUES (?,?,?,?,?,?,?,?,?)").run(cityKey('UA', key), 'UA', name, lat, lon, extra.status || 'pending', extra.priority || 0, now, extra.fetched ?? null); return raw.prepare('SELECT * FROM venue_cities WHERE key = ?').get(cityKey('UA', key)); };
const lviv = mk('Lviv', 'Lviv', 49.84, 24.03), kyiv = mk('Kyiv', 'Kyiv', 50.45, 30.52, { priority: 1 }), empty = mk('Pustka', 'Pustka', 45, 33);
mk('Fresh', 'Fresh', 46, 30, { status: 'ready', fetched: now - 864e5 }); mk('Old', 'Old', 47, 31, { status: 'ready', fetched: now - 40 * 864e5 });
mk('Part', 'Part', 48, 32, { status: 'ready', fetched: now }); raw.prepare("UPDATE venue_cities SET error = 'partial: групи 1' WHERE key = ?").run(cityKey('UA', 'Part'));
mk('Alias', 'Alias', 49, 24, { status: 'pending' }); raw.prepare("UPDATE venue_cities SET alias_of = 1 WHERE key = ?").run(cityKey('UA', 'Alias'));
const feats = [
  line('n1', { amenity: 'cafe', name: 'Копальня', website: 'x', opening_hours: 'Mo-Su 09:00-22:00' }, pt(24.03, 49.841)),
  line('w2', { amenity: 'restaurant', name: 'Ресторан', cuisine: 'ukrainian' }, { type: 'Polygon', coordinates: [[[24.02, 49.84], [24.021, 49.84], [24.021, 49.841], [24.02, 49.84]]] }),
  line('n3', { leisure: 'swimming_pool', access: 'private', name: 'Приватний' }, pt(24.03, 49.842)),
  line('n4', { tourism: 'museum', name: 'Музей', wikidata: 'Q1' }, pt(30.52, 50.451)),
  line('n5', { amenity: 'place_of_worship', building: 'church', name: 'Церква' }, pt(30.521, 50.45)),
  line('n6', { amenity: 'place_of_worship', building: 'mosque', name: 'Мечеть' }, pt(30.521, 50.451)),
  line('n7', { amenity: 'cafe' }, pt(24.03, 49.84)), '', '{погано'];
const index = new CityIndex([lviv, kyiv, empty]); for (const l of feats) { const x = parseFeature(l); if (x) index.add(x); }
for (const c of [lviv, kyiv, empty]) { const rows = pickVenues(index.byCity.get(c.id), c.lat, c.lon); await storeCityVenues(env, c, rows, rows.length ? null : 'no_venues'); }
const cats = id => raw.prepare('SELECT cat, name, hours FROM venues WHERE city_id = ? ORDER BY cat').all(id);
assert.deepEqual(cats(lviv.id).map(r => r.cat), ['cafe', 'restaurant'], JSON.stringify(cats(lviv.id))); assert.equal(cats(lviv.id)[0].hours, 'Mo-Su 09:00-22:00');
assert.deepEqual(cats(kyiv.id).map(r => r.cat), ['church', 'museum'], 'мечеть не потрапила в категорію «церква»');
assert.equal(raw.prepare('SELECT status, venues_count, error FROM venue_cities WHERE id = ?').get(empty.id).error, 'no_venues');
assert.equal(raw.prepare('SELECT status, venues_count FROM venue_cities WHERE id = ?').get(lviv.id).venues_count, 2);
assert.equal((await venuePicks(env, { country: 'UA', city: 'Lviv', cat: 'cafe', seedKey: 's' })).length, 1);

// ----- повторний запис: оцінки зберігаються, зниклі без оцінок прибираються
raw.prepare('UPDATE venues SET r_sum = 9, r_cnt = 2 WHERE city_id = ? AND cat = ?').run(lviv.id, 'restaurant');
const idx2 = new CityIndex([lviv]); idx2.add(parseFeature(line('n1', { amenity: 'cafe', name: 'Копальня' }, pt(24.03, 49.841)))); await storeCityVenues(env, lviv, pickVenues(idx2.byCity.get(lviv.id), lviv.lat, lviv.lon), null);
assert.deepEqual(cats(lviv.id).map(r => r.cat), ['cafe', 'restaurant'], 'заклад з оцінками не видаляється навіть якщо зник із OSM');

// ----- черга: що потребує наповнення
const q = await queueCountries(env, now); assert.equal(q.length, 1); assert.equal(q[0].country, 'UA');
const names = (await queueCities(env, 'UA', now)).map(c => c.name);
assert(names.includes('Old') && names.includes('Part') && !names.includes('Fresh') && !names.includes('Alias'), names.join(','));
mk('Vip', 'Vip', 44, 34, { priority: 5 }); assert.equal((await queueCities(env, 'UA', now))[0].name, 'Vip', 'спершу міста з пріоритетом (клієнтські)'); assert.equal((await queueCountries(env, now))[0].p, 5); assert.equal((await queueCities(env, 'PL', now)).length, 0);
console.log('BULK OK');
