import assert from 'node:assert/strict';
import { makeDb } from './d1.js';
import { handle } from '../src/api.js';
import { GIFTS, INTIMATE, ACTIVITIES, QUESTIONS, sanitizeSurvey, generateSchedule } from '../src/logic.js';
import { windowDates, tomorrowStr } from '../src/util.js';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = makeDb(root);
const env = { DB: db, DEV: '1', PRICE_UAH: '399', BASE_URL: 'http://x', PAYMENT_MODE: 'stub', EMAIL_MODE: 'stub', NOW_OVERRIDE: '2026-12-10T12:00:00Z' };
const jar = {};
async function call(who, method, url, body) {
  const headers = { 'content-type': 'application/json' }; if (jar[who]) headers.cookie = 'rs=' + jar[who];
  const res = await handle(new Request('http://x' + url, { method, headers, body: body ? JSON.stringify(body) : undefined }), env);
  const sc = res.headers.get('set-cookie'); if (sc) jar[who] = decodeURIComponent(sc.match(/rs=([^;]*)/)[1]);
  return { status: res.status, loc: res.headers.get('location'), j: res.status === 302 ? null : await res.json() };
}
async function day(who, d, text) { // відкрити день повністю (відповівши на питання, якщо треба)
  let r = (await call(who, 'GET', '/api/day/' + d)).j;
  if (r.needAnswer) { await call(who, 'POST', '/api/answer', { day: d, text: text || `відповідь ${who}${d}` }); r = (await call(who, 'GET', '/api/day/' + d)).j; }
  return r;
}
const outbox = () => db._raw.prepare('SELECT * FROM outbox ORDER BY id').all();
const linkTok = body => body.match(/#login=([\w-]+)/)[1];

console.log('content', GIFTS.length, INTIMATE.length, ACTIVITIES.length);
// 1. валідація замовлення
const good = { nameA: 'Микола', nameB: 'Рита', emailA: 'A@Test.com', emailB: 'b@test.com', city: 'Львів', region: 'Львівська', startDate: '2026-12-11', age18: true, terms: true };
assert.equal((await call('x', 'POST', '/api/orders', { ...good, emailB: 'a@test.com' })).j.error, 'same_email');
assert.equal((await call('x', 'POST', '/api/orders', { ...good, age18: false })).j.error, 'consent_required');
assert.equal((await call('x', 'POST', '/api/orders', { ...good, region: 'Нарнія' })).j.error, 'bad_region');
assert.equal((await call('x', 'POST', '/api/orders', { ...good, startDate: '2026-12-10' })).j.error, 'bad_date', 'today not allowed');
assert.equal((await call('x', 'POST', '/api/orders', { ...good, startDate: '2027-06-01' })).j.error, 'bad_date', 'too far');
assert.equal((await call('x', 'POST', '/api/orders', { ...good, startDate: '2026-02-30' })).j.error, 'bad_date', 'invalid');
assert.equal((await call('x', 'POST', '/api/orders', { ...good, startDate: undefined })).j.error, 'bad_date', 'missing');
// 2. замовлення -> оплата
const o = (await call('x', 'POST', '/api/orders', good)).j; assert(o.ok && o.payUrl.includes('/api/dev/pay/'));
assert.equal((await call('x', 'GET', `/api/orders/${o.orderId}/status`)).j.status, 'pending');
assert.equal(outbox().length, 0);
const paid = await call('x', 'GET', `/api/dev/pay/${o.orderId}`); assert.equal(paid.status, 302);
await call('x', 'GET', `/api/dev/pay/${o.orderId}`); // повторно — ідемпотентно
assert.equal(outbox().length, 2, 'two welcome emails');
assert.equal((await call('x', 'GET', `/api/orders/${o.orderId}/status`)).j.status, 'paid');
assert.equal(db._raw.prepare('SELECT start_date FROM calendars').get().start_date, '2026-12-11');
// 3. вхід за посиланням (одноразовий)
assert.equal((await call('A', 'GET', '/api/state')).status, 401);
const tA = linkTok(outbox()[0].body), tB = linkTok(outbox()[1].body);
assert.equal((await call('A', 'POST', '/api/auth/verify', { token: tA })).status, 200);
assert.equal((await call('Z', 'POST', '/api/auth/verify', { token: tA })).status, 401, 'one-time');
await call('B', 'POST', '/api/auth/verify', { token: tB });
let s = (await call('A', 'GET', '/api/state')).j;
assert.equal(s.me.suggestedName, 'Микола'); assert.equal(s.today, 0); assert.equal(s.ready, false);
// запит посилання для невідомої пошти не розкриває нічого
const before = outbox().length; assert.equal((await call('Q', 'POST', '/api/auth/request', { email: 'nobody@x.com' })).status, 200); assert.equal(outbox().length, before);
await call('Q', 'POST', '/api/auth/request', { email: 'a@test.com' }); assert.equal(outbox().length, before + 1);
// 4. анкети -> розклад
const surA = { name: 'Микола', budget: 300, giftLikes: ['sweet'], avoid: [], level: 3, intimLikes: ['mas'], actLikes: ['food'], actBudget: 2, car: true };
const surB = { name: 'Рита', budget: 200, giftLikes: ['beauty'], avoid: ['alcohol'], level: 2, intimLikes: [], actLikes: ['home'], actBudget: 1, car: false };
assert.equal((await call('A', 'POST', '/api/survey', { answers: surA })).j.ready, false);
assert.equal((await call('B', 'POST', '/api/survey', { answers: surB })).j.ready, true);
assert.equal((await call('A', 'POST', '/api/survey', { answers: surA })).status, 409);
// 5. вікна: за Києвом 2026-12-10 14:00 — календар ще не почався
assert.equal((await call('A', 'GET', '/api/day/1')).j.error, 'not_yet');
env.NOW_OVERRIDE = '2026-12-11T03:00:00Z'; // 05:00 за Києвом — ще до 07:00
assert.equal((await call('A', 'GET', '/api/day/1')).j.error, 'not_yet');
env.NOW_OVERRIDE = '2026-12-11T05:00:00Z'; // 07:00 за Києвом
// питання дня: спершу відповідь; завдань сервер не віддає
const pre = (await call('A', 'GET', '/api/day/1')).j;
assert(pre.needAnswer && pre.question.text && !pre.gift && !pre.intim && !pre.act, 'tasks hidden before answering');
assert.equal((await call('A', 'POST', '/api/answer', { day: 1, text: 'x' })).j.error, 'answer_short');
assert.equal((await call('A', 'POST', '/api/answer', { day: 2, text: 'вже завтра?' })).j.error, 'bad_day');
assert.equal((await call('A', 'POST', '/api/mark', { day: 1, key: 'gift', done: true })).status, 200); // mark не відкриває контент
await call('A', 'POST', '/api/answer', { day: 1, text: 'За твою усмішку <b>і</b> каву' });
assert.equal((await call('A', 'POST', '/api/answer', { day: 1, text: 'передумав' })).j.error, 'already_answered');
const mid = (await call('A', 'GET', '/api/day/1')).j;
assert(mid.gift && mid.question.mine.includes('усмішку'));
assert(!mid.question.mine.includes('<'), 'html stripped');
assert.equal(mid.question.partner, null, 'partner has not answered yet');
const d1b = await day('B', 1, 'За те, що ти поруч');
assert.equal(d1b.question.partner.includes('усмішку'), true, 'B sees A answer');
const d1a = (await call('A', 'GET', '/api/day/1')).j;
assert.equal(d1a.question.partner, 'За те, що ти поруч', 'A now sees B answer');
assert.equal(d1a.question.text, d1b.question.text, 'same question for both');
assert(QUESTIONS.find(q => q.text === d1a.question.text).level <= 2, 'question level <= min level');
assert(d1a.ok); assert.equal(d1a.intim.title, d1b.intim.title); assert.equal(d1a.act.title, d1b.act.title);
assert.equal(d1a.forName, 'Рита'); assert(d1a.gift.price <= 300 && d1b.gift.price <= 200);
assert.equal((await call('A', 'GET', '/api/day/2')).j.error, 'not_yet');
assert.equal((await call('A', 'POST', '/api/mark', { day: 1, key: 'gift', done: true })).j.ok, true);
assert.equal((await call('A', 'GET', '/api/day/1')).j.done.gift, true);
assert.equal((await call('B', 'GET', '/api/day/1')).j.done.gift, false);
// Львів: жодних zk-активностей, у запитах підставлено місто
env.NOW_OVERRIDE = '2027-01-30T10:00:00Z';
const cal = JSON.parse(db._raw.prepare('SELECT schedule_json FROM calendars').get().schedule_json);
for (let d = 1; d <= 24; d++) { const a = ACTIVITIES[cal.days[d].act]; assert(!a.tags.includes('zk'), a.title); const v = await day('A', d); assert(v.ok && v.gift, d); if (v.act.link) assert(decodeURIComponent(v.act.link.url).includes('Львів') && !v.act.link.url.includes('%7Bcity%7D')); }
// спеціальні дати: старт 11.12 => вікно 14 = 24.12, 6.12 не потрапляє
assert.equal(QUESTIONS[cal.days[14].q].day, 24); assert.equal(INTIMATE[cal.days[14].intim].day, 24); assert.equal(ACTIVITIES[cal.days[14].act].day, 24); assert.equal(GIFTS[cal.days[14].gift[0]].day, 24);
assert(!Object.values(cal.days).some(x => GIFTS[x.gift[0]].day === 6));
// 6. стрес
const dates = windowDates('2026-12-01');
for (let i = 0; i < 300; i++) {
  const mk = () => sanitizeSurvey({ name: 'n', budget: 100 + Math.floor(Math.random() * 9) * 50, giftLikes: ['sweet', 'tech'].filter(() => Math.random() < .5), avoid: ['alcohol', 'sweet', 'scent'].filter(() => Math.random() < .5), level: 1 + Math.floor(Math.random() * 3), intimLikes: ['mas'].filter(() => Math.random() < .5), actLikes: ['home', 'trip'].filter(() => Math.random() < .5), actBudget: Math.floor(Math.random() * 4), car: Math.random() < .5 });
  for (const region of ['Закарпатська', 'Львівська', 'Київська']) assert.equal(Object.keys(generateSchedule([mk(), mk()], i + 1, dates, region).days).length, 24);
}
// 6b. обрана дата старту поважається; прострочена — зсувається на завтра
{
  const saved = env.NOW_OVERRIDE; env.NOW_OVERRIDE = '2026-11-20T10:00:00Z';
  const o2 = (await call('x', 'POST', '/api/orders', { ...good, emailA: 'c@test.com', emailB: 'd@test.com', startDate: '2026-12-01' })).j; assert(o2.ok);
  await call('x', 'GET', `/api/dev/pay/${o2.orderId}`);
  assert.equal(db._raw.prepare("SELECT start_date FROM calendars WHERE order_id = ?").get(o2.orderId).start_date, '2026-12-01');
  const o3 = (await call('x', 'POST', '/api/orders', { ...good, emailA: 'e@test.com', emailB: 'f@test.com', startDate: '2026-11-25' })).j; assert(o3.ok);
  env.NOW_OVERRIDE = '2026-12-05T10:00:00Z'; // оплатили, коли 25.11 вже минуло
  await call('x', 'GET', `/api/dev/pay/${o3.orderId}`);
  assert.equal(db._raw.prepare("SELECT start_date FROM calendars WHERE order_id = ?").get(o3.orderId).start_date, '2026-12-06');
  env.NOW_OVERRIDE = saved;
}
// 7. вихід
await call('A', 'POST', '/api/auth/logout'); assert.equal((await call('A', 'GET', '/api/state')).status, 401);
console.log('ALL OK');
