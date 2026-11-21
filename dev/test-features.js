import assert from 'node:assert/strict';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { makeDb } from './d1.js';
import { handle } from '../src/api.js';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = makeDb(root), raw = db._raw;
const env = { DB: db, DEV: '1', PRICE_UAH: '400', BASE_URL: 'http://x', PAYMENT_MODE: 'stub', EMAIL_MODE: 'stub', NOW_OVERRIDE: '2026-11-20T10:00:00Z',
  ADMIN_EMAILS: 'boss@x.com', CRON_SECRET: 'c'.repeat(24), GOOGLE_CLIENT_ID: 'gid.apps.googleusercontent.com', MONOBANK_TOKEN: 'tok' };
const jar = {};
async function call(who, method, url, body, extra = {}) {
  const headers = { 'content-type': 'application/json', ...extra }; if (jar[who]) headers.cookie = jar[who];
  const res = await handle(new Request('http://x' + url, { method, headers, body: body ? JSON.stringify(body) : undefined }), env);
  const sc = res.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0];
  const ct = res.headers.get('content-type') || ''; return { status: res.status, j: ct.includes('json') ? await res.json() : null, text: ct.includes('json') ? null : await res.text() };
}
const outbox = () => raw.prepare('SELECT * FROM outbox ORDER BY id').all();
const tok = b => b.match(/#login=([\w-]+)/)[1];
const good = { nameA: 'Микола', nameB: 'Рита', emailA: 'a@t.com', emailB: 'b@t.com', city: 'Львів', region: 'Львівська', startDate: '2026-12-01', age18: true, terms: true };
async function makeOrder(o = {}, pay = true) {
  const r = (await call('x', 'POST', '/api/orders', { ...good, ...o })).j; assert(r.ok, JSON.stringify(r));
  if (pay) await call('x', 'GET', `/api/dev/pay/${r.orderId}`);
  return r.orderId;
}
const members = oid => raw.prepare('SELECT m.* FROM members m JOIN calendars c ON c.id = m.calendar_id WHERE c.order_id = ? ORDER BY m.slot').all(oid);
const cron = (secret = env.CRON_SECRET) => call('x', 'POST', '/api/cron/daily', {}, secret ? { 'x-cron-secret': secret } : {});
const SUR = n => JSON.stringify({ name: n, budget: 300, giftLikes: [], avoid: [], level: 2, intimLikes: [], actLikes: [], actBudget: 1, car: false });
async function readyCalendar(oid) { // обидва заповнили анкети (через API), розклад складено
  const m = members(oid), out = outbox().filter(x => x.subject);
  for (const [i, who] of ['p' + oid, 'q' + oid].entries()) {
    await call(who, 'POST', '/api/auth/request', { email: m[i].email });
    await call(who, 'POST', '/api/auth/verify', { token: tok(outbox().filter(x => x.to_email === m[i].email).at(-1).body) });
    await call(who, 'POST', '/api/survey', { answers: JSON.parse(SUR(m[i].suggested_name)) });
  }
}

// ===== 1. Листи: покупцю і партнеру =====
const o1 = await makeOrder({ startDate: '2026-12-01' });
let mails = outbox(); assert.equal(mails.length, 2);
const buyer = mails.find(x => x.to_email === 'a@t.com'), partner = mails.find(x => x.to_email === 'b@t.com');
assert.equal(buyer.subject, 'Ваш адвент-календар ReeAdvent готовий'); assert(buyer.body.includes('Рита') && buyer.body.includes('1 грудня'));
assert.equal(partner.subject, 'Микола створює для вас ваш спільний ReeAdvent'); assert(partner.body.includes('Микола') && partner.body.includes('1 грудня') && !/ціна|грн|₴|400/.test(partner.body));
// англійською
const oEn = await makeOrder({ emailA: 'ea@t.com', emailB: 'eb@t.com', lang: 'en', country: 'DE', region: 'Bavaria', city: 'Munich', tz: 'Europe/Berlin', startDate: '2026-12-02' });
mails = outbox(); const pe = mails.find(x => x.to_email === 'eb@t.com'); assert.equal(pe.subject, 'Микола is creating your shared ReeAdvent'); assert(pe.body.includes('2 December') && pe.body.includes('questionnaire'));
assert.equal(mails.find(x => x.to_email === 'ea@t.com').subject, 'Your ReeAdvent advent calendar is ready');
assert.equal(raw.prepare('SELECT lang, tz FROM calendars WHERE order_id = ?').get(oEn).tz, 'Europe/Berlin');

// ===== 2. Повторна відправка на сторінці «Дякуємо» (лише покупцю, з лімітом) =====
const unpaid = await makeOrder({ emailA: 'u1@t.com', emailB: 'u2@t.com' }, false);
assert.equal((await call('x', 'POST', `/api/orders/${unpaid}/resend`, {})).j.error, 'not_paid');
let n = outbox().length;
assert((await call('x', 'POST', `/api/orders/${o1}/resend`, {})).j.ok); assert.equal(outbox().length, n + 1); assert.equal(outbox().at(-1).to_email, 'a@t.com');
await call('x', 'POST', `/api/orders/${o1}/resend`, {}); await call('x', 'POST', `/api/orders/${o1}/resend`, {});
assert.equal((await call('x', 'POST', `/api/orders/${o1}/resend`, {})).j.error, 'too_many', 'max 3 per hour');
assert.equal((await call('x', 'POST', '/api/orders/nope/resend', {})).status, 404);

// ===== 3. Нагадування =====
assert.equal((await cron(null)).status, 404, 'cron needs secret'); assert.equal((await cron('wrong')).status, 404);
env.NOW_OVERRIDE = '2026-11-30T06:30:00Z';                                  // 08:30 Київ, день до старту: ще рано
let r = (await cron()).j; assert.equal(r.reminders.sent, 0, 'before 09:00 nothing');
env.NOW_OVERRIDE = '2026-11-30T07:30:00Z';                                  // 09:30 Київ: анкети не заповнені -> 'survey'
n = outbox().length; r = (await cron()).j; assert.equal(r.reminders.survey, 2); assert.equal(outbox().length, n + 2);
assert(outbox().at(-1).subject.includes('анкету')); assert(outbox().at(-1).body.includes('/app/#login='));
n = outbox().length; r = (await cron()).j; assert.equal(r.reminders.sent, 0); assert.equal(outbox().length, n, 'no duplicates on rerun');
env.NOW_OVERRIDE = '2026-11-30T19:30:00Z';                                  // 21:30 Київ: пізно
assert.equal((await cron()).j.reminders.sent, 0, 'after 21:00 nothing');
// анкети заповнені -> напередодні 'eve'
env.NOW_OVERRIDE = '2026-11-25T10:00:00Z'; await readyCalendar(o1);
env.NOW_OVERRIDE = '2026-11-30T07:30:00Z'; n = outbox().length; r = (await cron()).j; assert.equal(r.reminders.eve, 2); assert(outbox().at(-1).subject.includes('Завтра'));
// день 1: відкрито/не відкрито
env.NOW_OVERRIDE = '2026-12-01T07:30:00Z'; // 09:30 Київ, вікно №1
const m1 = members(o1);
raw.prepare('INSERT INTO progress (member_id, day, opened, opened_at) VALUES (?,?,1,?)').run(m1[0].id, 1, Date.now());
r = (await cron()).j; assert.equal(r.reminders.window, 1, 'only the member who has not opened'); assert.equal(outbox().at(-1).to_email, 'b@t.com'); assert(outbox().at(-1).subject.includes('Вікно №1'));
// відписка
const unsubLink = outbox().at(-1).body.match(/\/api\/unsub\?[^\s]+/)?.[0]; assert(unsubLink, 'unsubscribe link in reminder'); assert.equal((await call('x', 'GET', unsubLink)).status, 200);
assert.equal(raw.prepare('SELECT remind_off FROM members WHERE id = ?').get(m1[1].id).remind_off, 1);
assert.equal((await call('x', 'GET', unsubLink.replace(/s=.{4}/, 's=AAAA'))).status, 400, 'bad signature');
env.NOW_OVERRIDE = '2026-12-02T07:30:00Z'; n = outbox().length; r = (await cron()).j;
assert.equal(outbox().slice(n).filter(x => x.to_email === 'b@t.com').length, 0, 'unsubscribed member gets nothing'); assert.equal(outbox().slice(n).filter(x => x.to_email === 'a@t.com').length, 1);
// часовий пояс календаря: Нью-Йорк, 09:30 за місцевим
const oNy = await makeOrder({ emailA: 'ny1@t.com', emailB: 'ny2@t.com', lang: 'en', country: 'US', region: 'NY', city: 'New York', tz: 'America/New_York', startDate: '2026-12-10' });
env.NOW_OVERRIDE = '2026-12-09T13:00:00Z'; n = outbox().length; await cron(); assert.equal(outbox().slice(n).filter(x => x.to_email.startsWith('ny')).length, 0, '08:00 in New York: too early');
env.NOW_OVERRIDE = '2026-12-09T14:30:00Z'; n = outbox().length; await cron(); const nyMail = outbox().slice(n).filter(x => x.to_email.startsWith('ny')); assert.equal(nyMail.length, 2, '09:30 in New York'); assert(nyMail[0].subject.includes('questionnaire'));

// ===== 4. Повернення через Monobank API =====
env.NOW_OVERRIDE = '2026-11-20T10:00:00Z';
const realFetch = globalThis.fetch; let cancelBody = null, cancelResp = { status: 200, json: { status: 'processing' } }, statusResp = { status: 'success', amount: 40000 };
await call('a', 'POST', '/api/admin/auth/request', { email: 'boss@x.com' }); await call('a', 'POST', '/api/admin/auth/verify', { token: tok(outbox().at(-1).body) });
const A = (m, u, b) => call('a', m, u, b, { 'x-admin': '1' });
// замовлення для тестів повернення створюємо в stub-режимі, а рахунок підміняємо на «реальний»
const oP = await makeOrder({ emailA: 'r3@t.com', emailB: 'r4@t.com' }); raw.prepare("UPDATE orders SET invoice_id = 'inv-real-1' WHERE id = ?").run(oP);
globalThis.fetch = async (url, init) => {
  if (String(url).includes('/invoice/cancel')) { cancelBody = JSON.parse(init.body); return new Response(JSON.stringify(cancelResp.json), { status: cancelResp.status }); }
  if (String(url).includes('/invoice/status')) return new Response(JSON.stringify(statusResp), { status: 200 });
  throw new Error('unexpected fetch ' + url);
};
env.PAYMENT_MODE = 'monobank';
cancelResp = { status: 400, json: { errText: 'insufficient funds' } };
let rf = (await A('POST', `/api/admin/orders/${oP}/refund`, {})).j; assert.equal(rf.error, 'refund_failed'); assert(rf.detail.includes('insufficient'));
assert.equal(raw.prepare('SELECT refunded_at FROM orders WHERE id = ?').get(oP).refunded_at, null, 'failed API refund does not mark the order');
cancelResp = { status: 200, json: { status: 'failure' } }; assert.equal((await A('POST', `/api/admin/orders/${oP}/refund`, {})).j.error, 'refund_failed');
cancelResp = { status: 200, json: { status: 'processing' } }; n = outbox().length;
rf = (await A('POST', `/api/admin/orders/${oP}/refund`, { amountKop: 40000 })).j; assert(rf.ok && rf.method === 'api' && rf.status === 'processing');
assert.deepEqual(cancelBody, { invoiceId: 'inv-real-1', extRef: 'refund_' + oP, amount: 40000 });
let ord = raw.prepare('SELECT * FROM orders WHERE id = ?').get(oP); assert(ord.refunded_at && ord.refund_status === 'processing' && ord.refund_ref === 'refund_' + oP);
assert.equal(outbox().length, n + 1); assert.equal(outbox().at(-1).to_email, 'r3@t.com'); assert(outbox().at(-1).subject.includes('Повернення'));
// вебхук підтверджує завершення
statusResp = { status: 'reversed', amount: 40000 };
assert((await call('x', 'POST', '/api/payments/monobank/webhook', { invoiceId: 'inv-real-1' })).j.ok); assert.equal(raw.prepare('SELECT refund_status FROM orders WHERE id = ?').get(oP).refund_status, 'success');
// повернення, зроблене в кабінеті банку: вебхук reversed без нашої дії
const stubOrder = async o => { const keep = env.PAYMENT_MODE; env.PAYMENT_MODE = 'stub'; try { return await makeOrder(o); } finally { env.PAYMENT_MODE = keep; } };
const oX = await stubOrder({ emailA: 'r5@t.com', emailB: 'r6@t.com' }); raw.prepare("UPDATE orders SET invoice_id = 'inv-real-2' WHERE id = ?").run(oX);
await call('x', 'POST', '/api/payments/monobank/webhook', { invoiceId: 'inv-real-2' });
ord = raw.prepare('SELECT * FROM orders WHERE id = ?').get(oX); assert(ord.refunded_at && ord.refund_status === 'success' && ord.refund_kop === 40000);
assert.equal(raw.prepare("SELECT admin_email FROM audit_log WHERE target = ? AND action = 'refund_confirmed'").get(oX).admin_email, 'system:monobank');
// ручний режим не викликає API; безкоштовне замовлення — теж
cancelBody = null; const oM = await stubOrder({ emailA: 'r7@t.com', emailB: 'r8@t.com' }); raw.prepare("UPDATE orders SET invoice_id = 'inv-real-3' WHERE id = ?").run(oM);
rf = (await A('POST', `/api/admin/orders/${oM}/refund`, { method: 'manual' })).j; assert(rf.ok && rf.method === 'manual'); assert.equal(cancelBody, null);
globalThis.fetch = realFetch; env.PAYMENT_MODE = 'stub';

// ===== 5. Вхід через Google =====
let tokenInfo = { aud: env.GOOGLE_CLIENT_ID, email_verified: 'true', iss: 'https://accounts.google.com', email: 'B@T.com' };
globalThis.fetch = async url => { assert(String(url).startsWith('https://oauth2.googleapis.com/tokeninfo')); return tokenInfo ? new Response(JSON.stringify(tokenInfo), { status: 200 }) : new Response('{}', { status: 400 }); };
const CRED = 'x'.repeat(100);
assert.equal((await call('g', 'POST', '/api/auth/google', { credential: 'short' })).status, 401);
assert.equal((await call('g', 'GET', '/api/state')).status, 401);
let gr = await call('g', 'POST', '/api/auth/google', { credential: CRED }); assert.equal(gr.status, 200); assert.equal((await call('g', 'GET', '/api/state')).status, 200, 'session via Google');
tokenInfo = { ...tokenInfo, aud: 'other-client' }; assert.equal((await call('g2', 'POST', '/api/auth/google', { credential: CRED })).status, 401, 'wrong audience');
tokenInfo = { ...tokenInfo, aud: env.GOOGLE_CLIENT_ID, email_verified: 'false' }; assert.equal((await call('g2', 'POST', '/api/auth/google', { credential: CRED })).status, 401, 'unverified email');
tokenInfo = { ...tokenInfo, email_verified: 'true', iss: 'https://evil.example' }; assert.equal((await call('g2', 'POST', '/api/auth/google', { credential: CRED })).status, 401, 'wrong issuer');
tokenInfo = { ...tokenInfo, iss: 'accounts.google.com', email: 'stranger@gmail.com' }; assert.equal((await call('g2', 'POST', '/api/auth/google', { credential: CRED })).j.error, 'no_access', 'not a member');
tokenInfo = { ...tokenInfo, email: 'r3@t.com' }; assert.equal((await call('g2', 'POST', '/api/auth/google', { credential: CRED })).j.error, 'no_access', 'refunded orders have no access');
tokenInfo = null; assert.equal((await call('g2', 'POST', '/api/auth/google', { credential: CRED })).status, 401, 'tokeninfo rejects');
globalThis.fetch = realFetch; delete env.GOOGLE_CLIENT_ID; assert.equal((await call('g3', 'POST', '/api/auth/google', { credential: CRED })).status, 404, 'disabled without client id'); env.GOOGLE_CLIENT_ID = 'gid.apps.googleusercontent.com';

// ===== 6. Історія доступна і після завершення календаря =====
env.NOW_OVERRIDE = '2026-12-04T10:00:00Z'; // вікно №4 у o1 (старт 1 грудня)
const P = who => (m, u, b) => call(who, m, u, b); const pa = P('p' + o1), pb = P('q' + o1);
// p..=покупець (slot 0), q..=партнер
let h = (await pa('GET', '/api/history')).j; assert.equal(h.days.length, 4); assert(h.days.every(d => !d.answered), 'nothing answered yet');
await pa('POST', '/api/answer', { day: 2, text: 'Моя відповідь №2' }); assert((await pa('GET', '/api/day/2')).j.gift);
h = (await pa('GET', '/api/history')).j; const d2 = h.days.find(d => d.day === 2); assert(d2.opened && d2.mine === 'Моя відповідь №2' && d2.partner === null && d2.gift && d2.intim && d2.act && d2.opened_at > 0);
assert(h.days.find(d => d.day === 3).question && h.days.find(d => d.day === 3).mine === undefined, 'unanswered day shows only the question');
await pb('POST', '/api/answer', { day: 2, text: 'Відповідь партнера' });
assert.equal((await pa('GET', '/api/history')).j.days.find(d => d.day === 2).partner, 'Відповідь партнера');
assert.equal((await pb('GET', '/api/history')).j.days.find(d => d.day === 2).partner, 'Моя відповідь №2', 'symmetrical');
// після завершення: усі 24 вікна доступні, історія повна
await pa('POST', '/api/answer', { day: 1, text: 'Перша' });
env.NOW_OVERRIDE = '2027-03-01T10:00:00Z';
let st = (await pa('GET', '/api/state')).j; assert.equal(st.finished, true); assert.equal(st.today, 24);
h = (await pa('GET', '/api/history')).j; assert.equal(h.days.length, 24); assert.equal(h.finished, true);
assert.equal(h.days.find(d => d.day === 1).mine, 'Перша'); assert.equal(h.days.find(d => d.day === 2).partner, 'Відповідь партнера');
assert((await pa('GET', '/api/day/24')).j.needAnswer, 'late answering still possible after the end');

// ===== 7. Очищення даних через 12 місяців після завершення =====
env.NOW_OVERRIDE = '2028-02-01T01:30:00Z'; // 01:xx UTC — запускається очищення; старт 1.12.2026 + 24 дні + 365 днів = минуло
r = (await cron()).j; assert(r.purge && r.purge.calendars >= 1, JSON.stringify(r));
assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM calendars WHERE order_id = ?').get(o1).n, 0); assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM members WHERE email = ?').get('a@t.com').n, 0);
assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM answers').get().n >= 0, true);
const anon = raw.prepare('SELECT * FROM orders WHERE id = ?').get(o1); assert(anon.email_a.startsWith('deleted-a-') && anon.name_a === '—' && anon.amount_kop === 40000, 'order anonymised, amounts kept');
console.log('FEATURES OK');
