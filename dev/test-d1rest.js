// Адаптер REST: емулюємо API Cloudflare над локальним SQLite і проганяємо через нього справжнє наповнення бази закладів.
import assert from 'node:assert/strict';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { makeDb } from './d1.js';
import { makeRestDb } from '../tools/d1-rest.mjs';
import { runVenuesLogged, ensureCity, venueStats, venuePicks } from '../src/venues.js';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), local = makeDb(root), raw = local._raw;
let requests = 0, auth = null, noBatch = false, failOnce = 0;
const api = async (url, init) => {
  if (!String(url).includes('api.cloudflare.com')) return mockOverpass(url);
  requests++; auth = init.headers.Authorization; const b = JSON.parse(init.body);
  if (failOnce > 0) { failOnce--; return new Response('{}', { status: 503 }); }
  const exec = q => { const st = raw.prepare(q.sql); if (/^\s*(select|with)/i.test(q.sql)) return { success: true, results: st.all(...(q.params || [])), meta: { changes: 0 } }; const r = st.run(...(q.params || [])); return { success: true, results: [], meta: { changes: Number(r.changes) } }; };
  try {
    if (b.batch) { if (noBatch) return new Response(JSON.stringify({ success: false, errors: [{ message: 'no batch' }] }), { status: 400 }); return new Response(JSON.stringify({ success: true, result: b.batch.map(exec) })); }
    return new Response(JSON.stringify({ success: true, result: [exec(b)] }));
  } catch (e) { return new Response(JSON.stringify({ success: false, errors: [{ message: e.message }] }), { status: 400 }); }
};
const el = (id, tags, lat = 49.84, lon = 24.03) => ({ type: 'node', id, lat, lon, tags });
const mockOverpass = async url => String(url).includes('nominatim') ? new Response(JSON.stringify([{ lat: '49.84', lon: '24.03' }])) : new Response(JSON.stringify({ elements: [el(1, { amenity: 'cafe', name: 'Кав’ярня', opening_hours: 'Mo-Su 09:00-20:00' }), el(2, { shop: 'coffee', name: 'Обсмажка' })] }));

const DB = makeRestDb({ accountId: 'acc', databaseId: 'db', token: 'secret-token', fetchImpl: api });
// базові операції
assert.equal(await DB.prepare('SELECT COUNT(*) AS n FROM venue_cities').first().then(r => r.n), 0);
await DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)").bind('k1', 'v1', 1).run();
assert.equal((await DB.prepare('SELECT value FROM settings WHERE key = ?').bind('k1').first()).value, 'v1');
assert.equal((await DB.prepare('SELECT * FROM settings WHERE key = ?').bind('nope').first()), null);
assert.equal((await DB.prepare("UPDATE settings SET value = ? WHERE key = ?").bind('v2', 'k1').run()).meta.changes, 1);
assert.equal(auth, 'Bearer secret-token');
// повтор після тимчасової помилки 503
failOnce = 1; assert.equal((await DB.prepare('SELECT value FROM settings WHERE key = ?').bind('k1').first()).value, 'v2');
// batch і запасний шлях без batch
await DB.batch([DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?,?,?)').bind('b1', '1', 1), DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?,?,?)').bind('b2', '2', 1)]);
noBatch = true; await DB.batch([DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?,?,?)').bind('b3', '3', 1)]); noBatch = false;
assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM settings WHERE key IN ('b1','b2','b3')").get().n, 3);
// помилка SQL перетворюється на виняток
await assert.rejects(() => DB.prepare('SELECT * FROM no_such_table').first(), /D1 REST 400/);

// справжнє наповнення через адаптер (як у GitHub Actions): сід 300+ міст, пріоритетне місто першим, заклади й запис прогресу
const env = { DB, VENUES_PER_RUN: '2' };
await ensureCity(env, 'UA', 'Жовква');
const origFetch = globalThis.fetch; globalThis.fetch = api;
try {
  const out = await runVenuesLogged(env, { budgetMs: 5000 });
  assert(out.seeded && out.city === 'UA|жовква', JSON.stringify(out));
} finally { globalThis.fetch = origFetch; }
const st = await venueStats(env); assert(st.cities > 280 && st.venues > 0 && st.last && st.last.at, JSON.stringify(st));
console.log('D1REST OK', 'запитів до API:', requests);
