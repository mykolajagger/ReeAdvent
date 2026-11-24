// Threads: текст до 500 символів, публікація (фото, карусель, Reels → відео), пропуск сторіс, токен, черга разом з Instagram
import assert from 'node:assert/strict';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { makeDb } from './d1.js';
import { threadsText, publishThreads, saveThreadsToken, threadsStatus, refreshThreadsToken, disconnectThreads } from '../src/threads.js';
import { publishNext, publishStatus, isComplete, editPost, getPlan, effective } from '../src/igpublish.js';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), db = makeDb(root), env = { DB: db };
const set = (k, v) => db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, 0) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, v).run();

// текст
const cap = 'Перший абзац українською ✦\n\nДругий абзац.\n\n🔗 Посилання в шапці профілю · link in bio\n\nEnglish part here.\n\n#адвент #пари #reeadvent';
let t = threadsText(cap); assert.ok(!t.includes('#')); assert.ok(!/шапці профілю/.test(t)); assert.ok(t.endsWith('reeadvent.fun')); assert.ok(t.startsWith('Перший абзац'));
t = threadsText('А'.repeat(300) + '\n\n' + 'Б'.repeat(300)); assert.ok(t.length <= 500); assert.ok(!t.includes('Б')); assert.ok(t.endsWith('reeadvent.fun'));
t = threadsText('слово '.repeat(200)); assert.ok(t.length <= 500 && t.includes('…'));

// токен
let calls = [], n = 0, statusCalls = 0;
const J = o => new Response(JSON.stringify(o));
const f = async (url, o = {}) => { url = String(url); const u = new URL(url); const body = o.body ? Object.fromEntries(new URLSearchParams(o.body)) : Object.fromEntries(u.searchParams); calls.push({ url: u.origin + u.pathname, m: o.method || 'GET', body });
  if (url.endsWith('/social/posts.json')) return J(man);
  if (u.hostname !== 'graph.threads.net') { // Instagram / Facebook
    if (url.includes('status_code')) return J({ status_code: 'FINISHED' }); if (url.includes('permalink')) return J({ permalink: 'https://www.instagram.com/p/X/' }); if (url.endsWith('/media_publish')) return J({ id: 'M' + ++n }); return J({ id: 'C' + ++n }); }
  if (String(body.access_token).startsWith('BAD')) return new Response(JSON.stringify({ error: { message: 'Invalid OAuth access token' } }), { status: 400 });
  if (u.pathname === '/v1.0/me') return J({ id: 'TU1', username: 'reeadvent' });
  if (u.pathname === '/refresh_access_token') return J({ access_token: 'R'.repeat(40), expires_in: 5184000 });
  if (u.pathname.endsWith('/threads_publish')) return J({ id: 'TP' + ++n });
  if (body.fields === 'status,error_message') { statusCalls++; return J({ status: statusCalls % 2 ? 'IN_PROGRESS' : 'FINISHED' }); }
  if (body.fields === 'permalink') return J({ permalink: 'https://www.threads.com/@reeadvent/post/abc' });
  if (u.pathname.endsWith('/threads')) return J({ id: 'TC' + ++n });
  return new Response('{}', { status: 404 }); };
assert.equal((await saveThreadsToken(env, 'BAD'.padEnd(3), { fetchImpl: f })).ok, false);
let r = await saveThreadsToken(env, 'BAD'.repeat(10), { fetchImpl: f }); assert.equal(r.ok, false);
assert.match((await saveThreadsToken(env, 'EAA' + 'x'.repeat(40), { fetchImpl: f })).error, /токен Facebook/);
assert.match((await saveThreadsToken(env, 'IGAA' + 'x'.repeat(40), { fetchImpl: f })).error, /токен Instagram/);
r = await saveThreadsToken(env, ' "' + 'T'.repeat(20) + '\n' + 'T'.repeat(20) + '"', { fetchImpl: f, now: 1000 }); assert.equal(r.ok, true); assert.equal(r.username, 'reeadvent');
let s = await threadsStatus(env, 1000); assert.equal(s.connected, true); assert.equal(s.userId, 'TU1'); assert.equal(s.daysLeft, 60); assert.equal((await db.prepare("SELECT value FROM settings WHERE key = 'th_token'").first()).value, 'T'.repeat(40), 'пробіли, лапки й перенос рядка прибрано');
assert.equal((await refreshThreadsToken(env, { fetchImpl: f, now: 1000 + 864e5 })).skipped, true, 'раніше тижня не продовжує');
assert.equal((await refreshThreadsToken(env, { fetchImpl: f, now: 1000 + 8 * 864e5 })).ok, true);
assert.equal((await db.prepare("SELECT value FROM settings WHERE key = 'th_token'").first()).value, 'R'.repeat(40));

// публікація
const nowait = { fetchImpl: f, wait: async () => {} };
calls = []; r = await publishThreads(env, { id: 'a', type: 'IMAGE', files: ['a.jpg'], caption: cap }, nowait);
assert.equal(r.id.startsWith('TP'), true); assert.match(r.link, /threads\.com/);
const img = calls.find(c => c.body.media_type === 'IMAGE'); assert.equal(img.url, 'https://graph.threads.net/v1.0/TU1/threads'); assert.equal(img.body.image_url, 'https://reeadvent.fun/social/a.jpg'); assert.ok(!img.body.text.includes('#'));
calls = []; await publishThreads(env, { id: 'b', type: 'CAROUSEL', files: ['b1.jpg', 'b2.jpg', 'b3.jpg'], caption: 'B' }, nowait);
assert.equal(calls.filter(c => c.body.is_carousel_item === 'true').length, 3); assert.equal(calls.find(c => c.body.media_type === 'CAROUSEL').body.children.split(',').length, 3);
calls = []; await publishThreads(env, { id: 'c', type: 'REELS', files: ['c.mp4'], caption: 'C' }, nowait);
assert.equal(calls.find(c => c.body.media_type === 'VIDEO').body.video_url, 'https://reeadvent.fun/social/c.mp4');
assert.equal(await publishThreads(env, { id: 's', type: 'STORY', files: ['s.jpg'] }, nowait), null);

// черга: Instagram + Threads; сторіс лише в Instagram; вимкнений Threads для окремого поста
await set('ig_token', 'I'.repeat(40)); await set('ig_mode', 'fb'); await set('ig_id', '17841400000000001');
const man = [{ id: 'p1', type: 'IMAGE', files: ['p1.jpg'], caption: 'P1 #x' }, { id: 's1', type: 'STORY', files: ['s1.jpg'], caption: '' }, { id: 'p2', type: 'IMAGE', files: ['p2.jpg'], caption: 'P2' }];
const o = { fetchImpl: f, delay: 0 };
let q = await publishNext(env, o); assert.equal(q.ok, true); assert.equal(q.id, 'p1');
let st = await publishStatus(env, f); assert.equal(st.threads, true); const p1 = st.posts.find(p => p.id === 'p1'); assert.ok(p1.thDone && p1.complete);
q = await publishNext(env, o); assert.equal(q.id, 's1'); st = await publishStatus(env, f); assert.ok(st.posts.find(p => p.id === 's1').complete, 'сторіс завершена без Threads');
assert.equal((await editPost(env, 'p2', { th: false }, man)).ok, true); assert.equal(effective(man, await getPlan(env)).find(p => p.id === 'p2').th, false);
calls = []; q = await publishNext(env, o); assert.equal(q.id, 'p2'); assert.ok(!calls.some(c => c.url.includes('graph.threads.net') && c.m === 'POST'), 'Threads вимкнено для p2');
st = await publishStatus(env, f); assert.ok(st.posts.find(p => p.id === 'p2').complete);
assert.equal(isComplete({ done: { x: 1 }, fb: {}, th: {}, hasTh: true }, { id: 'x', type: 'IMAGE' }, false), false, 'чекає Threads');
// відключення: Threads більше не потрібен для завершення
await disconnectThreads(env); s = await threadsStatus(env); assert.equal(s.connected, false); st = await publishStatus(env, f); assert.equal(st.threads, false);
// пости, що вийшли в Instagram до підключення Threads, туди не дублюються
await set('ig_pub', JSON.stringify({ done: { p1: { at: 500 } }, fb: {}, th: {} })); await set('ig_plan', '');
await saveThreadsToken(env, 'T'.repeat(40), { fetchImpl: f, now: 1000 });
st = await publishStatus(env, f); const old = st.posts.find(p => p.id === 'p1'); assert.equal(old.thNeeded, false); assert.ok(old.complete, 'старий пост завершений');
calls = []; q = await publishNext(env, o); assert.equal(q.id, 's1', 'черга йде далі, а не до старого поста'); assert.ok(!calls.some(c => c.url.includes('graph.threads.net') && c.m === 'POST'));
q = await publishNext(env, o); assert.equal(q.id, 'p2'); st = await publishStatus(env, f); assert.ok(st.posts.find(p => p.id === 'p2').thDone, 'новий пост іде в Threads');
await refreshThreadsToken(env, { fetchImpl: f, now: 1000 + 8 * 864e5 }); st = await publishStatus(env, f); assert.equal(st.posts.find(p => p.id === 'p1').thNeeded, false, 'продовження токена не зсуває дату підключення');
console.log('OK threads');
