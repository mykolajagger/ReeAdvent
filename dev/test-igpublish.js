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
// правки: підпис, час, порядок, розкладка
import { editPost, setOrder, spread, getPlan, effective } from '../src/igpublish.js';
await set('ig_pub', ''); await set('ig_plan', '');
assert.equal((await editPost(env, 'a', { caption: 'x'.repeat(2201) }, man)).ok, false);
assert.equal((await editPost(env, 'a', { caption: Array.from({ length: 31 }, (_, i) => '#t' + i).join(' ') }, man)).ok, false);
assert.equal((await editPost(env, 'zzz', { caption: 'q' }, man)).ok, false);
assert.equal((await editPost(env, 'a', { caption: '  Свій підпис #один  ' }, man)).ok, true);
let ef = effective(man, await getPlan(env)); assert.equal(ef[0].caption, 'Свій підпис #один'); assert.equal(ef[0].defaultCaption, 'A');
assert.equal((await editPost(env, 'a', { caption: null }, man)).ok, true); assert.equal(effective(man, await getPlan(env))[0].caption, 'A');
assert.equal((await setOrder(env, ['c', 'a', 'b'], man)).ok, true); assert.deepEqual(effective(man, await getPlan(env)).map(p => p.id), ['c', 'a', 'b']);
assert.equal((await setOrder(env, ['a', 'b'], man)).ok, false); assert.equal((await setOrder(env, ['a', 'a', 'b'], man)).ok, false);
const t0 = Date.now() + 864e5; assert.equal((await spread(env, t0, 2, man)).n, 3); ef = effective(man, await getPlan(env)); assert.equal(ef[1].at - ef[0].at, 2 * 864e5);
assert.equal((await spread(env, Date.now() - 864e5 * 5, 1, man)).ok, false);
// автопублікація за розкладом: першим іде той, чий час настав; змінений підпис публікується
await setAuto(env, false); assert.equal((await runAutoPublish(env, { ...o, now: t0 + 6e4 })).skipped, 'off');
await setAuto(env, true); assert.equal((await runAutoPublish(env, { ...o, now: t0 - 5e5 })).skipped, 'none_due');
await editPost(env, 'c', { caption: 'Мій Reel' }, man);
log = []; r = await runAutoPublish(env, { ...o, now: t0 + 6e4 }); assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.id, 'c'); assert.equal(log.find(l => l.body && l.body.media_type === 'REELS').body.caption, 'Мій Reel');
assert.equal((await runAutoPublish(env, { ...o, now: t0 + 2 * 36e5 })).skipped, 'none_due');
r = await runAutoPublish(env, { ...o, now: t0 + 2 * 864e5 + 6e4 }); assert.equal(r.id, 'a');
assert.equal((await editPost(env, 'a', { caption: 'нова' }, man)).ok, false);   // опублікований не змінюється
// помилка → пауза 6 год
await set('ig_pub', ''); fail = true; r = await runAutoPublish(env, { ...o, now: t0 + 9 * 864e5 }); assert.equal(r.ok, false); fail = null;
assert.equal((await runAutoPublish(env, { ...o, now: t0 + 9 * 864e5 + 36e5 })).skipped, 'error_cooldown');
// Facebook-сторінка
import { saveFbPage, getFbPage } from '../src/igpublish.js';
await set('ig_token', 'T'.repeat(40)); await set('ig_pub', ''); await set('ig_plan', ''); await set('ig_auto', '0');
man[0].caption = 'Привіт\n\nПосилання в шапці профілю · Link in bio\n\n#a';
const ff = async (url, o = {}) => { url = String(url); if (url.includes('/99999')&& !o.body) return new Response(JSON.stringify(url.includes('fields=name') ? { name: 'ReeAdvent.fun' } : { access_token: 'PAGE' })); return f(url, o); };
const fo = { fetchImpl: ff, delay: 0 };
assert.equal((await saveFbPage(env, 'abc', fo)).ok, false);
const sp = await saveFbPage(env, '99999', fo); assert.equal(sp.ok, true); assert.equal((await getFbPage(env)).name, 'ReeAdvent.fun');
log = []; r = await publishNext(env, fo); assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.id, 'a');
const ph = log.find(l => l.url.endsWith('/99999/photos')); assert.equal(ph.body.url, 'https://reeadvent.fun/social/a.jpg'); assert.equal(ph.body.access_token, 'PAGE'); assert(ph.body.caption.includes('https://reeadvent.fun') && !ph.body.caption.includes('Link in bio'));
assert(log.some(l => l.body && l.body.image_url));   // Instagram теж
log = []; r = await publishNext(env, fo); assert.equal(r.id, 'b'); const feed = log.find(l => l.url.endsWith('/99999/feed')); assert(feed.body['attached_media[1]'] && JSON.parse(feed.body['attached_media[0]']).media_fbid); assert.equal(log.filter(l => l.url.endsWith('/99999/photos') && l.body.published === 'false').length, 2);
log = []; r = await publishNext(env, fo); assert.equal(r.id, 'c'); assert.equal(log.find(l => l.url.endsWith('/99999/videos')).body.file_url, 'https://reeadvent.fun/social/c.mp4');
st = await pubState(env); assert(st.fb.a && st.fb.b && st.fb.c && st.done.a);
// лише Facebook: Instagram вимкнено для поста
await set('ig_pub', ''); await set('ig_plan', ''); assert.equal((await editPost(env, 'a', { ig: false }, man)).ok, true);
log = []; r = await publishNext(env, { ...fo, only: 'a' }); assert.equal(r.ok, true); assert(!log.some(l => l.body && l.body.image_url) && log.some(l => l.url.endsWith('/99999/photos')));
assert((await publishStatus(env, ff)).posts[0].complete);
// збій Facebook не блокує Instagram: Instagram опубліковано, помилка записана, повтор дошле лише Facebook
await set('ig_pub', ''); await set('ig_plan', ''); let fbFail = true;
const f2 = async (url, o = {}) => (fbFail && String(url).includes('/99999/photos')) ? new Response(JSON.stringify({ error: { message: 'pages_manage_posts' } }), { status: 403 }) : ff(url, o);
r = await publishNext(env, { fetchImpl: f2, delay: 0 }); assert.equal(r.ok, false); assert.match(r.error, /Facebook: pages_manage_posts/); st = await pubState(env); assert(st.done.a && !st.fb.a);
fbFail = false; log = []; r = await publishNext(env, { fetchImpl: f2, delay: 0 }); assert.equal(r.id, 'a'); assert(!log.some(l => l.body && l.body.image_url), 'Instagram не дублюється'); assert((await pubState(env)).fb.a);
await saveFbPage(env, '', fo); assert.equal(await getFbPage(env), null);
// без токена
await set('ig_token', ''); await set('ig_pub', ''); delete env.INSTAGRAM_TOKEN; r = await publishNext(env, { ...o, only: 'a' }); assert.equal(r.ok, false); assert.match(r.error, /не підключено/);
console.log('OK igpublish');
