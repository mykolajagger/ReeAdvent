// Публікація в Instagram: черга постів, контейнери, карусель, Reel, помилки, автопублікація
import assert from 'node:assert/strict';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { makeDb } from './d1.js';
import { publishNext, publishStatus, setAuto, runAutoPublish, pubState } from '../src/igpublish.js';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), db = makeDb(root), env = { DB: db };
const set = (k, v) => db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, 0) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, v).run();
await set('ig_token', 'T'.repeat(40)); await set('ig_mode', 'fb'); await set('ig_id', '17841400000000001');
const man = [{ id: 'a', type: 'IMAGE', files: ['a.jpg'], caption: 'A' }, { id: 'b', type: 'CAROUSEL', files: ['b1.jpg', 'b2.jpg'], caption: 'B' }, { id: 'c', type: 'REELS', files: ['c.mp4'], cover: 'c.jpg', caption: 'C' }];
let log = [], fail = null, n = 0;
const f = async (url, o = {}) => { url = String(url); const body = o.body ? Object.fromEntries(new URLSearchParams(o.body)) : null; log.push({ url, body });
  if (url.endsWith('/social/posts.json')) return new Response(JSON.stringify(man));
  if (fail && url.includes('/media') && !url.includes('media_publish')) return new Response(JSON.stringify({ error: { message: 'Permissions error' } }), { status: 400 });
  if (url.includes('status_code')) return new Response(JSON.stringify({ status_code: 'FINISHED' }));
  if (url.includes('permalink')) return new Response(JSON.stringify({ permalink: 'https://www.instagram.com/p/XYZ/' }));
  if (url.endsWith('/media_publish')) return new Response(JSON.stringify({ id: 'M' + ++n }));
  return new Response(JSON.stringify({ id: 'C' + ++n })); };
const o = { fetchImpl: f, delay: 0 };
let r = await publishNext(env, o); assert.equal(r.ok, true); assert.equal(r.id, 'a');
const first = log.find(l => l.body && l.body.image_url); assert.equal(first.body.image_url, 'https://reeadvent.fun/social/a.jpg'); assert.equal(first.body.caption, 'A'); assert(first.url.includes('/17841400000000001/media'));
log = []; r = await publishNext(env, o); assert.equal(r.id, 'b');
assert.equal(log.filter(l => l.body && l.body.is_carousel_item === 'true').length, 2); const par = log.find(l => l.body && l.body.media_type === 'CAROUSEL'); assert.equal(par.body.children.split(',').length, 2);
log = []; r = await publishNext(env, o); assert.equal(r.id, 'c'); const reel = log.find(l => l.body && l.body.media_type === 'REELS'); assert.equal(reel.body.video_url, 'https://reeadvent.fun/social/c.mp4'); assert.equal(reel.body.cover_url, 'https://reeadvent.fun/social/c.jpg');
r = await publishNext(env, o); assert.equal(r.ok, false); assert.match(r.error, /Усі пости/);
let st = await publishStatus(env, f); assert(st.posts.every(p => p.done) && st.posts[0].done.link.includes('instagram.com'));
// помилка: пост не позначається опублікованим
await set('ig_pub', ''); fail = true; r = await publishNext(env, o); assert.equal(r.ok, false); assert.match(r.error, /Permissions/); st = await pubState(env); assert.deepEqual(st.done, {}); assert.equal(st.err.id, 'a');
fail = null;
// автопублікація
await setAuto(env, false); assert.equal((await runAutoPublish(env, { ...o, now: Date.UTC(2026, 11, 1, 17) })).skipped, 'off');
await setAuto(env, true); await set('ig_pub', '');
assert.equal((await runAutoPublish(env, { ...o, now: Date.UTC(2026, 11, 1, 9) })).skipped, 'early');
r = await runAutoPublish(env, { ...o, now: Date.UTC(2026, 11, 1, 17) }); assert.equal(r.ok, true);
assert.equal((await runAutoPublish(env, { ...o, now: Date.UTC(2026, 11, 1, 18) })).skipped, 'recent');
r = await runAutoPublish(env, { ...o, now: Date.UTC(2026, 11, 2, 17) }); assert.equal(r.id, 'b');
// без токена
await set('ig_token', ''); await set('ig_pub', ''); delete env.INSTAGRAM_TOKEN; r = await publishNext(env, { ...o, only: 'a' }); assert.equal(r.ok, false); assert.match(r.error, /не підключено/);
console.log('OK igpublish');
