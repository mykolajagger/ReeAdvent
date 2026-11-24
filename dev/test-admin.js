import assert from 'node:assert/strict';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { makeDb } from './d1.js';
import { handle } from '../src/api.js';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = makeDb(root), raw = db._raw;
const env = { DB: db, DEV: '1', PRICE_UAH: '400', BASE_URL: 'http://x', PAYMENT_MODE: 'stub', EMAIL_MODE: 'stub', NOW_OVERRIDE: '2026-11-20T10:00:00Z',
  ADMIN_EMAILS: 'boss@x.com, Mgr@x.com', ACQUIRING_FEE_PERCENT: '2', TAX_PERCENT: '5' };
const jar = {};
async function call(who, method, url, body, extra = {}) {
  const headers = { 'content-type': 'application/json', ...extra };
  if (jar[who]) headers.cookie = jar[who];
  const res = await handle(new Request('http://x' + url, { method, headers, body: body ? JSON.stringify(body) : undefined }), env);
  const sc = res.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0];
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, ct, j: ct.includes('json') ? await res.json() : null, text: ct.includes('json') ? null : await res.text() };
}
const A = (who, method, url, body) => call(who, method, url, body, { 'x-admin': '1' });
const outbox = () => raw.prepare('SELECT * FROM outbox ORDER BY id').all();
const tok = body => body.match(/#login=([\w-]+)/)[1];

// ---- вхід ----
assert.equal((await call('a', 'GET', '/api/admin/me')).j.error, 'admin_auth');
const n0 = outbox().length;
assert.equal((await call('a', 'POST', '/api/admin/auth/request', { email: 'stranger@x.com' })).status, 200); assert.equal(outbox().length, n0, 'no mail to strangers');
await call('a', 'POST', '/api/admin/auth/request', { email: 'BOSS@x.com' }); assert.equal(outbox().length, n0 + 1);
const link = outbox().at(-1).body; assert(link.includes('/admin/#login='));
assert.equal((await call('a', 'POST', '/api/admin/auth/verify', { token: 'bad' })).status, 401);
assert.equal((await call('a', 'POST', '/api/admin/auth/verify', { token: tok(link) })).status, 200);
assert.equal((await call('z', 'POST', '/api/admin/auth/verify', { token: tok(link) })).status, 401, 'one-time');
assert.equal((await call('a', 'GET', '/api/admin/me')).j.email, 'boss@x.com');
await call('m', 'POST', '/api/admin/auth/request', { email: 'mgr@x.com' }); await call('m', 'POST', '/api/admin/auth/verify', { token: tok(outbox().at(-1).body) });
assert.equal((await call('m', 'GET', '/api/admin/me')).j.email, 'mgr@x.com', 'manager can log in');
assert.equal((await call('a', 'POST', '/api/admin/promos', { code: 'X', type: 'percent', value: 5 })).j.error, 'csrf', 'CSRF header required');
// клієнтська сесія не дає доступу до адмінки
assert.equal((await call('c', 'GET', '/api/admin/orders')).status, 401);

// ---- дані: 3 замовлення ----
const good = { nameA: 'Микола', nameB: 'Рита', emailA: 'a1@t.com', emailB: 'b1@t.com', city: 'Львів', region: 'Львівська', startDate: '2026-12-01', age18: true, terms: true };
const order = async o => (await call('x', 'POST', '/api/orders', { ...good, ...o })).j;
raw.prepare("INSERT INTO promo_codes (id, code, type, value, active, created_at) VALUES ('pp','TENOFF','percent',10,1,?)").run(Date.now());
const o1 = await order({}); await call('x', 'GET', `/api/dev/pay/${o1.orderId}`);                                         // 400 грн
const o2 = await order({ emailA: 'a2@t.com', emailB: 'b2@t.com', city: 'Київ', region: 'м. Київ', promo: 'tenoff' }); await call('x', 'GET', `/api/dev/pay/${o2.orderId}`); // 360 грн
const o3 = await order({ emailA: 'a3@t.com', emailB: 'b3@t.com', nameA: '=HYPERLINK("x")' });                              // не оплачено
assert(o1.ok && o2.ok && o3.ok);
// анкети першого календаря -> розклад
const memb = raw.prepare('SELECT m.* FROM members m JOIN calendars c ON c.id = m.calendar_id WHERE c.order_id = ? ORDER BY m.slot').all(o1.orderId);
const sur = n => JSON.stringify({ name: n, budget: 300, giftLikes: ['SECRET_TASTE'], avoid: [], level: 2, intimLikes: [], actLikes: [], actBudget: 1, car: false });
raw.prepare('UPDATE members SET survey_json = ? WHERE id = ?').run(sur('Микола'), memb[0].id); raw.prepare('UPDATE members SET survey_json = ? WHERE id = ?').run(sur('Рита'), memb[1].id);
const { generateSchedule } = await import('../src/logic.js'); const { windowDates } = await import('../src/util.js');
raw.prepare('UPDATE calendars SET schedule_json = ? WHERE order_id = ?').run(JSON.stringify(generateSchedule([JSON.parse(sur('a')), JSON.parse(sur('b'))], 777, windowDates('2026-12-01'), 'Львівська')), o1.orderId);

// ---- замовлення: список, фільтри, пошук ----
let r = (await A('a', 'GET', '/api/admin/orders')).j; assert.equal(r.total, 3);
assert.equal((await A('a', 'GET', '/api/admin/orders?status=paid')).j.total, 2);
assert.equal((await A('a', 'GET', '/api/admin/orders?status=pending')).j.total, 1);
assert.equal((await A('a', 'GET', '/api/admin/orders?promo=tenoff')).j.orders[0].id, o2.orderId);
assert.equal((await A('a', 'GET', '/api/admin/orders?q=' + encodeURIComponent('Київ'))).j.total, 1);
assert.equal((await A('a', 'GET', '/api/admin/orders?q=' + encodeURIComponent('b1@t'))).j.total, 1);
assert.equal((await A('a', 'GET', '/api/admin/orders?q=' + encodeURIComponent('%'))).j.total, 0, 'LIKE wildcards escaped');
// ---- картка замовлення: без приватних відповідей ----
const det = (await A('a', 'GET', '/api/admin/orders/' + o1.orderId)).j;
assert.equal(det.members.length, 2); assert(det.members.every(x => x.survey_done)); assert.equal(det.calendar.ready, true);
assert(!JSON.stringify(det).includes('SECRET_TASTE'), 'survey content is never exposed');
// ---- зміна даних до старту ----
env.NOW_OVERRIDE = '2026-11-25T10:00:00Z';
const mails0 = outbox().length;
r = (await A('a', 'POST', `/api/admin/orders/${o1.orderId}/update`, { startDate: '2026-12-06' })).j; assert(r.ok && r.changed.includes('start_date'));
assert.equal(raw.prepare('SELECT start_date FROM calendars WHERE order_id = ?').get(o1.orderId).start_date, '2026-12-06');
const sch = JSON.parse(raw.prepare('SELECT schedule_json FROM calendars WHERE order_id = ?').get(o1.orderId).schedule_json);
assert.equal(sch.seed, 777, 'schedule regenerated with the same seed');
const { GIFTS } = await import('../src/logic.js'); assert.equal(GIFTS[sch.days[1].gift[0]].day, 6, 'Nicholas special moves to the new start date');
assert.equal((await A('a', 'POST', `/api/admin/orders/${o1.orderId}/update`, { emailA: 'b1@t.com' })).j.error, 'same_email');
assert.equal((await A('a', 'POST', `/api/admin/orders/${o1.orderId}/update`, { startDate: '2026-02-30' })).j.error, 'bad_date');
r = (await A('a', 'POST', `/api/admin/orders/${o1.orderId}/update`, { emailB: 'new-b@t.com' })).j; assert.deepEqual(r.emailsReissued, [1]);
assert.equal(outbox().length, mails0 + 1); assert.equal(outbox().at(-1).to_email, 'new-b@t.com');
assert.equal(raw.prepare('SELECT email FROM members WHERE id = ?').get(memb[1].id).email, 'new-b@t.com');
assert.equal(raw.prepare('SELECT email_b FROM orders WHERE id = ?').get(o1.orderId).email_b, 'new-b@t.com');
// після старту дату міняти не можна
env.NOW_OVERRIDE = '2026-12-08T10:00:00Z';
assert.equal((await A('a', 'POST', `/api/admin/orders/${o1.orderId}/update`, { startDate: '2026-12-20' })).j.error, 'already_started');
// ---- повторне надсилання доступу ----
const m1 = outbox().length; await A('a', 'POST', `/api/admin/orders/${o1.orderId}/resend`, {}); assert.equal(outbox().length, m1 + 2);
await A('a', 'POST', `/api/admin/orders/${o1.orderId}/note`, { note: 'VIP клієнт' }); assert.equal(raw.prepare('SELECT note FROM orders WHERE id = ?').get(o1.orderId).note, 'VIP клієнт');

// ---- повернення коштів і закриття доступу ----
const login = outbox().at(-2).body; // лист для slot 0
await call('c0', 'POST', '/api/auth/verify', { token: tok(login) }); assert.equal((await call('c0', 'GET', '/api/state')).status, 200, 'customer has access');
assert.equal((await A('a', 'POST', `/api/admin/orders/${o3.orderId}/refund`, {})).j.error, 'not_paid');
assert.equal((await A('a', 'POST', `/api/admin/orders/${o2.orderId}/refund`, { amountKop: 99999 })).j.error, 'bad_amount');
assert((await A('a', 'POST', `/api/admin/orders/${o1.orderId}/refund`, { amountKop: 10000, note: 'за запитом' })).j.ok);
assert.equal((await call('c0', 'GET', '/api/state')).status, 401, 'access revoked after refund');
assert.equal((await A('a', 'POST', `/api/admin/orders/${o1.orderId}/refund`, {})).j.error, 'already_refunded');
const mm = outbox().length; await call('q', 'POST', '/api/auth/request', { email: 'a1@t.com' }); assert.equal(outbox().length, mm, 'no login links for refunded orders');

// ---- промокоди ----
assert.equal((await A('a', 'POST', '/api/admin/promos', { code: 'ab', type: 'percent', value: 10 })).j.error, 'bad_code');
assert.equal((await A('a', 'POST', '/api/admin/promos', { code: 'BAD1', type: 'percent', value: 150 })).j.error, 'bad_value');
let cr = (await A('a', 'POST', '/api/admin/promos', { code: 'blog-ann', type: 'fixed', value: 50, maxUses: 5, expiresAt: '2027-01-01', label: 'Блог Анни' })).j; assert(cr.ok);
const pr = (await A('a', 'GET', '/api/admin/promos')).j.promos; const ann = pr.find(p => p.code === 'BLOG-ANN'); assert.equal(ann.value, 5000, 'UAH -> kop'); assert.equal(ann.max_uses, 5);
assert.equal((await A('a', 'POST', '/api/admin/promos', { code: 'BLOG-ANN', type: 'percent', value: 5 })).j.error, 'code_exists');
assert((await A('a', 'POST', `/api/admin/promos/${ann.id}`, { active: false, maxUses: 10 })).j.ok);
assert.equal(raw.prepare('SELECT active, max_uses FROM promo_codes WHERE id = ?').get(ann.id).active, 0);
env.NOW_OVERRIDE = '2026-11-25T10:00:00Z';
assert.equal((await call('x', 'POST', '/api/promo/check', { code: 'blog-ann' })).j.reason, 'inactive');
const ten = pr.find(p => p.code === 'TENOFF'); assert.equal(ten.paid_orders, 1); assert.equal(ten.discount_kop, 4000); assert.equal(ten.revenue_kop, 36000);

// ---- клієнти й CSV ----
const cu = (await A('a', 'GET', '/api/admin/customers')).j.customers; assert(cu.find(c => c.email === 'a2@t.com').paid_kop === 36000);
const csv = await call('a', 'GET', '/api/admin/customers.csv'); assert(csv.ct.includes('text/csv')); assert(csv.text.includes('email,імена'));
assert(csv.text.includes("'=HYPERLINK"), 'CSV formula injection neutralised'); assert(!/(^|,)=HYPERLINK/m.test(csv.text));
// ---- налаштування відсотків (форма в адмінці) ----
assert.deepEqual((await A('a', 'GET', '/api/admin/settings')).j.settings, { fee_percent: 2, fee_foreign_percent: 2, tax_percent: 5, military_percent: 1, price_uah: 400, price_eur: 0, usd_rate: 41, places_monthly_cap: 2000 }, 'defaults: fee from env, 5% + 1%, price from env, EUR price not set');
assert.equal((await A('a', 'POST', '/api/admin/settings', { fee_percent: 120 })).j.error, 'bad_percent');
assert.equal((await A('a', 'POST', '/api/admin/settings', { tax_percent: 'abc' })).j.error, 'bad_percent');
assert.deepEqual((await A('a', 'POST', '/api/admin/settings', { fee_percent: '2', tax_percent: '5', military_percent: '0' })).j.settings, { fee_percent: 2, fee_foreign_percent: 2, tax_percent: 5, military_percent: 0, price_uah: 400, price_eur: 0, usd_rate: 41, places_monthly_cap: 2000 });
// ціна з адмінки
assert.equal((await A('a', 'POST', '/api/admin/settings', { price_uah: 0 })).j.error, 'bad_price'); assert.equal((await A('a', 'POST', '/api/admin/settings', { price_uah: 'x' })).j.error, 'bad_price');
assert.equal((await call('x', 'GET', '/api/config')).j.price, 400);
assert.equal((await A('a', 'POST', '/api/admin/settings', { price_uah: '549,50' })).j.settings.price_uah, 549.5);
assert.equal((await call('x', 'GET', '/api/config')).j.price, 549.5, 'public price follows the admin setting');
assert.equal((await call('x', 'POST', '/api/promo/check', { code: 'tenoff' })).j.finalKop, 49455, '10% off the new price');
const oNew = (await call('x', 'POST', '/api/orders', { nameA: 'А', nameB: 'Б', emailA: 'np1@t.com', emailB: 'np2@t.com', city: 'Львів', region: 'Львівська', startDate: '2026-12-01', age18: true, terms: true })).j; assert.equal(oNew.amountKop, 54950, 'new order uses new price'); raw.prepare('DELETE FROM orders WHERE id = ?').run(oNew.orderId);
assert((await A('a', 'POST', '/api/admin/settings', { price_uah: 400 })).j.ok);
assert.equal((await call('a', 'POST', '/api/admin/settings', { fee_percent: 1 })).j.error, 'csrf');
// ---- комісія: українські та іноземні картки, повернення не в день оплати ----
assert((await A('a', 'POST', '/api/admin/settings', { fee_percent: 1.3, fee_foreign_percent: 2 })).j.ok);
{ const base = (await A('a', 'GET', '/api/admin/dashboard?days=30')).j.kpi.fee_kop;
  raw.prepare("UPDATE orders SET country = 'DE' WHERE id = ?").run(o2.orderId); // o2: 36000 * 2% (іноземна) замість 1,3%
  const foreign = (await A('a', 'GET', '/api/admin/dashboard?days=30')).j.kpi.fee_kop; assert.equal(foreign, 720, '2% foreign card'); assert.equal(base, Math.round(36000 * 1.3 / 100), '1.3% Ukrainian card');
  raw.prepare('UPDATE orders SET refunded_at = ? WHERE id = ?').run(Date.now() + 3 * 864e5, o1.orderId); // повернення не в день оплати: комісія лишається
  const later = (await A('a', 'GET', '/api/admin/dashboard?days=30')).j.kpi.fee_kop; assert.equal(later, 720 + Math.round(40000 * 1.3 / 100), 'fee is kept when refunded on another day');
  raw.prepare('UPDATE orders SET refunded_at = paid_at WHERE id = ?').run(o1.orderId); raw.prepare("UPDATE orders SET country = NULL WHERE id = ?").run(o2.orderId);
  assert((await A('a', 'POST', '/api/admin/settings', { fee_percent: 2, fee_foreign_percent: 2 })).j.ok); }
// ---- дашборд ----
const d = (await A('a', 'GET', '/api/admin/dashboard?days=30')).j.kpi;
assert.equal(d.paid, 2); assert.equal(d.created, 3); assert.equal(d.revenue_kop, 76000); assert.equal(d.discount_kop, 4000); assert.equal(d.list_kop, 80000);
assert.equal(d.refunds_kop, 10000); assert.equal(d.net_revenue_kop, 66000);
assert.equal(d.fee_kop, 720, 'o1 refunded the same day: no fee; o2 (UA card, 2% from env): 36000 * 2%'); assert.equal(d.tax_base_kop, 66000 - 720, 'податкова база: після повернень і комісії банку'); assert.equal(d.tax_kop, 3264, '5% від (66000 - 720)'); assert.equal(d.profit_kop, 66000 - 720 - 3264);
assert.equal(d.abandoned, 0); assert.equal(d.pending, 1); assert(Math.abs(d.conversion - 2 / 3) < 1e-9);
const dash = (await A('a', 'GET', '/api/admin/dashboard?days=30')).j;
assert.equal(dash.series.length, 30); assert.equal(dash.series.reduce((s, x) => s + x.revenue_kop, 0), 66000);
assert.equal(dash.funnel.find(f => f.key === 'paid').n, 2); assert.equal(dash.funnel.find(f => f.key === 'surveys').n, 1);
assert.equal(dash.promos[0].name, 'TENOFF'); assert.equal(dash.regions.length, 2);
assert((await A('a', 'GET', '/api/admin/dashboard?days=all')).j.ok);

// ---- скринька підтримки ----
const now = Date.now();
raw.prepare("INSERT INTO threads (email, name, status, last_at, last_subject, unread) VALUES ('a2@t.com','Анна','open',?,'Де лист?',1)").run(now);
raw.prepare("INSERT INTO messages (id, thread_email, direction, from_email, subject, body_text, created_at, msg_id) VALUES ('m1','a2@t.com','in','a2@t.com','Де лист?','Не прийшов лист', ?, '<abc@mail>')").run(now);
let ib = (await A('a', 'GET', '/api/admin/inbox')).j.threads; assert.equal(ib.length, 1); assert.equal(ib[0].unread, 1); assert.equal(ib[0].orders, 1);
let th = (await A('a', 'GET', '/api/admin/inbox/thread/' + encodeURIComponent('a2@t.com'))).j; assert.equal(th.messages.length, 1); assert.equal(th.orders.length, 1);
assert.equal((await A('a', 'GET', '/api/admin/inbox')).j.threads[0].unread, 0, 'opening marks read');
const ml = outbox().length;
assert((await A('a', 'POST', '/api/admin/inbox/thread/' + encodeURIComponent('a2@t.com') + '/reply', { body: 'Надіслали вам посилання ще раз.', close: true })).j.ok);
assert.equal(outbox().length, ml + 1); assert.equal(outbox().at(-1).to_email, 'a2@t.com'); assert(outbox().at(-1).subject.startsWith('Re:'));
assert.equal((await A('a', 'GET', '/api/admin/inbox?status=open')).j.threads.length, 0); assert.equal((await A('a', 'GET', '/api/admin/inbox?status=closed')).j.threads.length, 1);
assert.equal((await A('a', 'POST', '/api/admin/inbox/thread/' + encodeURIComponent('a2@t.com') + '/reply', { body: '' })).j.error, 'empty');
// ---- прийом вхідних листів (Email Worker) ----
{
  const { saveInbound } = await import('../workers/mail/src/ingest.js');
  let s = await saveInbound(db, { from: { name: 'Олена', address: 'Olena@Example.com' }, subject: 'Питання', text: 'Привіт!', messageId: '<m-1@x>' }, 'x@x.com'); assert(s.saved);
  assert.equal((await saveInbound(db, { from: { address: 'olena@example.com' }, subject: 'Питання', text: 'Привіт!', messageId: '<m-1@x>' }, 'x')).reason, 'duplicate', 'same Message-ID ignored');
  await saveInbound(db, { from: { address: 'olena@example.com' }, subject: 'Ще одне', html: '<p>Привіт<br>&amp; дякую</p><style>p{}</style>', messageId: '<m-2@x>' }, 'x');
  assert.equal((await saveInbound(db, { from: { address: 'MAILER-DAEMON@x.com' }, subject: 's', text: 't' }, 'x')).reason, 'automated');
  assert.equal((await saveInbound(db, { subject: 's', text: 't' }, '')).reason, 'no_sender');
  const th = raw.prepare("SELECT * FROM threads WHERE email = 'olena@example.com'").get(); assert.equal(th.unread, 2); assert.equal(th.name, 'Олена'); assert.equal(th.status, 'open');
  const m = raw.prepare("SELECT body_text FROM messages WHERE msg_id = '<m-2@x>'").get(); assert.equal(m.body_text, 'Привіт\n& дякую', 'html -> text');
  // лист від клієнта в закритій гілці знову відкриває її
  raw.prepare("UPDATE threads SET status = 'closed' WHERE email = 'olena@example.com'").run();
  await saveInbound(db, { from: { address: 'olena@example.com' }, subject: 'Re', text: 'ще питання' }, 'x');
  assert.equal(raw.prepare("SELECT status FROM threads WHERE email = 'olena@example.com'").get().status, 'open');
  const view = (await A('a', 'GET', '/api/admin/inbox/thread/' + encodeURIComponent('olena@example.com'))).j; assert.equal(view.messages.length, 3);
}
// ---- журнал дій ----
const au = (await A('a', 'GET', '/api/admin/audit')).j.rows.map(x => x.action);
for (const k of ['login', 'update_order', 'refund', 'resend_access', 'promo_create', 'promo_update', 'support_reply', 'export_customers']) assert(au.includes(k), 'audit has ' + k);
// ---- вихід ----
await call('a', 'POST', '/api/admin/auth/logout', {}, { 'x-admin': '1' }); assert.equal((await call('a', 'GET', '/api/admin/me')).status, 401);
console.log('ADMIN OK');
