// Ціни (гривня для України, євро для інших країн), рахунки Monobank у євро з переходом на гривні, повернення, звіти; архів і видалення замовлень; автододавання колонок.
import assert from 'node:assert/strict';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { makeDb } from './d1.js';
import { handle } from '../src/api.js';
import { runRecovery } from '../src/recovery.js';
import { runReminders } from '../src/reminders.js';
import { ensureSchema } from '../src/schema.js';
import { priceWith } from '../src/promo.js';
import { moneyText, uahPerEur } from '../src/pricing.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---- автододавання колонок: робоча база без міграції 0012 (і без 0010) ----
{
  const db0 = makeDb(root), raw0 = db0._raw;
  for (const c of ['archived_at', 'currency', 'uah_rate', 'inv_ccy', 'inv_amount', 'utm_source', 'utm_term']) raw0.exec(`ALTER TABLE orders DROP COLUMN ${c}`);
  raw0.exec('DROP TABLE ad_spend');
  const cols = () => raw0.prepare('PRAGMA table_info(orders)').all().map(c => c.name);
  assert(!cols().includes('currency'));
  await ensureSchema({ DB: db0 });
  for (const c of ['archived_at', 'currency', 'uah_rate', 'inv_ccy', 'inv_amount', 'utm_source', 'utm_term']) assert(cols().includes(c), 'колонку додано: ' + c);
  assert(raw0.prepare("SELECT name FROM sqlite_master WHERE name = 'ad_spend'").get(), 'таблиця витрат на рекламу');
  await ensureSchema({ DB: db0 }); assert.equal(cols().filter(c => c === 'currency').length, 1, 'повторно нічого не ламає');
}

const db = makeDb(root), raw = db._raw;
const env = { DB: db, DEV: '1', PRICE_UAH: '1499', BASE_URL: 'http://x', PAYMENT_MODE: 'stub', EMAIL_MODE: 'stub', NOW_OVERRIDE: '2026-11-20T10:00:00Z', ADMIN_EMAILS: 'boss@x.com', CRON_SECRET: 'c'.repeat(24), MONOBANK_TOKEN: 't' };
raw.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('fx_rates', ?, 0)").run(JSON.stringify({ updated: Date.now(), rates: { UAH: 1, EUR: 1 / 48, USD: 1 / 41.5 } }));
const jar = {};
async function call(who, method, url, body, extra = {}) {
  const headers = { 'content-type': 'application/json', ...extra }; if (jar[who]) headers.cookie = jar[who];
  const res = await handle(new Request('http://x' + url, { method, headers, body: body ? JSON.stringify(body) : undefined }), env);
  const sc = res.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0];
  const ct = res.headers.get('content-type') || ''; return { status: res.status, j: ct.includes('json') ? await res.json() : null };
}
const A = (method, url, body) => call('a', method, url, body, { 'x-admin': '1' });
const outbox = () => raw.prepare('SELECT * FROM outbox ORDER BY id').all();
const ord = id => raw.prepare('SELECT * FROM orders WHERE id = ?').get(id);
await call('a', 'POST', '/api/admin/auth/request', { email: 'boss@x.com' });
assert.equal((await call('a', 'POST', '/api/admin/auth/verify', { token: outbox().at(-1).body.match(/#login=([\w-]+)/)[1] })).status, 200);

// ---- чисті функції ----
assert.equal(uahPerEur({ rates: { EUR: 1 / 48 } }, 41), 48); assert.equal(Math.round(uahPerEur(null, 40) * 100) / 100, 43.2, 'без курсів: запасний курс долара × 1,08');
assert.deepEqual(priceWith(2900, { type: 'fixed', value: 30000 }, 1 / 48), { list: 2900, discount: 625, final: 2275 }, 'фіксована знижка 300 ₴ у євро');
assert.deepEqual(priceWith(2900, { type: 'fixed', value: 300000 }, 1 / 48), { list: 2900, discount: 2900, final: 0 });
assert.equal(moneyText(2900, 'EUR'), '29 €'); assert.equal(moneyText(2950, 'EUR', 'en'), '€29.50'); assert.equal(moneyText(149900, 'UAH').replace(/\s/g, ' '), '1 499 ₴');

// ---- конфіг: валюта за країною, ціна в євро ще не задана → з гривні за курсом, округлена вгору ----
let cfg = (await call('x', 'GET', '/api/config?country=UA')).j; assert.equal(cfg.price, 1499); assert.equal(cfg.currency.code, 'UAH');
cfg = (await call('x', 'GET', '/api/config?country=DE')).j; assert.equal(cfg.currency.code, 'EUR'); assert.equal(cfg.price, Math.ceil(1499 / 48)); assert.equal(cfg.uahPerEur, 48); assert.equal(cfg.eurInvoice, true);
cfg = (await call('x', 'GET', '/api/config?country=US')).j; assert.equal(cfg.currency.code, 'EUR', 'єдина ціна в євро для всіх країн, крім України');
// адмінка: ціни в гривнях і в євро
let st = (await A('GET', '/api/admin/settings')).j; assert.equal(st.prices.eurSet, false); assert.equal(st.prices.eur, 32); assert.equal(st.payEurOff, null);
assert.equal((await A('POST', '/api/admin/settings', { price_eur: 0 })).j.error, 'bad_price_eur'); assert.equal((await A('POST', '/api/admin/settings', { price_eur: 20000 })).j.error, 'bad_price_eur');
st = (await A('POST', '/api/admin/settings', { price_uah: '1499', price_eur: '29' })).j; assert.equal(st.settings.price_eur, 29); assert.equal(st.prices.eurSet, true);
assert.equal((await call('x', 'GET', '/api/config?country=PL')).j.price, 29); assert.equal((await call('x', 'GET', '/api/config?country=UA')).j.price, 1499);
assert(raw.prepare("SELECT 1 FROM audit_log WHERE action = 'settings' AND detail LIKE '%price_eur%'").get());

// ---- промокоди в обох валютах ----
raw.prepare("INSERT INTO promo_codes (id, code, type, value, active, created_at) VALUES ('p1','TEN','percent',10,1,0), ('p2','UAH300','fixed',30000,1,0), ('p3','FREE','percent',100,1,0)").run();
let pc = (await call('x', 'POST', '/api/promo/check', { code: 'ten', country: 'DE' })).j; assert.deepEqual([pc.currency, pc.listKop, pc.discountKop, pc.finalKop], ['EUR', 2900, 290, 2610]);
pc = (await call('x', 'POST', '/api/promo/check', { code: 'uah300', country: 'DE' })).j; assert.deepEqual([pc.currency, pc.discountKop, pc.finalKop], ['EUR', 625, 2275]);
pc = (await call('x', 'POST', '/api/promo/check', { code: 'uah300' })).j; assert.deepEqual([pc.currency, pc.discountKop, pc.finalKop], ['UAH', 30000, 119900], 'без країни: Україна');
pc = (await call('x', 'POST', '/api/promo/check', { code: 'nope', country: 'DE' })).j; assert.equal(pc.valid, false); assert.equal(pc.currency, 'EUR');

// ---- замовлення (заглушка оплати) ----
const good = { nameA: 'Микола', nameB: 'Рита', emailA: 'a1@t.com', emailB: 'b1@t.com', city: 'Львів', region: 'Львівська', startDate: '2026-12-01', age18: true, terms: true };
const de = { country: 'DE', city: 'Berlin', region: 'Berlin' };
let ipn = 0; const order = async o => (await call('x', 'POST', '/api/orders', { ...good, ...o }, { 'cf-connecting-ip': '10.0.0.' + ++ipn })).j;
const oUA = await order({}); assert.equal(oUA.currency, 'UAH'); assert.equal(oUA.amountKop, 149900);
const oDE = await order({ ...de, emailA: 'de1@t.com', emailB: 'de2@t.com' }); assert.equal(oDE.currency, 'EUR'); assert.equal(oDE.amountKop, 2900);
let r = ord(oDE.orderId); assert.deepEqual([r.currency, r.amount_kop, r.list_kop, r.uah_rate, r.inv_ccy, r.inv_amount], ['EUR', 2900, 2900, 48, 978, 2900]);
r = ord(oUA.orderId); assert.deepEqual([r.currency, r.uah_rate, r.inv_ccy, r.inv_amount], ['UAH', 1, 980, 149900]);
const oDEp = await order({ ...de, emailA: 'de3@t.com', emailB: 'de4@t.com', promo: 'TEN' }); assert.equal(oDEp.amountKop, 2610); assert.equal(ord(oDEp.orderId).discount_kop, 290);
const oFree = await order({ ...de, emailA: 'de5@t.com', emailB: 'de6@t.com', promo: 'FREE' }); assert(oFree.free); assert.equal(ord(oFree.orderId).currency, 'EUR'); assert(ord(oFree.orderId).paid_at, 'безкоштовне одразу оплачене');
for (const o of [oUA, oDE]) await call('x', 'GET', `/api/dev/pay/${o.orderId}`);
assert.deepEqual((await call('x', 'GET', `/api/orders/${oDE.orderId}/status`)).j, { ok: true, status: 'paid', value: 29, currency: 'EUR' }, 'покупка для аналітики в євро');

// ---- Monobank: рахунок у євро, перехід на гривні, повтор ----
const realFetch = globalThis.fetch; let mono = { eur: 200, uah: 200 }, calls = [], statuses = {}, cancels = [], seq = 0;
globalThis.fetch = async (u, o = {}) => {
  const url = String(u), b = o.body ? JSON.parse(o.body) : null;
  if (url.endsWith('/api/merchant/invoice/create')) { calls.push(b); const code = b.ccy === 978 ? mono.eur : mono.uah; if (code !== 200) return new Response(JSON.stringify({ errCode: 'BAD_REQUEST', errText: b.ccy === 978 ? 'ccy is not allowed' : 'bad' }), { status: code }); const id = 'inv' + ++seq; statuses[id] = { status: 'created', amount: b.amount, ccy: b.ccy, reference: b.merchantPaymInfo.reference }; return new Response(JSON.stringify({ invoiceId: id, pageUrl: 'https://pay.mbnk.biz/' + id })); }
  if (url.includes('/api/merchant/invoice/status')) { const id = new URL(url).searchParams.get('invoiceId'); return statuses[id] ? new Response(JSON.stringify(statuses[id])) : new Response('{}', { status: 404 }); }
  if (url.endsWith('/api/merchant/invoice/cancel')) { cancels.push(b); return new Response(JSON.stringify({ status: 'processing' })); }
  return realFetch(u, o);
};
env.PAYMENT_MODE = 'monobank';
const m1 = await order({ ...de, emailA: 'm1@t.com', emailB: 'm2@t.com' }); assert(m1.ok, JSON.stringify(m1));
assert.equal(calls.length, 1); assert.deepEqual([calls[0].ccy, calls[0].amount, calls[0].merchantPaymInfo.basketOrder[0].sum], [978, 2900, 2900], 'рахунок у євро');
assert.equal(m1.payUrl, 'https://pay.mbnk.biz/inv1');
const u1 = await order({ emailA: 'u1@t.com', emailB: 'u2@t.com' }); assert.deepEqual([calls.at(-1).ccy, calls.at(-1).amount], [980, 149900], 'Україна: у гривнях');
// оплата підтверджується лише з правильною валютою й сумою
statuses.inv1.status = 'success'; statuses.inv1.ccy = 980;
await call('x', 'POST', '/api/payments/monobank/webhook', { invoiceId: 'inv1' }); assert.equal(ord(m1.orderId).paid_at, null, 'не та валюта: не оплачено');
statuses.inv1.ccy = 978; await call('x', 'POST', '/api/payments/monobank/webhook', { invoiceId: 'inv1' }); assert(ord(m1.orderId).paid_at, 'оплачено в євро');
// банк не приймає євро: рахунок у гривнях за курсом і надалі одразу в гривнях
mono.eur = 400; calls = [];
const m2 = await order({ ...de, emailA: 'm3@t.com', emailB: 'm4@t.com' }); assert(m2.ok, JSON.stringify(m2));
assert.deepEqual(calls.map(c => c.ccy), [978, 980]); assert.equal(calls[1].amount, 139200, '29 € × 48 = 1392 ₴');
r = ord(m2.orderId); assert.deepEqual([r.currency, r.amount_kop, r.inv_ccy, r.inv_amount, r.uah_rate], ['EUR', 2900, 980, 139200, 48]);
const off = JSON.parse(raw.prepare("SELECT value FROM settings WHERE key = 'pay_eur_off'").get().value); assert(off.at > 0 && off.error.includes('ccy'));
cfg = (await call('x', 'GET', '/api/config?country=DE')).j; assert.equal(cfg.eurInvoice, false, 'сайт пояснить, що оплата піде в гривнях');
assert((await A('GET', '/api/admin/settings')).j.payEurOff.error.includes('ccy'), 'адмінка бачить попередження');
calls = []; const m3 = await order({ ...de, emailA: 'm5@t.com', emailB: 'm6@t.com' }); assert(m3.ok); assert.deepEqual(calls.map(c => c.ccy), [980], 'одразу в гривнях, без зайвої спроби в євро');
const invM2 = r.invoice_id; statuses[invM2].status = 'success';
await call('x', 'POST', '/api/payments/monobank/webhook', { invoiceId: invM2 }); assert(ord(m2.orderId).paid_at, 'гривневий рахунок за євро-ціною оплачено');
// спробувати в євро знову
await A('POST', '/api/admin/settings', { eur_retry: true }); assert.equal((await call('x', 'GET', '/api/config?country=DE')).j.eurInvoice, true);
mono.eur = 200; calls = []; await order({ ...de, emailA: 'm7@t.com', emailB: 'm8@t.com' }); assert.deepEqual(calls.map(c => c.ccy), [978]);
// збій банку (5xx) чи відмова обох валют: валюту не вимикаємо
mono.eur = 503; calls = []; assert.equal((await order({ ...de, emailA: 'm9@t.com', emailB: 'm10@t.com' })).error, 'payment_provider_error'); assert.equal(raw.prepare("SELECT 1 FROM settings WHERE key = 'pay_eur_off'").get(), undefined);
mono.eur = 400; mono.uah = 400; assert.equal((await order({ ...de, emailA: 'm11@t.com', emailB: 'm12@t.com' })).error, 'payment_provider_error'); assert.equal(raw.prepare("SELECT 1 FROM settings WHERE key = 'pay_eur_off'").get(), undefined, 'гривні теж не пройшли: справа не у валюті');
mono = { eur: 200, uah: 200 };

// ---- повернення: сума у валюті замовлення, Monobank отримує суму у валюті рахунку ----
let x = (await A('POST', `/api/admin/orders/${m1.orderId}/refund`, { amountKop: 1000, method: 'auto', notify: true })).j; assert(x.ok && x.method === 'api', JSON.stringify(x));
assert.deepEqual([cancels.at(-1).invoiceId, cancels.at(-1).amount], ['inv1', 1000]); assert.deepEqual([ord(m1.orderId).refund_kop, ord(m1.orderId).refund_status], [1000, 'processing']);
assert.equal(outbox().at(-1).to_email, 'm1@t.com'); assert(/10 €/.test(outbox().at(-1).body), 'лист про повернення в євро');
x = (await A('POST', `/api/admin/orders/${m2.orderId}/refund`, { amountKop: 1000, method: 'auto', notify: false })).j; assert(x.ok);
assert.equal(cancels.at(-1).amount, 48000, '10 € за гривневим рахунком: 480 ₴');
assert.equal((await A('POST', `/api/admin/orders/${oDE.orderId}/refund`, { amountKop: 3000 })).j.error, 'bad_amount', 'не більше за оплачене в євро');
env.PAYMENT_MODE = 'stub'; globalThis.fetch = realFetch;

// ---- звіти: євро в гривневому еквіваленті ----
const dash = (await A('GET', '/api/admin/dashboard?days=30')).j.kpi;
// оплачено: UA 1499 ₴, DE 29 € (×48), безкоштовне 0, m1 29 € (повернено 10 €), m2 29 € (гривневий рахунок, повернено 10 €)
assert.equal(dash.paid, 5); assert.equal(dash.free, 1); assert.equal(dash.revenue_kop, 149900 + 139200 * 3); assert.equal(dash.refunds_kop, 48000 * 2); assert.equal(dash.net_revenue_kop, 149900 + 139200 * 3 - 96000);
assert.deepEqual(dash.eur, { paid: 4, cents: 2900 * 3 - 2000, uah_kop: 139200 * 3 - 96000 }, 'частка оплат у євро');
const cust = (await A('GET', '/api/admin/customers')).j.customers; assert.equal(cust.find(c => c.email === 'de1@t.com').paid_kop, 139200); assert.equal(cust.find(c => c.email === 'a1@t.com').paid_kop, 149900);
const pr = (await A('GET', '/api/admin/promos')).j; const ten = (pr.promos || pr.rows || pr.list || []).find(p => p.code === 'TEN'); assert(ten, JSON.stringify(Object.keys(pr)));
const ol = (await A('GET', '/api/admin/orders?status=all')).j.orders; assert.equal(ol.find(o => o.id === oDE.orderId).currency, 'EUR');

// ---- архів ----
const before = (await A('GET', '/api/admin/dashboard?days=30')).j.kpi.paid;
assert.equal((await call('a', 'POST', `/api/admin/orders/${oUA.orderId}/archive`, {})).j.error, 'csrf');
x = (await A('POST', `/api/admin/orders/${oUA.orderId}/archive`, {})).j; assert(x.ok && x.archived); assert(ord(oUA.orderId).archived_at > 0);
assert(!(await A('GET', '/api/admin/orders?status=all')).j.orders.some(o => o.id === oUA.orderId), 'архівне зникає зі списку');
assert(!(await A('GET', '/api/admin/orders?status=paid')).j.orders.some(o => o.id === oUA.orderId));
assert((await A('GET', '/api/admin/orders?status=archived')).j.orders.some(o => o.id === oUA.orderId), 'але є у фільтрі «Архів»');
assert.equal((await A('GET', '/api/admin/dashboard?days=30')).j.kpi.paid, before - 1, 'і не рахується в дашборді');
assert(!(await A('GET', '/api/admin/customers')).j.customers.some(c => c.email === 'a1@t.com'), 'і в клієнтах');
assert.equal((await A('GET', `/api/admin/orders/${oUA.orderId}`)).j.order.archived_at > 0, true, 'картка замовлення відкривається');
// архівним не надсилаються нагадування
env.NOW_OVERRIDE = '2026-11-30T10:00:00Z'; await runReminders(env); env.NOW_OVERRIDE = '2026-11-20T10:00:00Z';
assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM reminders_sent r JOIN members m ON m.id = r.member_id JOIN calendars c ON c.id = m.calendar_id WHERE c.order_id = ?').get(oUA.orderId).n, 0, 'архівному нагадувань немає');
assert(raw.prepare('SELECT COUNT(*) AS n FROM reminders_sent r JOIN members m ON m.id = r.member_id JOIN calendars c ON c.id = m.calendar_id WHERE c.order_id = ?').get(oDE.orderId).n > 0, 'звичайному є');
// ...і нагадування про незавершену оплату
const unpaid = await order({ emailA: 'np1@t.com', emailB: 'np2@t.com' }), NOW = Date.now(); raw.prepare('UPDATE orders SET created_at = ? WHERE id = ?').run(NOW - 3 * 36e5, unpaid.orderId);
raw.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('agent_recovery', '1', 0) ON CONFLICT(key) DO UPDATE SET value = '1'").run();
await A('POST', `/api/admin/orders/${unpaid.orderId}/archive`, {});
const nOut = outbox().length; await runRecovery(env, { now: NOW }); assert(!outbox().slice(nOut).some(m => m.to_email === 'np1@t.com'), 'архівному тестовому замовленню нагадування про оплату не йде');
// повернення з архіву
x = (await A('POST', `/api/admin/orders/${oUA.orderId}/archive`, { archived: false })).j; assert(x.ok && !x.archived); assert.equal(ord(oUA.orderId).archived_at, null);
assert.equal((await A('GET', '/api/admin/dashboard?days=30')).j.kpi.paid, before);

// ---- видалення: лише з архіву, разом з усім, що належить замовленню ----
assert.equal((await A('POST', `/api/admin/orders/${oDEp.orderId}/delete`, {})).j.error, 'not_archived');
await call('x', 'GET', `/api/dev/pay/${oDEp.orderId}`); assert.equal(raw.prepare("SELECT used_count FROM promo_codes WHERE code = 'TEN'").get().used_count, 1);
const cal = raw.prepare('SELECT id FROM calendars WHERE order_id = ?').get(oDEp.orderId), mids = raw.prepare('SELECT id FROM members WHERE calendar_id = ?').all(cal.id).map(m => m.id);
raw.prepare('INSERT INTO answers (member_id, day, text, created_at) VALUES (?, 1, ?, ?)').run(mids[0], 'тест', Date.now());
assert(raw.prepare('SELECT COUNT(*) AS n FROM email_log WHERE order_id = ?').get(oDEp.orderId).n >= 2, 'листи замовлення є в журналі');
await A('POST', `/api/admin/orders/${oDEp.orderId}/archive`, {});
x = (await A('POST', `/api/admin/orders/${oDEp.orderId}/delete`, {})).j; assert(x.ok && x.deleted);
assert.equal(ord(oDEp.orderId), undefined); assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM calendars WHERE id = ?').get(cal.id).n, 0);
assert.equal(raw.prepare(`SELECT COUNT(*) AS n FROM members WHERE id IN (${mids.map(() => '?').join(',')})`).get(...mids).n, 0);
assert.equal(raw.prepare(`SELECT COUNT(*) AS n FROM answers WHERE member_id IN (${mids.map(() => '?').join(',')})`).get(...mids).n, 0);
assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM email_log WHERE order_id = ?').get(oDEp.orderId).n, 0, 'листи з журналу теж');
assert.equal(raw.prepare("SELECT used_count FROM promo_codes WHERE code = 'TEN'").get().used_count, 0, 'ліміт промокоду повернувся');
assert(raw.prepare("SELECT 1 FROM audit_log WHERE action = 'order_delete' AND target = ?").get(oDEp.orderId), 'видалення записано в журнал дій');
assert.equal((await A('GET', `/api/admin/orders/${oDEp.orderId}`)).status, 404);
// стан нагадувань про оплату чиститься разом із замовленням
x = (await A('POST', `/api/admin/orders/${unpaid.orderId}/delete`, {})).j; assert(x.ok); assert.equal(JSON.parse(raw.prepare("SELECT value FROM settings WHERE key = 'recovery_state'").get().value || '{}')[unpaid.orderId], undefined);

// ---- масові дії ----
const t1 = await order({ emailA: 't1@t.com', emailB: 't2@t.com' }), t2 = await order({ emailA: 't3@t.com', emailB: 't4@t.com' }), t3 = await order({ emailA: 't5@t.com', emailB: 't6@t.com' });
assert.equal((await A('POST', '/api/admin/orders/bulk', { action: 'archive', ids: [] })).j.error, 'bad_ids'); assert.equal((await A('POST', '/api/admin/orders/bulk', { action: 'drop', ids: [t1.orderId] })).j.error, 'bad_action');
assert.equal((await A('POST', '/api/admin/orders/bulk', { action: 'delete', ids: Array.from({ length: 21 }, (_, i) => 'id' + i + 'xx') })).j.error, 'bad_ids', 'видаляти до 20 за раз');
x = (await A('POST', '/api/admin/orders/bulk', { action: 'archive', ids: [t1.orderId, t2.orderId, t3.orderId, t1.orderId] })).j; assert.deepEqual([x.n, x.skipped], [3, 0]);
x = (await A('POST', '/api/admin/orders/bulk', { action: 'archive', ids: [t1.orderId] })).j; assert.deepEqual([x.n, x.skipped], [0, 1], 'вже в архіві');
x = (await A('POST', '/api/admin/orders/bulk', { action: 'unarchive', ids: [t3.orderId] })).j; assert.equal(x.n, 1);
x = (await A('POST', '/api/admin/orders/bulk', { action: 'delete', ids: [t1.orderId, t2.orderId, t3.orderId, 'missing-id'] })).j; assert.deepEqual([x.n, x.skipped], [2, 2], 'не з архіву й неіснуючі пропускаються');
assert.equal(ord(t1.orderId), undefined); assert.equal(ord(t2.orderId), undefined); assert(ord(t3.orderId), 'не архівне лишилось');
assert(raw.prepare("SELECT 1 FROM audit_log WHERE action = 'orders_delete'").get());
console.log('OK pricing');
