import assert from 'node:assert/strict';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { makeDb } from './d1.js';
import { US_CITIES, CITY_FIXES, applyCityFixes } from '../src/city_fixes.js';
import { US_BOX } from '../src/usstates.js';
import { TOP_CITIES } from '../src/top_cities.js';
import { cityKey } from '../src/venues.js';
const db = makeDb(path.join(path.dirname(fileURLToPath(import.meta.url)), '..')), env = { DB: db };
// кожне місто США лежить у рамці свого штату (перевіряє і координати міст, і рамки)
for (const [n, st, lat, lon] of US_CITIES) { const b = US_BOX[st] || (st === 'DC' ? US_BOX.DC : null); assert(b, 'немає рамки ' + st); assert(lat >= b[0] - .05 && lat <= b[2] + .05 && lon >= b[1] - .05 && lon <= b[3] + .05, `${n} (${st}) поза рамкою`); }
assert(US_CITIES.length > 180); assert.equal(new Set(US_CITIES.map(c => cityKey('US', c[0]))).size, US_CITIES.length, 'дублікати ключів');
// початковий список більше не містить відомих хибних координат
const t = Object.fromEntries(TOP_CITIES.map(c => [c[0] + '|' + c[1], c])); assert(Math.abs(t['US|Houston'][2] - 29.76) < .1 && Math.abs(t['UA|Mykolaiv'][2] - 46.97) < .1 && t['AU|Perth'][2] < -30);
// застосування: хибне місто виправляється, заклади чистяться, залежні аліаси знімаються, нові додаються, повторний виклик нічого не робить
const run = (sql, ...a) => db._raw.prepare(sql).run(...a);
run("INSERT INTO venue_cities (key, country, name, lat, lon, status, priority, requested_at, venues_count, fetched_at) VALUES ('US|houston','US','Houston',61.63,-149.82,'ready',0,1,40,5)");
const hid = db._raw.prepare("SELECT id FROM venue_cities WHERE key='US|houston'").get().id;
run("INSERT INTO venues (city_id, osm, cat, name, lat, lon, seen_at) VALUES (?, 'n1', 'cafe', 'X', 61.6, -149.8, 1)", hid);
run("INSERT INTO venue_cities (key, country, name, status, priority, requested_at, alias_of) VALUES ('US|hou','US','Hou','ready',0,1,?)", hid);
run("INSERT INTO venue_cities (key, country, name, lat, lon, status, priority, requested_at) VALUES ('US|denver','US','Denver',39.74,-104.98,'ready',0,1)");
const r1 = await applyCityFixes(env); assert(r1.fixed >= 1 && r1.added > 150);
const h = db._raw.prepare("SELECT lat, lon, status, venues_count FROM venue_cities WHERE id=?").get(hid); assert(Math.abs(h.lat - 29.76) < .01 && h.status === 'pending' && h.venues_count === 0);
assert.equal(db._raw.prepare('SELECT COUNT(*) n FROM venues WHERE city_id=?').get(hid).n, 0); assert.equal(db._raw.prepare("SELECT alias_of, status FROM venue_cities WHERE key='US|hou'").get().alias_of, null);
assert.equal(db._raw.prepare("SELECT status FROM venue_cities WHERE key='US|denver'").get().status, 'ready');   // правильні координати не чіпаємо
assert((await applyCityFixes(env)).skipped);
console.log('OK cityfixes');
