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

// ===== 6b. Вхід за кодом із листа + вихід на всіх пристроях =====
env.NOW_OVERRIDE = '2026-12-04T10:00:00Z';
raw.prepare('DELETE FROM login_tokens').run(); raw.prepare('DELETE FROM rate_limits').run(); // скидаємо ліміти попередніх секцій
const cm = members(o1)[0]; n = outbox().length;
await call('c', 'POST', '/api/auth/request', { email: 'a@t.com' }); const lm = outbox().at(-1); assert.equal(lm.to_email, 'a@t.com');
const code = lm.body.match(/(\d{6})/)?.[1]; assert(code, 'login email contains a 6-digit code'); assert(lm.body.includes('/app/#login='), 'and still contains the link');
assert.equal((await call('c', 'POST', '/api/auth/code', { email: 'a@t.com', code: code === '000000' ? '111111' : '000000' })).j.error, 'bad_code');
assert.equal((await call('c', 'POST', '/api/auth/code', { email: 'nobody@t.com', code })).j.error, 'bad_code', 'same answer for unknown email');
assert.equal((await call('c', 'POST', '/api/auth/code', { email: 'b@t.com', code })).j.error, 'bad_code', 'code of another member does not work');
assert.equal((await call('c', 'GET', '/api/state')).status, 401);
assert.equal((await call('c', 'POST', '/api/auth/code', { email: 'A@T.com', code: code.slice(0, 3) + ' ' + code.slice(3) })).status, 200, 'spaces and case are tolerated');
assert.equal((await call('c', 'GET', '/api/state')).status, 200); assert.equal((await call('c2', 'POST', '/api/auth/code', { email: 'a@t.com', code })).j.error, 'bad_code', 'code is single-use');
// 5 хибних спроб блокують код
await call('c', 'POST', '/api/auth/request', { email: 'a@t.com' }); const code2 = outbox().at(-1).body.match(/(\d{6})/)[1];
for (let i = 0; i < 5; i++) await call('c3', 'POST', '/api/auth/code', { email: 'a@t.com', code: code2 === '123456' ? '654321' : '123456' });
assert.equal((await call('c3', 'POST', '/api/auth/code', { email: 'a@t.com', code: code2 })).j.error, 'bad_code', 'locked after 5 failures');
// код у листах після оплати (покупцю й партнеру)
assert(outbox().find(x => x.to_email === 'a@t.com' && x.subject.includes('готовий')).body.match(/\d{6}/), 'welcome mail has a code'); assert(outbox().find(x => x.to_email === 'b@t.com' && x.subject.includes('створює')).body.match(/\d{6}/));
// вийти на всіх пристроях
await call('d', 'POST', '/api/auth/request', { email: 'a@t.com' }); await call('d', 'POST', '/api/auth/code', { email: 'a@t.com', code: outbox().at(-1).body.match(/(\d{6})/)[1] });
assert.equal((await call('d', 'GET', '/api/state')).status, 200); assert.equal((await call('d', 'POST', '/api/auth/logout-all', {})).status, 200);
assert.equal((await call('d', 'GET', '/api/state')).status, 401); assert.equal((await call('c', 'GET', '/api/state')).status, 401, 'other devices are signed out too');

// ===== 7. Очищення даних через 12 місяців після завершення =====
env.NOW_OVERRIDE = '2028-02-01T01:30:00Z'; // 01:xx UTC — запускається очищення; старт 1.12.2026 + 24 дні + 365 днів = минуло
r = (await cron()).j; assert(r.purge && r.purge.calendars >= 1, JSON.stringify(r));
assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM calendars WHERE order_id = ?').get(o1).n, 0); assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM members WHERE email = ?').get('a@t.com').n, 0);
assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM answers').get().n >= 0, true);
const anon = raw.prepare('SELECT * FROM orders WHERE id = ?').get(o1); assert(anon.email_a.startsWith('deleted-a-') && anon.name_a === '—' && anon.amount_kop === 40000, 'order anonymised, amounts kept');

// ===== 8. Міжнародна версія: переклади, країни, часові пояси =====
{
  const { GIFTS_EN, INTIMATE_EN, ACTIVITIES_EN, QUESTIONS_EN } = await import('../src/content_en.js');
  const { GIFTS_RAW, INTIMATE_RAW, ACTIVITIES_RAW, QUESTIONS_RAW } = await import('../src/content.js');
  assert.equal(GIFTS_EN.length, GIFTS_RAW.length); assert.equal(INTIMATE_EN.length, INTIMATE_RAW.length); assert.equal(ACTIVITIES_EN.length, ACTIVITIES_RAW.length); assert.equal(QUESTIONS_EN.length, QUESTIONS_RAW.length);
  const cyr = /[А-Яа-яІіЇїЄєҐґ]/;
  for (const [name, arr] of [['gifts', GIFTS_EN], ['intimate', INTIMATE_EN], ['activities', ACTIVITIES_EN]]) arr.forEach((r, i) => { assert(r[0] && r[1], `${name}[${i}] has title and text`); assert(!cyr.test(r[0] + r[1]), `${name}[${i}] has Cyrillic: ${r[0]}`); if (r[2]) assert(!cyr.test(r[2]) || /Uzhhorod|Mukachevo/.test(r[2]) === false, `${name}[${i}] query in English`); });
  QUESTIONS_EN.forEach((q, i) => assert(q && !cyr.test(q), `question ${i} translated`));
  const { generateSchedule, ACTIVITIES, GIFTS, giftView, actView, questionText, QUESTIONS } = await import('../src/logic.js'); const { windowDates, unlockTimes, zonedToUtc } = await import('../src/util.js');
  // міжнародний календар: без українських і закарпатських активностей
  const S = () => JSON.parse(SUR('x')), dates = windowDates('2026-12-01');
  for (let seed = 1; seed <= 60; seed++) { const sc = generateSchedule([S(), S()], seed, dates, 'Bavaria', 'DE'); for (let d = 1; d <= 24; d++) { const a = ACTIVITIES[sc.days[d].act]; assert(!a.tags.includes('zk') && !a.tags.includes('ua'), 'intl: ' + a.title); } }
  const sawUa = new Set(); for (let seed = 1; seed <= 60; seed++) { const sc = generateSchedule([S(), S()], seed, dates, 'Львівська', 'UA'); for (let d = 1; d <= 24; d++) if (ACTIVITIES[sc.days[d].act].tags.includes('ua')) sawUa.add(seed); } assert(sawUa.size > 0, 'UA calendars may include Ukraine-specific ideas');
  // англійські вигляди, посилання для інших країн
  const g = GIFTS.find(x => x.store === 'r'), ge = giftView(g, 'Paris', 'en', 'FR'); assert(!cyr.test(ge.title + ge.desc) && ge.link.url.startsWith('https://www.google.com/search?tbm=shop') && ge.link.label === 'Search online');
  assert(giftView(g, 'Київ', 'uk', 'UA').link.url.includes('rozetka.com.ua'), 'Ukrainian shops remain for Ukraine');
  const a = ACTIVITIES.find(x => x.q === 'кав’ярня {city}'), ae = actView(a, 'Lyon', 'en'); assert(!cyr.test(ae.title) && decodeURIComponent(ae.link.url).includes('cafe Lyon') && ae.link.label === 'On the map');
  assert.equal(questionText(QUESTIONS[0], 'en'), 'Why do you love me?');
  // точні моменти відкриття за поясом календаря
  const ny = unlockTimes('2026-12-10', 'America/New_York'), kyiv = unlockTimes('2026-12-10', 'Europe/Kyiv');
  assert.equal(new Date(ny[0]).toISOString(), '2026-12-10T12:00:00.000Z', '07:00 in New York in winter = 12:00Z'); assert.equal(new Date(kyiv[0]).toISOString(), '2026-12-10T05:00:00.000Z');
  assert.equal(ny.length, 24); assert.equal(new Date(unlockTimes('2026-03-28', 'Europe/Kyiv')[3]).toISOString(), '2026-03-31T04:00:00.000Z', 'DST switch handled (UTC+3 after 29 March)');
  // англомовний календар у Німеччині: усе англійською, усе працює
  env.NOW_OVERRIDE = '2026-11-20T10:00:00Z';
  const oDe = await makeOrder({ emailA: 'de1@t.com', emailB: 'de2@t.com', lang: 'en', country: 'DE', region: 'Bavaria', city: 'Munich', tz: 'Europe/Berlin', startDate: '2026-12-05' });
  const mde = members(oDe); for (const [i, who] of ['de1', 'de2'].entries()) { await call(who, 'POST', '/api/auth/request', { email: mde[i].email }); await call(who, 'POST', '/api/auth/verify', { token: tok(outbox().filter(x => x.to_email === mde[i].email).at(-1).body) }); await call(who, 'POST', '/api/survey', { answers: JSON.parse(SUR('N' + i)) }); }
  env.NOW_OVERRIDE = '2026-12-05T06:30:00Z'; // 07:30 в Берліні, вікно №1
  let st2 = (await call('de1', 'GET', '/api/state')).j; assert.equal(st2.lang, 'en'); assert.equal(st2.today, 1); assert.equal(st2.unlockTimes.length, 24); assert.equal(new Date(st2.unlockTimes[0]).toISOString(), '2026-12-05T06:00:00.000Z');
  const pre2 = (await call('de1', 'GET', '/api/day/1')).j; assert(!cyr.test(pre2.question.text), 'question in English');
  await call('de1', 'POST', '/api/answer', { day: 1, text: 'Because you laugh at my jokes' }); const day1 = (await call('de1', 'GET', '/api/day/1')).j;
  assert(!cyr.test(day1.gift.title + day1.gift.desc + day1.intim.title + day1.act.title + day1.act.desc), 'whole day in English'); assert(day1.gift.link === null || day1.gift.link.url.includes('google.com'), 'no Ukrainian shops abroad');
  assert((await call('de1', 'GET', '/api/history')).j.days[0].question.length > 0);
  // визначення країни
  const { detectLocale } = await import('../src/api.js'); const rq = h => new Request('http://x/', { headers: h });
  assert.deepEqual(detectLocale(rq({ 'CF-IPCountry': 'UA' })), { country: 'UA', lang: 'uk' }); assert.deepEqual(detectLocale(rq({ 'CF-IPCountry': 'PL', 'Accept-Language': 'uk-UA' })), { country: 'PL', lang: 'en' });
  assert.deepEqual(detectLocale(rq({})), { country: null, lang: 'en' }); assert.deepEqual(detectLocale(rq({ 'Accept-Language': 'uk-UA,uk;q=0.9' })), { country: null, lang: 'uk' }); assert.equal(detectLocale(rq({ 'CF-IPCountry': 'XX' })).country, null);
  const cfg = (await handle(new Request('http://x/api/config', { headers: { 'CF-IPCountry': 'DE' } }), env)).json(); assert.equal((await cfg).detected.lang, 'en');
  env.NOW_OVERRIDE = '2026-11-20T10:00:00Z';
  // країна не-UA: область довільна; UA: область з переліку
  assert.equal((await call('x', 'POST', '/api/orders', { ...good, emailA: 'v1@t.com', emailB: 'v2@t.com', country: 'DE', region: 'Whatever' })).j.ok, true);
  assert.equal((await call('x', 'POST', '/api/orders', { ...good, emailA: 'v3@t.com', emailB: 'v4@t.com', country: 'UA', region: 'Whatever' })).j.error, 'bad_region');
  assert.equal((await call('x', 'POST', '/api/orders', { ...good, emailA: 'v5@t.com', emailB: 'v6@t.com', tz: 'Mars/Phobos', startDate: '2026-12-05' })).j.ok, true, 'invalid tz falls back to Kyiv');
}

// ===== 9. Валюти та курси =====
{
  const { currencyOf, priceCurrency, refreshFx, getFx } = await import('../src/currency.js');
  assert.equal(currencyOf('DE'), 'EUR'); assert.equal(currencyOf('UA'), 'UAH'); assert.equal(currencyOf('US'), 'USD'); assert.equal(currencyOf('PL'), 'PLN'); assert.equal(currencyOf('JP'), 'JPY'); assert.equal(currencyOf('zz'), 'USD'); assert.equal(currencyOf(null), 'USD');
  assert.deepEqual(priceCurrency(null, 'UA', 41), { code: 'UAH', rate: 1 }, 'Ukraine: hryvnia');
  assert.deepEqual(priceCurrency(null, 'DE', 40), { code: 'USD', rate: 1 / 40 }, 'no rates yet: fall back to USD by manual rate');
  const fx = { updated: 1, rates: { USD: 0.025, EUR: 0.023, PLN: 0.1 } };
  assert.deepEqual(priceCurrency(fx, 'DE', 41), { code: 'EUR', rate: 0.023 }); assert.deepEqual(priceCurrency(fx, 'PL', 41), { code: 'PLN', rate: 0.1 });
  assert.deepEqual(priceCurrency(fx, 'JP', 41), { code: 'USD', rate: 0.025 }, 'currency without a rate: USD');
  // оновлення курсів: лише валідна відповідь; кеш на 20 годин
  let calls = 0; const ok = async () => { calls++; return new Response(JSON.stringify({ result: 'success', rates: { USD: 0.0245, EUR: 0.0226, JPY: 3.7, XXX: 5, UAH: 1 } }), { status: 200 }); };
  let r = await refreshFx(env, { fetchImpl: ok }); assert(r.ok && r.count === 4, JSON.stringify(r)); // USD, EUR, JPY, UAH (невідому XXX відкинуто)
  assert.equal((await getFx(env)).rates.JPY, 3.7); assert.equal((await getFx(env)).rates.XXX, undefined);
  r = await refreshFx(env, { fetchImpl: ok }); assert(r.skipped && calls === 2, 'fresh rates are not re-fetched (one refresh = Monobank + fallback source)');
  r = await refreshFx(env, { force: true, fetchImpl: async () => new Response('oops', { status: 500 }) }); assert(!r.ok); assert.equal((await getFx(env)).rates.USD, 0.0245, 'failed refresh keeps old rates');
  r = await refreshFx(env, { force: true, fetchImpl: async () => new Response(JSON.stringify({ result: 'error' }), { status: 200 }) }); assert(!r.ok && r.error === 'bad_payload');
  // Monobank має пріоритет; інше джерело доповнює; працює і з одним джерелом
  const mono = [{ currencyCodeA: 840, currencyCodeB: 980, rateBuy: 41, rateSell: 42 }, { currencyCodeA: 978, currencyCodeB: 980, rateCross: 48 }, { currencyCodeA: 840, currencyCodeB: 978, rateCross: 1.1 }, { currencyCodeA: 999, currencyCodeB: 980, rateCross: 5 }];
  const both = async url => String(url).includes('monobank') ? new Response(JSON.stringify(mono), { status: 200 }) : new Response(JSON.stringify({ result: 'success', rates: { USD: 0.025, EUR: 0.023, JPY: 3.7 } }), { status: 200 });
  r = await refreshFx(env, { force: true, fetchImpl: both }); assert(r.ok && r.mono === 2 && r.other >= 1, JSON.stringify(r));
  let fxs = await getFx(env); assert(Math.abs(fxs.rates.USD - 1 / 41.5) < 1e-9, 'USD from Monobank (average of buy/sell)'); assert(Math.abs(fxs.rates.EUR - 1 / 48) < 1e-9, 'EUR from Monobank (rateCross)'); assert.equal(fxs.rates.JPY, 3.7, 'JPY from the second source'); assert.equal(fxs.sources.mono, 2);
  r = await refreshFx(env, { force: true, fetchImpl: async url => String(url).includes('monobank') ? new Response(JSON.stringify(mono), { status: 200 }) : new Response('x', { status: 503 }) }); assert(r.ok && r.mono === 2, 'works with Monobank only');
  r = await refreshFx(env, { force: true, fetchImpl: async url => String(url).includes('monobank') ? new Response('down', { status: 500 }) : new Response(JSON.stringify({ result: 'success', rates: { USD: 0.026 } }), { status: 200 }) }); assert(r.ok && r.mono === 0, 'works without Monobank'); assert.equal((await getFx(env)).rates.USD, 0.026);
  await refreshFx(env, { force: true, fetchImpl: ok }); // повертаємо базові значення для наступних перевірок
  // конфіг: країна → валюта (?country=) і визначена за IP
  let cfg = (await call('x', 'GET', '/api/config?country=DE')).j; assert.equal(cfg.currency.code, 'EUR'); assert.equal(cfg.country, 'DE'); assert.equal(cfg.uahPerEur, Math.round(1 / 0.0226 * 10000) / 10000);
  assert.equal(cfg.price, Math.ceil(cfg.prices.uah / cfg.uahPerEur), 'ціну в євро ще не задано: рахується з гривневої й округлюється вгору'); assert.equal(cfg.prices.eur, cfg.price);
  cfg = (await call('x', 'GET', '/api/config?country=UA')).j; assert.deepEqual(cfg.currency, { code: 'UAH', rate: 1 }); assert.equal(cfg.price, cfg.prices.uah);
  cfg = (await call('x', 'GET', '/api/config?country=zz!')).j; assert.equal(cfg.country, 'UA', 'invalid country ignored');
  cfg = await (await handle(new Request('http://x/api/config', { headers: { 'CF-IPCountry': 'JP' } }), env)).json(); assert.equal(cfg.currency.code, 'EUR', 'для всіх країн, крім України, єдина ціна в євро'); assert.equal(cfg.country, 'JP');
  // стан календаря: валюта країни календаря
  const stDeR = await call('de1', 'GET', '/api/state'); assert.equal(stDeR.status, 200, JSON.stringify(stDeR.j)); assert.equal(stDeR.j.currency.code, 'EUR');
  assert.equal((await call('x', 'POST', '/api/orders', { ...good, emailA: 'ru1@t.com', emailB: 'ru2@t.com', country: 'RU', region: 'x' })).j.error, 'country_blocked');
  assert.equal((await call('x', 'POST', '/api/orders', { ...good, emailA: 'oc1@t.com', emailB: 'oc2@t.com', city: 'Донецьк', region: 'Донецька' })).j.error, 'region_occupied');
  assert.equal((await call('x', 'POST', '/api/orders', { ...good, emailA: 'oc3@t.com', emailB: 'oc4@t.com', city: 'Мелітополь', region: 'Запорізька' })).j.error, 'region_occupied');
  assert.equal((await call('x', 'POST', '/api/orders', { ...good, emailA: 'by1@t.com', emailB: 'by2@t.com', country: 'by', region: 'x' })).j.error, 'country_blocked');
  // cron оновлює курси
  const c1 = (await cron()).j; assert(c1.fx && (c1.fx.ok || c1.fx.error), 'cron reports fx result');
}

// ===== 10. Рекомендації закладів (Google Places) =====
{
  const { pickTop, recommend, placesUsage } = await import('../src/places.js'); const { placesQuery, ACTIVITIES } = await import('../src/logic.js');
  const gm = 'https://maps.google.com/?cid=';
  const sample = [
    { displayName: { text: 'Café Lumière' }, rating: 4.7, userRatingCount: 1200, googleMapsUri: gm + '1', shortFormattedAddress: '5 Rue A', businessStatus: 'OPERATIONAL' },
    { displayName: { text: 'Few Reviews' }, rating: 5, userRatingCount: 3, googleMapsUri: gm + '2' },
    { displayName: { text: 'Closed Place' }, rating: 4.9, userRatingCount: 900, googleMapsUri: gm + '3', businessStatus: 'CLOSED_PERMANENTLY' },
    { displayName: { text: 'Low Rating' }, rating: 3.9, userRatingCount: 5000, googleMapsUri: gm + '4' },
    { displayName: { text: 'Evil Link' }, rating: 4.8, userRatingCount: 800, googleMapsUri: 'https://evil.example/x' },
    { displayName: { text: 'Popular Good' }, rating: 4.5, userRatingCount: 9000, googleMapsUri: gm + '5' },
    { displayName: { text: 'Small Gem' }, rating: 4.8, userRatingCount: 60, googleMapsUri: gm + '6' }, { displayName: { text: 'Third' }, rating: 4.4, userRatingCount: 300, googleMapsUri: gm + '7' }, { displayName: { text: 'Fourth' }, rating: 4.3, userRatingCount: 200, googleMapsUri: gm + '8' }];
  const top = pickTop(sample); assert.deepEqual(top.map(x => x.name), ['Popular Good', 'Café Lumière', 'Third'], 'ranked by rating x log(reviews)'); assert.equal(top[0].rating, 4.5); assert.equal(top[1].address, '5 Rue A');
  assert(!top.some(x => ['Few Reviews', 'Closed Place', 'Low Rating', 'Evil Link'].includes(x.name)), 'filters out few reviews, closed, low rating, foreign links'); assert(top.every(x => x.url.startsWith('https://maps.google.com/')));
  // запит із містом лише для шаблонних; конкретні пам'ятки пропускаємо
  const cafe = ACTIVITIES.find(x => x.q === 'кав’ярня {city}'), castle = ACTIVITIES.find(x => x.q === 'Ужгородський замок');
  assert.equal(placesQuery(cafe, 'Lyon', 'en'), 'cafe Lyon'); assert.equal(placesQuery(cafe, 'Львів', 'uk'), 'кав’ярня Львів'); assert.equal(placesQuery(castle, 'Ужгород', 'uk'), null);
  // без ключа: порожньо, жодних запитів
  let calls = 0, body = null, hdr = null; const fake = async (url, init) => { calls++; body = JSON.parse(init.body); hdr = init.headers; assert(String(url).startsWith('https://places.googleapis.com/v1/places:searchText')); return new Response(JSON.stringify({ places: sample }), { status: 200 }); };
  assert.deepEqual(await recommend(env, { query: 'cafe Lyon', lang: 'en', country: 'FR', memberId: 'm1', day: 1, fetchImpl: fake }), []); assert.equal(calls, 0, 'no key: no request');
  env.GOOGLE_PLACES_KEY = 'KEY123';
  let rec = await recommend(env, { query: 'cafe Lyon', lang: 'en', country: 'FR', memberId: 'm1', day: 1, fetchImpl: fake }); assert.equal(rec.length, 4, '3 за рейтингом + 1 «нещодавно відкрились»'); assert.deepEqual(rec.filter(x => x.fresh).map(x => x.name), ['Small Gem']); assert.equal(calls, 1);
  assert.equal(hdr['X-Goog-Api-Key'], 'KEY123'); assert(hdr['X-Goog-FieldMask'].includes('places.rating')); assert.deepEqual([body.textQuery, body.languageCode, body.regionCode], ['cafe Lyon', 'en', 'FR']);
  assert.equal(await placesUsage(env), 1, 'usage counted');
  // ліміт на учасника: не більше 4 запитів за вікно
  for (let i = 0; i < 3; i++) await recommend(env, { query: 'q', lang: 'uk', memberId: 'm1', day: 1, fetchImpl: fake }); assert.equal(calls, 4);
  assert.deepEqual(await recommend(env, { query: 'q', lang: 'uk', memberId: 'm1', day: 1, fetchImpl: fake }), [], 'per-member limit'); assert.equal(calls, 4);
  // помилки Google не ламають картку
  assert.deepEqual(await recommend(env, { query: 'q', lang: 'uk', memberId: 'm2', day: 1, fetchImpl: async () => new Response('err', { status: 403 }) }), []);
  assert.deepEqual(await recommend(env, { query: 'q', lang: 'uk', memberId: 'm3', day: 1, fetchImpl: async () => { throw new Error('net'); } }), []);
  // місячний ліміт: 0 вимикає; ліміт N зупиняє витрати
  raw.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('places_monthly_cap', '0', 1) ON CONFLICT(key) DO UPDATE SET value = '0'").run();
  calls = 0; assert.deepEqual(await recommend(env, { query: 'q', lang: 'uk', memberId: 'm4', day: 1, fetchImpl: fake }), []); assert.equal(calls, 0, 'cap 0 disables');
  const used = await placesUsage(env); raw.prepare("UPDATE settings SET value = ? WHERE key = 'places_monthly_cap'").run(String(used + 1));
  assert.equal((await recommend(env, { query: 'q', lang: 'uk', memberId: 'm5', day: 1, fetchImpl: fake })).length, 4); assert.deepEqual(await recommend(env, { query: 'q', lang: 'uk', memberId: 'm6', day: 1, fetchImpl: fake }), [], 'monthly cap reached'); assert.equal(calls, 1);
  raw.prepare("DELETE FROM settings WHERE key = 'places_monthly_cap'").run();
  // ендпоінт: лише після відповіді на питання дня
  env.NOW_OVERRIDE = '2026-12-05T06:30:00Z'; const deDay = 1;
  delete env.GOOGLE_PLACES_KEY; let pr = await call('de1', 'GET', '/api/places/' + deDay); assert.equal(pr.status, 200); assert.deepEqual(pr.j.places, [], 'disabled without key');
  pr = await call('de1', 'GET', '/api/places/2'); assert.equal(pr.status, 403, 'future window'); assert.equal((await call('x', 'GET', '/api/places/1')).status, 401);
  const ansRow = raw.prepare("SELECT COUNT(*) AS n FROM answers WHERE member_id = ? AND day = 1").get(raw.prepare("SELECT m.* FROM members m JOIN calendars c ON c.id = m.calendar_id WHERE m.email = 'de2@t.com'").all()[0].id).n; assert.equal(ansRow, 0);
  assert.equal((await call('de2', 'GET', '/api/places/1')).j.error, 'answer_first', 'recommendations only after answering');
}
console.log('FEATURES OK');
