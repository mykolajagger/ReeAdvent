// Реклама: конфіг трекінгу (валідація), UTM у замовленні, витрати, звіт за джерелами, значення покупки в статусі
import assert from 'node:assert/strict';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { makeDb } from './d1.js';
import { handle } from '../src/api.js';
import { trackConfig, saveTrackConfig, publicTrackConfig, cleanUtm, addSpend, deleteSpend, listSpend, adsReport } from '../src/ads.js';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), db = makeDb(root);
const env = { DB: db, DEV: '1', PRICE_UAH: '400', BASE_URL: 'http://x', PAYMENT_MODE: 'stub', EMAIL_MODE: 'stub', NOW_OVERRIDE: '2026-11-25T12:00:00Z' };
const call = async (method, url, body) => { const r = await handle(new Request('http://x' + url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env); return { status: r.status, j: await r.json() }; };
// конфіг трекінгу
assert.equal((await saveTrackConfig(env, { meta: 'abc' })).ok, false); assert.equal((await saveTrackConfig(env, { ga4: 'G-<script>' })).ok, false); assert.equal((await saveTrackConfig(env, { gads: 'AW-1' })).ok, false);
assert.equal((await saveTrackConfig(env, { meta: '123456789012345', ga4: 'G-ABC123XYZ9', gads: 'AW-1234567890', gads_label: 'AbC-123_xyz9', budget: 500 })).ok, true);
const pc = (await call('GET', '/api/track-config')).j; assert.deepEqual([pc.meta, pc.ga4, pc.gads, pc.gadsLabel], ['123456789012345', 'G-ABC123XYZ9', 'AW-1234567890', 'AbC-123_xyz9']); assert.equal((await trackConfig(env)).budget, 500);
await saveTrackConfig(env, { meta: '' }); assert.equal((await publicTrackConfig(env)).meta, '');
// чистка UTM
assert.equal(cleanUtm({ source: ' Meta ', medium: 'paid', campaign: 'Test_UA', content: '<img src=x>', term: 'a'.repeat(200) }).utm_term.length, 80); assert.deepEqual(cleanUtm({ source: ' Meta ', medium: 'paid', campaign: 'Test_UA', content: '<img src=x>' }), { utm_source: 'meta', utm_medium: 'paid', utm_campaign: 'test_ua' });
assert.deepEqual(cleanUtm(null), {}); assert.deepEqual(cleanUtm('x'), {});
// замовлення з UTM
const body = u => ({ nameA: 'Він', nameB: 'Вона', emailA: `a${Math.random()}@t.com`, emailB: `b${Math.random()}@t.com`, city: 'Львів', region: 'Львівська', startDate: '2026-11-27', age18: true, terms: true, utm: u });
const o1 = (await call('POST', '/api/orders', body({ source: 'meta', medium: 'paid', campaign: 'ua_cold', content: 'reel1' }))).j; assert(o1.ok, JSON.stringify(o1));
const o2 = (await call('POST', '/api/orders', body({ source: 'google', campaign: 'search_ua' }))).j; assert(o2.ok);
const o3 = (await call('POST', '/api/orders', body(undefined))).j; assert(o3.ok);
const row = db._raw.prepare('SELECT utm_source, utm_campaign, utm_content FROM orders WHERE id = ?').get(o1.orderId); assert.deepEqual({ ...row }, { utm_source: 'meta', utm_campaign: 'ua_cold', utm_content: 'reel1' });
// статус: значення лише для оплаченого
assert.equal((await call('GET', `/api/orders/${o1.orderId}/status`)).j.value, undefined);
db._raw.prepare("UPDATE orders SET status='paid', paid_at=? WHERE id IN (?,?)").run(Date.now(), o1.orderId, o2.orderId);
const st = (await call('GET', `/api/orders/${o1.orderId}/status`)).j; assert.equal(st.status, 'paid'); assert.equal(st.currency, 'UAH'); assert(st.value > 0);
// витрати
assert.equal((await addSpend(env, { day: 'x', channel: 'meta', amount: 5 })).ok, false); assert.equal((await addSpend(env, { day: '2026-11-25', channel: 'nope', amount: 5 })).ok, false); assert.equal((await addSpend(env, { day: '2026-11-25', channel: 'meta', amount: 0 })).ok, false);
assert.equal((await addSpend(env, { day: '2026-11-25', channel: 'meta', campaign: 'UA_Cold', amount: 20 })).ok, true); await addSpend(env, { day: '2026-11-25', channel: 'google', amount: 10 }); await addSpend(env, { day: '2026-11-25', channel: 'influencer', amount: 7.5 });
let sp = await listSpend(env); assert.equal(sp.length, 3); await deleteSpend(env, sp.find(s => s.channel === 'influencer').id); assert.equal((await listSpend(env)).length, 2);
// звіт
const rep = await adsReport(env, Date.now() - 864e5 * 400, Date.now() + 864e5 * 400);
const by = Object.fromEntries(rep.rows.map(r => [r.source, r]));
assert.equal(by.meta.paid, 1); assert.equal(by.meta.spend_cents, 2000); assert.equal(by.meta.cpa_usd, 20); assert(by.meta.roas > 0); assert.equal(by.google.paid, 1); assert.equal(by['(пряме)'].started, 1); assert.equal(by['(пряме)'].paid, 0);
assert.equal(rep.totals.paid, 2); assert.equal(rep.totals.spend_cents, 3000); assert.equal(rep.spentAllCents, 3000); assert.equal(rep.campaigns.length, 2);
// повернення не рахується
db._raw.prepare('UPDATE orders SET refunded_at=? WHERE id=?').run(Date.now(), o2.orderId);
assert.equal((await adsReport(env, 0, Date.now() + 864e5)).totals.paid, 1);
console.log('OK ads');
