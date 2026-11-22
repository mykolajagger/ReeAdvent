// Відновлення раніше надісланих листів у журнал «Комунікації»: з даних системи виходить рівно те, що було б записано наживо.
import assert from 'node:assert/strict';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { makeDb } from './d1.js';
import { handle } from '../src/api.js';
import { runReminders } from '../src/reminders.js';
import { runRecovery } from '../src/recovery.js';
import { restoreComms } from '../src/commsRestore.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), db = makeDb(root), raw = db._raw;
const env = { DB: db, DEV: '1', PRICE_UAH: '400', BASE_URL: 'http://x', PAYMENT_MODE: 'stub', EMAIL_MODE: 'stub', NOW_OVERRIDE: '2026-11-20T10:00:00Z', ADMIN_EMAILS: 'boss@x.com', CRON_SECRET: 'c'.repeat(24) };
const jar = {};
async function call(who, method, url, body, extra = {}) {
  const headers = { 'content-type': 'application/json', ...extra }; if (jar[who]) headers.cookie = jar[who];
  const res = await handle(new Request('http://x' + url, { method, headers, body: body ? JSON.stringify(body) : undefined }), env);
  const sc = res.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0];
  const ct = res.headers.get('content-type') || ''; return { status: res.status, j: ct.includes('json') ? await res.json() : null };
}
const A = (method, url, body) => call('a', method, url, body, { 'x-admin': '1' });
const outbox = () => raw.prepare('SELECT * FROM outbox ORDER BY id').all();
const logs = (where = '1=1', ...a) => raw.prepare(`SELECT * FROM email_log WHERE ${where} ORDER BY created_at, id`).all(...a);
const flag = () => (raw.prepare("SELECT value FROM settings WHERE key = 'comms_restored'").get() || {}).value || null;
const sig = r => [r.kind, r.to_email, r.order_id, r.phase, r.subject, r.body].join(' | ');
const H = 36e5;

await call('a', 'POST', '/api/admin/auth/request', { email: 'boss@x.com' });
assert.equal((await call('a', 'POST', '/api/admin/auth/verify', { token: outbox().at(-1).body.match(/#login=([\w-]+)/)[1] })).status, 200);

// ---- «життя магазину»: усе, що тут надсилається, пишеться в журнал наживо, а потім ми зімітуємо, що журналу ще не було ----
const good = { nameA: 'Микола', nameB: 'Рита', emailA: 'a1@t.com', emailB: 'b1@t.com', city: 'Львів', region: 'Львівська', startDate: '2026-12-01', age18: true, terms: true };
let ipn = 0; const order = async o => (await call('x', 'POST', '/api/orders', { ...good, ...o }, { 'cf-connecting-ip': '10.0.0.' + ++ipn })).j;
const o1 = await order({}); await call('x', 'GET', `/api/dev/pay/${o1.orderId}`);
const o2 = await order({ emailA: 'a2@t.com', emailB: 'b2@t.com', nameA: 'Анна', nameB: 'Олег' }); await call('x', 'GET', `/api/dev/pay/${o2.orderId}`);
const o5 = await order({ emailA: 'a5@t.com', emailB: 'b5@t.com', nameA: 'Марко', nameB: 'Дана', startDate: '2026-12-05' }); await call('x', 'GET', `/api/dev/pay/${o5.orderId}`);
const o3 = await order({ emailA: 'a3@t.com', emailB: 'b3@t.com', nameA: 'Софія', nameB: 'Іван' });
assert((await A('POST', `/api/admin/orders/${o1.orderId}/update`, { emailB: 'b1new@t.com' })).j.ok, 'адміністратор виправив пошту партнера: доступ пішов на нову адресу');
const NOW = Date.now(); raw.prepare('UPDATE orders SET created_at = ? WHERE id = ?').run(NOW - 3 * H, o3.orderId);
raw.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('agent_recovery', '1', 0)").run();
await runRecovery(env, { now: NOW }); await runRecovery(env, { now: NOW + 24 * H });
env.NOW_OVERRIDE = '2026-11-30T10:00:00Z'; const rem = await runReminders(env); assert.equal(rem.survey, 4, JSON.stringify(rem));
env.NOW_OVERRIDE = '2026-11-25T10:00:00Z';
raw.prepare("INSERT INTO threads (email, name, status, last_at, last_subject, unread) VALUES ('a2@t.com','Анна','open',?,'Де лист?',1)").run(Date.now());
raw.prepare("INSERT INTO messages (id, thread_email, direction, from_email, subject, body_text, created_at, msg_id) VALUES ('m1','a2@t.com','in','a2@t.com','Де лист?','Не прийшов лист', ?, '<abc@mail>')").run(Date.now());
assert((await A('POST', '/api/admin/inbox/thread/' + encodeURIComponent('a2@t.com') + '/reply', { body: 'Надіслали вам посилання ще раз.' })).j.ok);
assert((await A('POST', `/api/admin/orders/${o2.orderId}/resend`, {})).j.ok, 'доступ обом');
assert((await A('POST', `/api/admin/orders/${o1.orderId}/resend`, { slot: 1 })).j.ok, 'доступ партнеру на нову адресу');
assert((await call('x', 'POST', '/api/auth/request', { email: 'a1@t.com' })).j.ok, 'клієнт попросив посилання для входу');
assert((await A('POST', `/api/admin/orders/${o5.orderId}/refund`, { method: 'manual', revoke: true, notify: true })).j.ok);

const live = logs(); const kinds = [...new Set(live.map(r => r.kind))].sort();
assert.deepEqual(kinds, ['access', 'login', 'partner_invite', 'recovery_1', 'recovery_2', 'refund', 'reminder_survey', 'support_reply', 'welcome'], kinds.join());
assert.equal(live.length, 19); assert(live.every(r => r.status === "sent"));
assert(live.some(r => r.kind === 'partner_invite' && r.to_email === 'b1@t.com') && live.some(r => r.kind === 'access' && r.to_email === 'b1new@t.com'), 'живий журнал: партнер спершу на старій пошті, потім доступ на нову');
const liveSig = live.map(sig).sort();

// ---- журналу «ще не було»: стираємо, відновлюємо, порівнюємо ----
raw.exec('DELETE FROM email_log');
assert.equal(flag(), null);
const dry = await restoreComms(env, { dry: true }); assert.equal(dry.added, 0); assert.equal(dry.remaining, live.length, 'пробний прогін нічого не пише, але знає, скільки листів можна відновити'); assert.equal(logs().length, 0); assert.equal(flag(), null);
const r1 = await restoreComms(env); assert.equal(r1.added, live.length, JSON.stringify(r1)); assert(r1.done && r1.remaining === 0); assert(flag(), 'прапорець: відновлення завершено');
const rest = logs(); assert(rest.every(r => r.status === 'restored' && r.error === null && r.ext_id), 'усі записи мають статус «відновлено» й ключ');
assert.deepEqual(rest.map(sig).sort(), liveSig, 'відновлені листи збігаються з тими, що записано наживо: адресат, тип, замовлення, етап, тема й текст');
assert(rest.every(r => !/login=restored|000000|resume\?s=restored|unsub\?m=[^&]+&s=restored/.test(r.body)), 'підставних посилань і кодів у тексті немає');
assert.deepEqual(r1.counts, Object.fromEntries(kinds.map(k => [k, live.filter(r => r.kind === k).length])));
assert.equal(rest.find(r => r.kind === 'partner_invite' && r.order_id === o1.orderId).to_email, 'b1@t.com', 'запрошення пішло на пошту, що була чинна тоді');
assert(rest.every((r, i) => i === 0 || r.created_at >= rest[i - 1].created_at));

// ---- повторний запуск і дублі ----
const r2 = await restoreComms(env); assert.equal(r2.added, 0); assert.equal(logs().length, live.length, 'повторно нічого не додає');
const o6 = await order({ emailA: 'a6@t.com', emailB: 'b6@t.com', nameA: 'Ліна', nameB: 'Тимур', startDate: '2026-12-08' }); await call('x', 'GET', `/api/dev/pay/${o6.orderId}`);
assert.equal(logs('order_id = ?', o6.orderId).filter(r => r.status === 'sent').length, 2, 'нові листи пишуться наживо');
const r3 = await restoreComms(env); assert.equal(r3.added, 0, 'листи, що вже є в журналі наживо, не дублюються: ' + JSON.stringify(r3));
raw.prepare("DELETE FROM email_log WHERE kind = 'partner_invite' AND order_id = ?").run(o6.orderId);
const r4 = await restoreComms(env); assert.equal(r4.added, 1); assert.deepEqual(r4.counts, { partner_invite: 1 }); assert.equal(logs("kind = 'partner_invite' AND order_id = ?", o6.orderId)[0].status, 'restored', 'втрачений запис відновлено');

// ---- порціями: ліміт на виклик, прапорець лише в кінці ----
raw.exec('DELETE FROM email_log'); raw.exec("DELETE FROM settings WHERE key = 'comms_restored'");
const total = (await restoreComms(env, { dry: true })).remaining; let left = total, added = 0, calls = 0, last;
for (;;) { last = await restoreComms(env, { limit: 7 }); calls++; added += last.added; assert(last.remaining < left, 'залишок зменшується'); left = last.remaining; assert.equal(!!flag(), last.done, 'прапорець ставиться лише коли все відновлено'); if (last.done) break; assert(calls < 50); }
assert.equal(added, total); assert.equal(calls, Math.ceil(total / 7)); assert.equal(logs().length, total); assert.deepEqual(logs().map(sig).sort(), [...liveSig, ...logs('order_id = ?', o6.orderId).map(sig)].sort());

// ---- порядок у списку: старі відновлені листи не перебивають нові ----
raw.exec('DELETE FROM email_log'); raw.exec("DELETE FROM settings WHERE key = 'comms_restored'");
raw.prepare("INSERT INTO email_log (created_at, to_email, subject, kind, phase, status, body) VALUES (?, 'new@t.com', 'Свіжий', 'login', 'during', 'sent', 'x')").run(Date.UTC(2027, 0, 1));
await restoreComms(env);
let page = (await A('GET', '/api/admin/comms?limit=6')).j; assert.equal(page.rows[0].to, 'new@t.com', 'найновіший лист зверху, хоч запис створено першим');
let prev = Infinity, cur = '', n = 0; for (;;) { const pg = (await A('GET', `/api/admin/comms?limit=9${cur ? '&before=' + cur : ''}`)).j; for (const r of pg.rows) { assert(r.at <= prev); prev = r.at; n++; } if (!pg.more) break; cur = pg.next; } assert.equal(n, logs().length);

// ---- API адмінки ----
assert.equal(page.stats.restored, logs().length - 1); assert(page.restore.at > 0); assert.equal(page.stats.liveFirst, logs("status = 'sent'")[0].created_at, 'точний облік починається з першого живого листа');
assert.equal((await A('GET', '/api/admin/comms?status=restored&limit=100')).j.rows.every(r => r.status === 'restored'), true); assert.equal((await A('GET', '/api/admin/comms?status=sent')).j.rows.length, 1);
const some = (await A('GET', '/api/admin/comms?status=restored&kind=welcome')).j.rows[0], det = (await A('GET', '/api/admin/comms/' + some.id)).j.mail; assert.equal(det.status, 'restored'); assert(det.body.includes('/app/#…'));
raw.exec("DELETE FROM settings WHERE key = 'comms_restored'"); raw.exec("DELETE FROM email_log WHERE status = 'restored'");
assert.equal((await call('c', 'POST', '/api/admin/comms/restore', {}, { 'x-admin': '1' })).status, 401, 'без входу відновлення недоступне'); assert.equal((await call('a', 'POST', '/api/admin/comms/restore', {})).j.error, 'csrf');
const api = (await A('POST', '/api/admin/comms/restore', {})).j; assert(api.ok && api.done && api.added > 0 && api.counts.welcome >= 3, JSON.stringify(api)); assert(flag());
assert((await A('GET', '/api/admin/audit')).j.rows.some(x => x.action === 'comms_restore'), 'дію записано в журнал дій');
assert.equal((await A('POST', '/api/admin/comms/restore', {})).j.added, 0);
console.log('OK comms-restore');
