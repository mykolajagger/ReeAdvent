// Журнал листів клієнтам («Комунікації»): запис, етапи до/під час/після, приховування секретів, помилки відправки, API адмінки, чистка.
import assert from 'node:assert/strict';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { makeDb } from './d1.js';
import { handle, markPaid } from '../src/api.js';
import { runReminders, purgeOld } from '../src/reminders.js';
import { runRecovery } from '../src/recovery.js';
import { sendEmail } from '../src/email.js';
import { redact, phaseFor } from '../src/comms.js';

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
const outbox = () => raw.prepare('SELECT * FROM outbox ORDER BY id').all(), logs = (where = '1=1', ...a) => raw.prepare(`SELECT * FROM email_log WHERE ${where} ORDER BY id`).all(...a);
const H = 36e5;

// ---- чисті функції ----
assert.equal(redact('Відкрити: https://reeadvent.fun/app/#login=abc123XYZ'), 'Відкрити: https://reeadvent.fun/app/#…');
assert.equal(redact('a https://x.y/z?m=1&s=2 b'), 'a https://x.y/z?… b'); assert.equal(redact('https://x.y/plain'), 'https://x.y/plain');
assert.equal(redact('код входу: 123456 (діє 7 днів, 5 спроб)'), 'код входу: •••••• (діє 7 днів, 5 спроб)'); assert.equal(redact('enter 654321 (valid 30 minutes)'), 'enter •••••• (valid 30 minutes)');
assert(redact('Телефон 123456 без дужок').includes('123456'), 'інші числа не чіпаємо'); assert.equal(redact(null), '');
assert.equal(phaseFor('recovery_1', '2026-12-01', Date.UTC(2026, 11, 30)), 'before'); assert.equal(phaseFor('refund', '2026-12-01', Date.UTC(2026, 10, 1)), 'after');
assert.equal(phaseFor('welcome', null, Date.UTC(2030, 0, 1)), 'during', 'без дати старту: під час');
assert.equal(phaseFor('reminder_window', '2026-12-01', Date.UTC(2026, 11, 24, 23, 59)), 'during', 'останнє вікно ще триває'); assert.equal(phaseFor('support_reply', '2026-12-01', Date.UTC(2026, 11, 25, 0, 1)), 'after');

// ---- вхід в адмінку ----
await call('a', 'POST', '/api/admin/auth/request', { email: 'boss@x.com' });
assert.equal((await call('a', 'POST', '/api/admin/auth/verify', { token: outbox().at(-1).body.match(/#login=([\w-]+)/)[1] })).status, 200);
assert.equal(logs().length, 0, 'службовий лист адміну в журнал клієнтів не потрапляє');
assert.equal((await call('c', 'GET', '/api/admin/comms')).status, 401, 'без входу журналу не видно');

// ---- без таблиці (міграцію 0011 ще не виконано): журнал створює її сам, а якщо не може, відправка й адмінка все одно не ламаються ----
import fs from 'node:fs'; import { DDL } from '../src/comms.js';
const mig = fs.readFileSync(path.join(root, 'migrations/0011_email_log.sql'), 'utf8'), cols = () => raw.prepare('PRAGMA table_info(email_log)').all().map(c => `${c.name}:${c.type}:${c.notnull}`).join();
for (const sql of DDL) assert(mig.includes(sql), 'схема в коді збігається з міграцією: ' + sql.slice(0, 50));
const origCols = cols(); raw.exec('ALTER TABLE email_log RENAME TO email_log_x');
const envBroken = { ...env, DB: { prepare: sql => /^\s*CREATE/i.test(sql) ? { bind: () => ({ run: async () => { throw new Error('denied') } }), run: async () => { throw new Error('denied') } } : db.prepare(sql), batch: db.batch } };
await sendEmail(envBroken, 'z@x.com', 'Тема', '<p>h</p>', 'текст', { meta: { kind: 'login' } }); assert.equal(outbox().at(-1).to_email, 'z@x.com', 'лист відправлено попри збій журналу');
const hint = (await handle(new Request('http://x/api/admin/comms', { headers: { cookie: jar.a } }), envBroken)); assert.equal((await hint.json()).migrate, true, 'якщо таблицю створити не вдалося: підказка про міграцію');
assert.equal((await handle(new Request('http://x/api/admin/comms/1', { headers: { cookie: jar.a } }), envBroken)).status, 404);
const healed = (await A('GET', '/api/admin/comms')).j; assert(healed.ok && !healed.migrate && healed.rows.length === 0 && healed.stats.total === 0, 'таблицю створено автоматично: ' + JSON.stringify(healed));
assert.equal(cols(), origCols, 'автоматично створена таблиця збігається зі схемою міграції');
await sendEmail(env, 'y@x.com', 'Тема', '<p>h</p>', 'текст', { meta: { kind: 'login' } }); assert.equal(logs("to_email = 'y@x.com'").length, 1);
raw.exec('DROP TABLE email_log'); raw.exec('ALTER TABLE email_log_x RENAME TO email_log'); raw.exec('DELETE FROM email_log'); raw.exec('DELETE FROM outbox');

// ---- під час замовлення: підтвердження покупцю й запрошення партнеру ----
const good = { nameA: 'Микола', nameB: 'Рита', emailA: 'a1@t.com', emailB: 'b1@t.com', city: 'Львів', region: 'Львівська', startDate: '2026-12-01', age18: true, terms: true };
let ipn = 0; const order = async o => (await call('x', 'POST', '/api/orders', { ...good, ...o }, { 'cf-connecting-ip': '10.0.0.' + ++ipn })).j;
const o1 = await order({}); await call('x', 'GET', `/api/dev/pay/${o1.orderId}`);
const o2 = await order({ emailA: 'a2@t.com', emailB: 'b2@t.com', nameA: 'Анна', nameB: 'Олег' }); await call('x', 'GET', `/api/dev/pay/${o2.orderId}`);
const o3 = await order({ emailA: 'a3@t.com', emailB: 'b3@t.com', nameA: 'Софія', nameB: 'Іван' });                      // не оплачено
let L = logs('order_id = ?', o1.orderId); assert.deepEqual(L.map(r => r.kind), ['welcome', 'partner_invite']); assert.deepEqual(L.map(r => r.to_email), ['a1@t.com', 'b1@t.com']);
assert(L.every(r => r.phase === 'during' && r.status === 'sent' && r.member_id && r.error === null));
const mailA = outbox().find(m => m.to_email === 'a1@t.com'), tokA = mailA.body.match(/#login=([\w-]+)/)[1], codeA = mailA.body.match(/:\s*(\d{6})\s*\(/)[1];
assert(!L[0].body.includes(tokA) && !L[0].body.includes(codeA), 'у журналі немає чинного посилання й коду'); assert(L[0].body.includes('http://x/app/#…') && L[0].body.includes('••••••'), L[0].body);
assert.equal(L[0].subject, mailA.subject);

// ---- до замовлення: нагадування про незавершену оплату ----
const NOW = Date.now(); raw.prepare('UPDATE orders SET created_at = ? WHERE id = ?').run(NOW - 3 * H, o3.orderId);
raw.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('agent_recovery', '1', 0)").run();
assert.equal((await runRecovery(env, { now: NOW })).sent, 1); assert.equal((await runRecovery(env, { now: NOW + 24 * H })).sent, 1);
L = logs('order_id = ?', o3.orderId); assert.deepEqual(L.map(r => [r.kind, r.phase, r.to_email, r.status]), [['recovery_1', 'before', 'a3@t.com', 'sent'], ['recovery_2', 'before', 'a3@t.com', 'sent']]);
assert(L[0].body.includes('/resume?…') || L[0].body.includes('/resume'), L[0].body); assert(!/resume\?s=[\w-]+/.test(L[0].body), 'підпис відновлення приховано');

// ---- нагадування під час підготовки до старту ----
env.NOW_OVERRIDE = '2026-11-30T10:00:00Z';
const rem = await runReminders(env); assert(rem.survey >= 2, JSON.stringify(rem));
L = logs("kind = 'reminder_survey' AND order_id = ?", o1.orderId); assert.equal(L.length, 2); assert(L.every(r => r.phase === 'during' && r.member_id)); assert(!/unsub\?m=/.test(L[0].body) && L[0].body.includes('/api/unsub?…'), L[0].body);

// ---- відповідь підтримки: прив'язка до замовлення за поштою ----
const t0 = Date.now(); raw.prepare("INSERT INTO threads (email, name, status, last_at, last_subject, unread) VALUES ('a2@t.com','Анна','open',?,'Де лист?',1)").run(t0);
raw.prepare("INSERT INTO messages (id, thread_email, direction, from_email, subject, body_text, created_at, msg_id) VALUES ('m1','a2@t.com','in','a2@t.com','Де лист?','Не прийшов лист', ?, '<abc@mail>')").run(t0);
assert((await A('POST', '/api/admin/inbox/thread/' + encodeURIComponent('a2@t.com') + '/reply', { body: 'Надіслали вам посилання ще раз.' })).j.ok);
L = logs("kind = 'support_reply'"); assert.equal(L.length, 1); assert.equal(L[0].order_id, o2.orderId); assert.equal(L[0].phase, 'during'); assert(L[0].body.includes('Надіслали вам посилання'));

// ---- після замовлення: повернення коштів і доступ після завершення календаря ----
assert((await A('POST', `/api/admin/orders/${o2.orderId}/refund`, { method: 'manual', revoke: true, notify: true })).j.ok);
L = logs("kind = 'refund'"); assert.equal(L.length, 1); assert.deepEqual([L[0].phase, L[0].order_id, L[0].to_email], ['after', o2.orderId, 'a2@t.com']);
env.NOW_OVERRIDE = '2026-12-26T10:00:00Z';
assert((await A('POST', `/api/admin/orders/${o1.orderId}/resend`, {})).j.ok);
L = logs("kind = 'access' AND order_id = ?", o1.orderId); assert.equal(L.length, 2); assert(L.every(r => r.phase === 'after'), 'через два дні після завершення календаря: після замовлення');
env.NOW_OVERRIDE = '2026-12-10T10:00:00Z';
assert((await A('POST', `/api/admin/orders/${o1.orderId}/resend`, { slot: 0 })).j.ok); assert.equal(logs("kind = 'access' AND order_id = ?", o1.orderId).at(-1).phase, 'during', 'посеред календаря: під час');

// ---- помилки відправки: потрапляють у журнал, а підтвердження оплати не ламається ----
const realFetch = globalThis.fetch; let resendStatus = 500, resendCalls = 0;
globalThis.fetch = async (u, o) => { if (String(u).includes('api.resend.com')) { resendCalls++; return resendStatus === 200 ? new Response(JSON.stringify({ id: 'em_test_1' })) : new Response('{"message":"quota exceeded"}', { status: resendStatus }); } return realFetch(u, o); };
const envR = { ...env, EMAIL_MODE: 'resend', RESEND_API_KEY: 'k', EMAIL_FROM: 'ReeAdvent <hi@x.com>' };
const n0 = logs().length;
await assert.rejects(sendEmail(envR, 'f@x.com', 'Тема', '<p>h</p>', 'тіло', { meta: { kind: 'login' } }), /email_error/);
let F = logs("to_email = 'f@x.com'"); assert.equal(F.length, 1); assert.equal(F[0].status, 'failed'); assert(F[0].error.includes('Resend 500') && F[0].error.includes('quota'), F[0].error);
resendStatus = 200; await sendEmail(envR, 'g@x.com', 'Тема', '<p>h</p>', 'тіло', { meta: { kind: 'login' } });
F = logs("to_email = 'g@x.com'"); assert.equal(F[0].status, 'sent'); assert.equal(F[0].ext_id, 'em_test_1');
await sendEmail(envR, 'h@x.com', 'Службовий', '<p>h</p>', 'тіло'); assert.equal(logs("to_email = 'h@x.com'").length, 0, 'без meta лист не журналиться'); assert.equal(logs().length, n0 + 2);
resendStatus = 500; const o4 = await order({ emailA: 'a4@t.com', emailB: 'b4@t.com', nameA: 'Марко', nameB: 'Дана', startDate: '2026-12-20' });
await markPaid(envR, o4.orderId);                                                                                      // не кидає, хоч пошта лежить
assert.deepEqual(logs('order_id = ?', o4.orderId).map(r => [r.kind, r.status]), [['welcome', 'failed'], ['partner_invite', 'failed']]);
assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM members m JOIN calendars c ON c.id = m.calendar_id WHERE c.order_id = ?').get(o4.orderId).n, 2, 'календар створено, доступ можна надіслати з адмінки');
globalThis.fetch = realFetch;

// ---- API адмінки ----
const all = (await A('GET', '/api/admin/comms')).j; assert(all.ok && !all.migrate); assert.equal(all.stats.total, logs().length); assert(all.stats.before === 2 && all.stats.failed === 3 && all.stats.after >= 3 && all.stats.during >= 6, JSON.stringify(all.stats));
assert.equal(all.stats.week, all.stats.total); assert(all.stats.first > 0); assert(all.labels.welcome && all.phases.before === 'До замовлення'); assert(all.kinds.find(k => k.kind === 'welcome').n >= 3);
assert(all.rows.every(r => r.id && r.at && r.to && r.kind && r.phase) && all.rows.every(r => !('body' in r)), 'у списку без тексту листів');
assert.deepEqual((await A('GET', '/api/admin/comms?phase=before')).j.rows.map(r => r.kind).sort(), ['recovery_1', 'recovery_2']);
assert.equal((await A('GET', '/api/admin/comms?status=failed')).j.rows.length, 3);
assert.deepEqual([...new Set((await A('GET', '/api/admin/comms?kind=refund')).j.rows.map(r => r.to))], ['a2@t.com']);
assert.deepEqual([...new Set((await A('GET', '/api/admin/comms?q=A1@T.com')).j.rows.map(r => r.to))], ['a1@t.com']);
const byName = (await A('GET', '/api/admin/comms?q=' + encodeURIComponent('Рита'))).j.rows; assert(byName.length >= 4 && byName.every(r => r.orderId === o1.orderId && r.names === 'Микола і Рита'), 'пошук за іменем клієнта');
assert((await A('GET', '/api/admin/comms?q=' + o3.orderId)).j.rows.every(r => r.orderId === o3.orderId)); assert.equal((await A('GET', '/api/admin/comms?q=' + encodeURIComponent('%'))).j.rows.length, 0, 'знак % не працює як шаблон');
assert.equal((await A('GET', '/api/admin/comms?order=' + o3.orderId)).j.rows.length, 2); assert((await A('GET', '/api/admin/comms?kind=' + encodeURIComponent("x'; DROP TABLE email_log;--"))).j.rows.length > 0, 'некоректний фільтр ігнорується');
const p1 = (await A('GET', '/api/admin/comms?limit=4')).j; assert.equal(p1.rows.length, 4); assert(p1.more); assert(p1.stats);
const p2 = (await A('GET', '/api/admin/comms?limit=4&before=' + p1.rows.at(-1).id)).j; assert(p2.rows.length > 0 && p2.rows.every(r => r.id < p1.rows.at(-1).id) && !p2.stats, 'друга сторінка за курсором');
const seen = new Set(); let cur = 0, pages = 0; for (;;) { const pg = (await A('GET', `/api/admin/comms?limit=5${cur ? '&before=' + cur : ''}`)).j; pages++; for (const r of pg.rows) { assert(!seen.has(r.id)); seen.add(r.id); } if (!pg.more) break; cur = pg.rows.at(-1).id; } assert.equal(seen.size, logs().length); assert(pages >= 3);
const one = all.rows.find(r => r.kind === 'welcome'), det = (await A('GET', '/api/admin/comms/' + one.id)).j.mail; assert(det.body.length > 20 && det.label === 'Підтвердження покупцю й доступ' && det.phaseLabel === 'Під час замовлення' && det.names); assert.equal((await A('GET', '/api/admin/comms/999999')).status, 404);
const tl = (await A('GET', '/api/admin/comms/order/' + o1.orderId)).j; assert(tl.ok); assert.deepEqual(tl.milestones.map(m => m.key), ['created', 'paid', 'start', 'end']); assert.equal(tl.order.status, 'paid');
assert.deepEqual(tl.mails.map(m => m.id), [...tl.mails.map(m => m.id)].sort((a, b) => a - b)); assert(['welcome', 'partner_invite', 'reminder_survey', 'access'].every(k => tl.mails.some(m => m.kind === k)));
const tl2 = (await A('GET', '/api/admin/comms/order/' + o2.orderId)).j; assert(tl2.milestones.some(m => m.key === 'refunded') && tl2.mails.some(m => m.kind === 'refund' && m.phase === 'after'));
const tl3 = (await A('GET', '/api/admin/comms/order/' + o3.orderId)).j; assert.deepEqual(tl3.milestones.map(m => m.key), ['created']); assert.deepEqual(tl3.mails.map(m => m.phase), ['before', 'before']);
assert.equal((await A('GET', '/api/admin/comms/order/nonexistent-order')).status, 404);

// ---- чистка: персональні дані календаря й старі записи ----
raw.prepare("INSERT INTO email_log (created_at, to_email, subject, kind, phase, status) VALUES (?, 'old@x.com', 'Старий', 'login', 'during', 'sent')").run(Date.now() - 800 * 864e5);
raw.prepare('UPDATE calendars SET start_date = ? WHERE order_id = ?').run('2025-01-01', o1.orderId);
const before = logs().length, o1n = logs('order_id = ?', o1.orderId).length; assert(o1n >= 5);
env.NOW_OVERRIDE = '2026-12-10T10:00:00Z'; await purgeOld(env);
assert.equal(logs('order_id = ?', o1.orderId).length, 0, 'листи замовлення видалено разом з його персональними даними'); assert.equal(logs("to_email = 'old@x.com'").length, 0, 'старші за 24 місяці видалено');
assert.equal(logs().length, before - o1n - 1); assert(logs('order_id = ?', o3.orderId).length === 2, 'чужі записи на місці');
console.log('OK comms');
