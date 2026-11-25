// Instagram відповів помилкою, але пост вийшов: не публікуємо вдруге. Замок від одночасних публікацій.
import assert from 'node:assert/strict';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { makeDb } from './d1.js';
import { publishNext, pubState } from '../src/igpublish.js';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), db = makeDb(root), env = { DB: db };
const set = (k, v) => db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, 0) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, v).run();
await set('ig_token', 'T'.repeat(40)); await set('ig_mode', 'fb'); await set('ig_id', '1784');
const man = [{ id: 'dinner', type: 'IMAGE', files: ['d.jpg'], caption: 'Вечеря вдвох — теж подарунок ✦\n\n#пари' }, { id: 'next', type: 'IMAGE', files: ['n.jpg'], caption: 'Наступний' }];
let feed = [], publishes = 0, containerStatus = 'FINISHED', blockPublish = false, n = 0;
const J = o => new Response(JSON.stringify(o)), E = m => new Response(JSON.stringify({ error: { message: m, error_user_msg: m } }), { status: 400 });
const f = async (url, o = {}) => { url = String(url); const u = new URL(url); const body = o.body ? Object.fromEntries(new URLSearchParams(o.body)) : Object.fromEntries(u.searchParams);
  if (url.endsWith('/social/posts.json')) return J(man);
  if (u.pathname.endsWith('/1784/media') && !o.method) return J({ data: feed });
  if (u.pathname.endsWith('/1784/media')) return J({ id: 'C' + ++n });
  if (u.pathname.endsWith('/media_publish')) { publishes++; const cap = man.find(p => p.id === cur).caption; feed.unshift({ id: 'M' + publishes, caption: cap, permalink: 'https://www.instagram.com/p/M' + publishes + '/', timestamp: new Date().toISOString() }); containerStatus = 'PUBLISHED'; return blockPublish ? E('Щоб захистити нашу спільноту, ми обмежуємо деяку активність.') : J({ id: 'M' + publishes }); }
  if (body.fields === 'status_code,status' || body.fields === 'status_code') return J({ status_code: containerStatus });
  if (body.fields === 'permalink') return J({ permalink: 'https://www.instagram.com/p/X/' });
  return J({ id: 'X' + ++n }); };
let cur = 'dinner';
// 1) Instagram повернув помилку, але пост вийшов → вважаємо опублікованим, без повторів
blockPublish = true; let r = await publishNext(env, { fetchImpl: f, delay: 0, only: 'dinner' });
assert.equal(r.ok, true, 'помилка Instagram, але пост є в стрічці → успіх'); assert.equal(publishes, 1);
let st = await pubState(env); assert.equal(st.done.dinner.media_id, 'M1'); assert.equal(st.done.dinner.recovered, true); assert.equal(st.err, null);
// повторне натискання не публікує вдруге
r = await publishNext(env, { fetchImpl: f, delay: 0, only: 'dinner' }); assert.equal(r.ok, false); assert.equal(publishes, 1);
// 2) стан загубився (стара «невдала» спроба), але пост уже в стрічці → не публікуємо, а позначаємо
await set('ig_pub', ''); containerStatus = 'FINISHED'; r = await publishNext(env, { fetchImpl: f, delay: 0, only: 'dinner' });
assert.equal(r.ok, true); assert.equal(publishes, 1, 'знайдено в стрічці, повтору немає'); assert.equal((await pubState(env)).done.dinner.media_id, 'M1');
// 3) справжня помилка (поста немає) → помилка, пост не позначений
cur = 'next'; blockPublish = true; const realFail = async (url, o = {}) => { if (String(url).endsWith('/media_publish')) { publishes++; return E('Справжня помилка'); } return f(url, o); };
containerStatus = 'FINISHED'; r = await publishNext(env, { fetchImpl: realFail, delay: 0, only: 'next' }); assert.equal(r.ok, false); assert.match(r.error, /Справжня помилка/); assert.ok(!(await pubState(env)).done.next);
// 4) замок: поки йде одна публікація, друга не стартує
await set('ig_lock', String(Date.now())); r = await publishNext(env, { fetchImpl: f, delay: 0, only: 'next' }); assert.equal(r.ok, false); assert.match(r.error, /вже йде/);
await set('ig_lock', String(Date.now() - 6 * 6e4)); blockPublish = false; containerStatus = 'FINISHED'; r = await publishNext(env, { fetchImpl: f, delay: 0, only: 'next' }); assert.equal(r.ok, true, 'старий замок (>5 хв) не заважає');
assert.equal((await db.prepare("SELECT value FROM settings WHERE key = 'ig_lock'").first()).value, '0', 'замок звільнено');
console.log('OK igdedupe');
