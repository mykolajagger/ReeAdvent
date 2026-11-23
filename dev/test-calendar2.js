// Темп календаря (кількість подарунків, дні поза домом), фото й відео у відповідях, оцінки пунктів і рейтинг, база по 300.
import assert from 'node:assert/strict';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { makeDb } from './d1.js';
import { handle } from '../src/api.js';
import { GIFTS, INTIMATE, ACTIVITIES, QUESTIONS, GIFTS_EN, INTIMATE_EN, ACTIVITIES_EN, QUESTIONS_EN, sanitizeSurvey, generateSchedule, giftDaysFor, outDaysFor, ratingMult, GIFT_TAGS, INTIM_TAGS, ACT_TAGS } from '../src/logic.js';
import { GIFTS_RAW as G0, ACTIVITIES_RAW as A0, QUESTIONS_RAW as Q0, INTIMATE_RAW as I0 } from '../src/content.js';
import { windowDates } from '../src/util.js';
import { purgeOld } from '../src/reminders.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---- база: по 300 у кожній категорії, старі номери на місці, переклади ----
assert(GIFTS.length >= 300 && INTIMATE.length >= 300 && ACTIVITIES.length >= 300 && QUESTIONS.length >= 300, [GIFTS.length, INTIMATE.length, ACTIVITIES.length, QUESTIONS.length].join());
assert.equal(GIFTS_EN.length, GIFTS.length); assert.equal(INTIMATE_EN.length, INTIMATE.length); assert.equal(ACTIVITIES_EN.length, ACTIVITIES.length); assert.equal(QUESTIONS_EN.length, QUESTIONS.length);
G0.forEach((r, i) => assert.equal(GIFTS[i].title, r[0], 'номери старих подарунків не змінились')); A0.forEach((r, i) => assert.equal(ACTIVITIES[i].title, r[0])); Q0.forEach((r, i) => assert.equal(QUESTIONS[i].text, r[0])); I0.forEach((r, i) => assert.equal(INTIMATE[i].title, r[0]));
const cyr = /[а-яіїєґ]/i;
GIFTS_EN.forEach((r, i) => assert(r[0] && r[1] && !cyr.test(r[0] + r[1] + (r[2] || '')), 'gift EN ' + i)); INTIMATE_EN.forEach((r, i) => assert(r[0] && r[1] && !cyr.test(r[0] + r[1]), 'intim EN ' + i));
ACTIVITIES_EN.forEach((r, i) => assert(r[0] && r[1] && !cyr.test(r[0] + r[1] + (r[2] || '')), 'act EN ' + i)); QUESTIONS_EN.forEach((q, i) => assert(q && !cyr.test(q), 'q EN ' + i));
const titles = arr => { const s = new Set(); return arr.filter(x => { const k = (x.title || x.text).toLowerCase(); if (s.has(k)) return true; s.add(k); return false; }); };
assert.deepEqual(titles(GIFTS).map(x => x.title), [], 'без дублів'); assert.deepEqual(titles(INTIMATE).map(x => x.title), []); assert.deepEqual(titles(QUESTIONS).map(x => x.text), []);
GIFTS.forEach(g => g.tags.forEach(t => assert(GIFT_TAGS.includes(t), g.title + ' ' + t))); INTIMATE.forEach(x => { assert([1, 2, 3].includes(x.level)); x.tags.forEach(t => assert(INTIM_TAGS.includes(t), x.title + ' ' + t)); });
ACTIVITIES.forEach(x => assert([0, 1, 2, 3].includes(x.cost), x.title));
assert(ACTIVITIES.filter(x => x.tags.includes('home')).length >= 150, 'вистачає домашніх активностей'); assert(QUESTIONS.filter(q => q.media).length >= 45, 'питання з фото й відео');
assert(ACTIVITIES.filter(x => !x.tags.includes('home') && x.q && !x.q.includes('{city}') && !x.tags.includes('zk')).length < 30, 'нові виходи шукаються в місті клієнта');

// ---- анкета й розклад ----
const s = sanitizeSurvey({ name: 'А', gifts: 30, outDays: -1 }); assert.equal(s.gifts, 24); assert.equal(s.outDays, 0);
assert.equal(sanitizeSurvey({ name: 'А', gifts: 0 }).gifts, 24, 'нуль чи порожнє: щодня'); assert.equal(sanitizeSurvey({ name: 'А', gifts: '5' }).gifts, 5); assert.equal(sanitizeSurvey({ name: 'А' }).outDays, 3);
assert.deepEqual([...giftDaysFor(4)].sort((a, b) => a - b), [6, 12, 18, 24]); assert.equal(giftDaysFor(24).size, 24); assert.deepEqual([...giftDaysFor(1)], [24]);
const dates = windowDates('2026-12-01');
const od = outDaysFor(2, dates); assert.equal(od.size, 7); for (const d of [5, 6, 12, 13, 19, 20]) assert(od.has(d), 'вихідні: ' + d);
assert.equal(outDaysFor(0, dates).size, 0); assert.equal(outDaysFor(7, dates).size, 24);
assert.equal(ratingMult(null), 1); assert(ratingMult({ avg: 5, n: 50 }) > 1.6); assert(ratingMult({ avg: 1, n: 50 }) < 0.4); assert(Math.abs(ratingMult({ avg: 5, n: 1 }) - 1) < 0.5, 'одна оцінка мало що змінює');
const A = sanitizeSurvey({ name: 'А', budget: 500, level: 3, actBudget: 3, car: true, gifts: 12, outDays: 3 }), B = sanitizeSurvey({ name: 'Б', budget: 500, level: 2, actBudget: 2, gifts: 4, outDays: 1 });
const sch = generateSchedule([A, B], 42, dates, 'Львівська', 'UA');
assert.deepEqual(sch.giftDays, [3, 6, 9, 12, 15, 18, 21, 24], 'середнє 12 і 4 → 8 подарунків'); assert.equal(sch.outPerWeek, 2);
for (let d = 1; d <= 24; d++) {
  const p = sch.days[d], gift = sch.giftDays.includes(d);
  assert.equal(p.gift[0] != null, gift); assert.equal(p.gift[1] != null, gift);
  const home = ACTIVITIES[p.act].tags.includes('home'); assert.equal(home, !p.out, `день ${d}: ${p.out ? 'вихід' : 'вдома'} → ${ACTIVITIES[p.act].title}`);
}
assert.equal(Object.entries(sch.days).filter(([d, p]) => p.out && !ACTIVITIES[p.act].day).length + [...od].filter(d => ACTIVITIES[sch.days[d].act].day).length, 7, 'два виходи на тиждень (святкові дні мають свою активність)');
const legacy = generateSchedule([{ ...A, gifts: undefined, outDays: undefined }, { ...B, gifts: undefined, outDays: undefined }], 42, dates, 'Львівська', 'UA');
assert.equal(legacy.giftDays.length, 24, 'старі анкети: подарунок щодня'); assert(Object.values(legacy.days).every(p => p.out === undefined));
// рейтинг: улюблене трапляється частіше, слабке рідше
const fav = ACTIVITIES.find(x => x.tags.includes('home') && x.cost === 0 && !x.day), bad = ACTIVITIES.filter(x => x.tags.includes('home') && x.cost === 0 && !x.day)[5];
let favN = 0, badN = 0, favN0 = 0;
const ratings = { ['act:' + fav.id]: { avg: 5, n: 80 }, ['act:' + bad.id]: { avg: 1, n: 80 } };
for (let seed = 1; seed <= 300; seed++) {
  const a = generateSchedule([A, B], seed, dates, 'Львівська', 'UA', { ratings }), b = generateSchedule([A, B], seed, dates, 'Львівська', 'UA');
  if (Object.values(a.days).some(p => p.act === fav.id)) favN++; if (Object.values(a.days).some(p => p.act === bad.id)) badN++; if (Object.values(b.days).some(p => p.act === fav.id)) favN0++;
}
assert(favN > favN0 * 1.3 && badN < favN0 * 0.6, `рейтинг впливає: улюблене ${favN} проти ${favN0}, слабке ${badN}`);
// уже отримане не повторюється
const seen = new Set([...Object.values(sch.days).flatMap(p => [p.intim != null ? 'intim:' + p.intim : null, 'act:' + p.act, 'q:' + p.q, ...p.gift.filter(g => g != null).map(g => 'gift:' + g)]).filter(Boolean)]);
const again = generateSchedule([A, B], 43, dates, 'Львівська', 'UA', { seen });
const repeats = Object.values(again.days).filter(p => seen.has('act:' + p.act) || seen.has('q:' + p.q) || seen.has('intim:' + p.intim));
assert(repeats.every(p => ACTIVITIES[p.act].day || QUESTIONS[p.q].day || INTIMATE[p.intim].day), 'друге замовлення пари без повторів (крім святкових днів)');

// ---- API: анкета з темпом, день без подарунка, фото й відео, оцінки ----
const db = makeDb(root), raw = db._raw;
const store = new Map();
const env = { DB: db, DEV: '1', PRICE_UAH: '399', BASE_URL: 'http://x', PAYMENT_MODE: 'stub', EMAIL_MODE: 'stub', NOW_OVERRIDE: '2026-11-30T10:00:00Z' };
const jar = {};
async function call(who, method, url, body, extra = {}) {
  const headers = { ...(body instanceof Uint8Array ? {} : { 'content-type': 'application/json' }), ...extra }; if (jar[who]) headers.cookie = 'rs=' + jar[who];
  const res = await handle(new Request('http://x' + url, { method, headers, body: body instanceof Uint8Array ? body : body ? JSON.stringify(body) : undefined }), env);
  const sc = res.headers.get('set-cookie'); if (sc && /rs=/.test(sc)) jar[who] = decodeURIComponent(sc.match(/rs=([^;]*)/)[1]);
  const ct = res.headers.get('content-type') || ''; return { status: res.status, res, j: ct.includes('json') ? await res.json() : null };
}
const outbox = () => raw.prepare('SELECT * FROM outbox ORDER BY id').all();
let ipn = 0;
async function couple(a, b, extra = {}) {
  const o = (await call('x', 'POST', '/api/orders', { nameA: 'Микола', nameB: 'Рита', emailA: a, emailB: b, city: 'Львів', region: 'Львівська', startDate: '2026-12-01', age18: true, terms: true, ...extra }, { 'cf-connecting-ip': '10.9.0.' + ++ipn })).j;
  await call('x', 'GET', '/api/dev/pay/' + o.orderId);
  const toks = outbox().filter(m => m.to_email === a || m.to_email === b).slice(-2).map(m => m.body.match(/#login=([\w-]+)/)[1]);
  await call(a, 'POST', '/api/auth/verify', { token: toks[0] }); await call(b, 'POST', '/api/auth/verify', { token: toks[1] });
  return o;
}
const o1 = await couple('a@t.com', 'b@t.com');
await call('a@t.com', 'POST', '/api/survey', { answers: { name: 'Микола', budget: 300, level: 2, actBudget: 2, gifts: 12, outDays: 3 } });
const st = (await call('b@t.com', 'POST', '/api/survey', { answers: { name: 'Рита', budget: 300, level: 2, actBudget: 1, gifts: 4, outDays: 1 } })).j; assert(st.ready);
const plan = JSON.parse(raw.prepare('SELECT schedule_json FROM calendars').get().schedule_json); assert.deepEqual(plan.giftDays, [3, 6, 9, 12, 15, 18, 21, 24]);
env.NOW_OVERRIDE = '2026-12-02T10:00:00Z';
let d1 = (await call('a@t.com', 'GET', '/api/day/1')).j; assert(d1.needAnswer); assert.deepEqual(d1.uploads, []); assert.equal(d1.video, false, 'без R2 відео недоступні');
// завантаження фото до відповіді
const jpg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4, 5, 6, 7, 8]), mp4 = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6F, 0x6D, 9, 9, 9, 9]);
assert.equal((await call('a@t.com', 'POST', '/api/answer-media?day=1', jpg, { 'content-type': 'image/jpeg' })).j.error, 'csrf', 'потрібен заголовок X-Upload');
const up = (who, d, bytes) => call(who, 'POST', '/api/answer-media?day=' + d, bytes, { 'x-upload': '1', 'content-type': 'application/octet-stream' });
assert.equal((await up('a@t.com', 1, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]))).j.error, 'bad_media');
assert.equal((await up('a@t.com', 1, mp4)).j.error, 'video_unavailable');
assert.equal((await up('a@t.com', 5, jpg)).j.error, 'bad_day', 'майбутній день');
const p1 = (await up('a@t.com', 1, jpg)).j; assert(p1.ok && p1.kind === 'photo'); const p2 = (await up('a@t.com', 1, jpg)).j;
assert.equal((await call('a@t.com', 'POST', `/api/answer-media/${p2.id}/delete`, {})).j.ok, true); assert.deepEqual((await call('a@t.com', 'GET', '/api/day/1')).j.uploads.map(u => u.id), [p1.id]);
// партнер не бачить, поки сам не відповів; чужий календар не бачить ніколи
assert.equal((await call('b@t.com', 'GET', '/api/answer-media/' + p1.id)).status, 403);
const own = await call('a@t.com', 'GET', '/api/answer-media/' + p1.id); assert.equal(own.status, 200); assert.equal(own.res.headers.get('content-type'), 'image/jpeg'); assert.equal((await own.res.arrayBuffer()).byteLength, jpg.length);
// відповідь лише фото (без тексту)
assert((await call('a@t.com', 'POST', '/api/answer', { day: 1, text: '' })).j.ok, 'відповідь фото без тексту');
assert.equal((await call('a@t.com', 'POST', `/api/answer-media/${p1.id}/delete`, {})).j.error, 'already_answered', 'після відповіді файл не прибрати');
assert.equal((await up('a@t.com', 1, jpg)).j.error, 'already_answered');
assert.equal((await call('b@t.com', 'POST', '/api/answer', { day: 1, text: '' })).j.error, 'answer_short', 'без тексту й без файлів не можна');
await call('b@t.com', 'POST', '/api/answer', { day: 1, text: 'Моя відповідь' });
assert.equal((await call('b@t.com', 'GET', '/api/answer-media/' + p1.id)).status, 200, 'тепер партнер бачить фото');
d1 = (await call('a@t.com', 'GET', '/api/day/1')).j; assert.deepEqual(d1.question.mineMedia.map(m => m.id), [p1.id]); assert.equal(d1.question.mine, '');
const db1 = (await call('b@t.com', 'GET', '/api/day/1')).j; assert.deepEqual(db1.question.partnerMedia.map(m => m.id), [p1.id]); assert.equal(db1.question.partner, '');
assert.equal(d1.gift, null, 'у день 1 без подарунка'); assert.equal(d1.nextGiftDay, 3); assert.equal(typeof d1.act.out, 'boolean');
const h = (await call('b@t.com', 'GET', '/api/history')).j.days.find(x => x.day === 1); assert.deepEqual(h.partnerMedia.map(m => m.id), [p1.id]); assert.equal(h.gift, null);
// оцінки
assert.equal((await call('a@t.com', 'POST', '/api/rate', { day: 2, kind: 'act', stars: 5 })).j.error, 'answer_first');
assert.equal((await call('a@t.com', 'POST', '/api/rate', { day: 1, kind: 'gift', stars: 5 })).j.error, 'no_item', 'у день без подарунка оцінювати нічого');
assert.equal((await call('a@t.com', 'POST', '/api/rate', { day: 1, kind: 'act', stars: 9 })).j.error, 'bad_stars');
assert.equal((await call('a@t.com', 'POST', '/api/rate', { day: 1, kind: 'act', stars: 2 })).j.stars, 2);
await call('a@t.com', 'POST', '/api/rate', { day: 1, kind: 'act', stars: 5 }); await call('a@t.com', 'POST', '/api/rate', { day: 1, kind: 'q', stars: 4 }); await call('b@t.com', 'POST', '/api/rate', { day: 1, kind: 'act', stars: 3 });
assert.deepEqual((await call('a@t.com', 'GET', '/api/day/1')).j.ratings, { act: 5, q: 4 }, 'оцінку можна змінити');
assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM item_ratings WHERE kind = 'act'").get().n, 2);
// R2: відео та Range
env.MEDIA = { put: async (k, b, o) => { store.set(k, { b: Buffer.from(b), ct: o.httpMetadata.contentType }); }, get: async (k, o) => { const x = store.get(k); if (!x) return null; const b = o && o.range ? x.b.subarray(o.range.offset, o.range.offset + o.range.length) : x.b; return { body: b, arrayBuffer: async () => b }; }, head: async k => store.get(k) || null, delete: async k => { store.delete(k); } };
const v = (await up('a@t.com', 2, mp4)).j; assert(v.ok && v.kind === 'video', JSON.stringify(v)); assert(store.has('ans/' + v.id));
const rg = await call('a@t.com', 'GET', '/api/answer-media/' + v.id, null, { range: 'bytes=4-7' }); assert.equal(rg.status, 206); assert.equal(rg.res.headers.get('content-range'), `bytes 4-7/${mp4.length}`); assert.equal(Buffer.from(await rg.res.arrayBuffer()).toString('latin1'), 'ftyp');
for (let i = 0; i < 3; i++) await up('a@t.com', 2, jpg); assert.equal((await up('a@t.com', 2, jpg)).j.error, 'too_many_files');
// повторне замовлення тієї ж пари: уже отримане не повторюється
const firstSeen = new Set(); for (const p of Object.values(plan.days)) { firstSeen.add('act:' + p.act); firstSeen.add('q:' + p.q); }
await couple('a@t.com', 'b@t.com', { startDate: '2027-01-10' });
env.NOW_OVERRIDE = '2026-12-02T10:00:00Z';
const cal2 = raw.prepare('SELECT id FROM calendars ORDER BY created_at DESC LIMIT 1').get().id;
await call('a@t.com', 'POST', '/api/survey', { answers: { name: 'Микола', budget: 300, level: 2, actBudget: 2, gifts: 24, outDays: 3 } });
await call('b@t.com', 'POST', '/api/survey', { answers: { name: 'Рита', budget: 300, level: 2, actBudget: 2, gifts: 24, outDays: 3 } });
const plan2 = JSON.parse(raw.prepare('SELECT schedule_json FROM calendars WHERE id = ?').get(cal2).schedule_json);
const rep2 = Object.values(plan2.days).filter(p => (firstSeen.has('act:' + p.act) && !ACTIVITIES[p.act].day) || (firstSeen.has('q:' + p.q) && !QUESTIONS[p.q].day));
assert.equal(rep2.length, 0, 'друге замовлення без повторів активностей і питань');
// чистка: файли й R2 видаляються разом із календарем
const c1 = raw.prepare('SELECT c.id FROM calendars c JOIN orders o ON o.id = c.order_id WHERE o.id = ?').get(o1.orderId).id;
raw.prepare('UPDATE calendars SET start_date = ? WHERE id = ?').run('2025-01-01', c1);
const n0 = raw.prepare('SELECT COUNT(*) AS n FROM answer_media').get().n; assert(n0 >= 5);
await purgeOld(env);
assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM answer_media').get().n, 0); assert.equal(store.size, 0, 'з R2 теж');
assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM item_ratings').get().n, 3, 'знеособлені оцінки лишаються для рейтингу');
console.log('OK calendar2');
