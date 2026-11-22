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
// Сторіс: Instagram (media_type=STORIES) і Facebook (photo_stories, video_stories у три кроки), без підпису, формат «story», розклад окремо від постів
{
  await set('ig_token', 'T'.repeat(40)); await set('ig_mode', 'fb'); await set('ig_id', '17841400000000001'); await set('ig_pub', ''); await set('ig_plan', ''); await set('fb_page', JSON.stringify({ id: '99999', name: 'ReeAdvent.fun' }));
  const sman = [{ id: 'p1', type: 'IMAGE', files: ['p1.jpg'], caption: 'Пост' }, { id: 's1', type: 'STORY', files: ['s1.jpg'], caption: '' }, { id: 's2', type: 'STORY_VIDEO', files: ['s2.mp4'], caption: '' }];
  let slog = [], n2 = 0;
  const sf = async (url, o = {}) => { url = String(url); const body = o.body ? Object.fromEntries(new URLSearchParams(o.body)) : null; slog.push({ url, body, headers: o.headers || null });
    if (url.endsWith('/social/posts.json')) return new Response(JSON.stringify(sman));
    if (url.includes('/99999') && !o.body && url.includes('fields=access_token')) return new Response(JSON.stringify({ access_token: 'PAGE' }));
    if (url.includes('status_code')) return new Response(JSON.stringify({ status_code: 'FINISHED' }));
    if (url.includes('permalink')) return new Response(JSON.stringify({}));
    if (url.endsWith('/media_publish')) return new Response(JSON.stringify({ id: 'M' + ++n2 }));
    if (url.endsWith('/99999/video_stories') && body && body.upload_phase === 'start') return new Response(JSON.stringify({ video_id: 'V1', upload_url: 'https://rupload.facebook.com/video-upload/v23.0/V1' }));
    if (url.startsWith('https://rupload.facebook.com/')) return new Response(JSON.stringify({ success: true }));
    if (url.endsWith('/99999/video_stories') || url.endsWith('/99999/photo_stories')) return new Response(JSON.stringify({ success: true, post_id: 'ST' + ++n2 }));
    return new Response(JSON.stringify({ id: 'C' + ++n2 })); };
  const so = { fetchImpl: sf, delay: 0 };
  // фото-сторіс
  let rr = await publishNext(env, { ...so, only: 's1' }); assert.equal(rr.ok, true, JSON.stringify(rr));
  const igs = slog.find(l => l.body && l.body.media_type === 'STORIES'); assert.equal(igs.body.image_url, 'https://reeadvent.fun/social/s1.jpg'); assert.equal(igs.body.caption, undefined);
  const fph = slog.find(l => l.url.endsWith('/99999/photos')); assert.equal(fph.body.published, 'false'); assert.equal(fph.body.access_token, 'PAGE');
  assert(slog.some(l => l.url.endsWith('/99999/photo_stories') && l.body.photo_id));
  // відео-сторіс
  slog = []; rr = await publishNext(env, { ...so, only: 's2' }); assert.equal(rr.ok, true, JSON.stringify(rr) + JSON.stringify(slog.map(l => [l.url.slice(-40), l.body && l.body.media_type])));
  assert.equal(slog.find(l => l.body && l.body.media_type === 'STORIES').body.video_url, 'https://reeadvent.fun/social/s2.mp4');
  const up = slog.find(l => l.url.startsWith('https://rupload.facebook.com/')); assert.equal(up.headers.file_url, 'https://reeadvent.fun/social/s2.mp4'); assert.equal(up.headers.Authorization, 'OAuth PAGE');
  assert(slog.some(l => l.url.endsWith('/99999/video_stories') && l.body && l.body.upload_phase === 'finish' && l.body.video_id === 'V1'));
  const stt = await pubState(env); assert(stt.done.s1 && stt.fb.s1 && stt.done.s2 && stt.fb.s2); assert.equal(stt.fb.s1.link, '');
  // формат у статусі, підпис сторіс не редагується, розклад окремо для сторіс і постів
  await set('ig_pub', ''); const stat = await publishStatus(env, sf); assert.deepEqual(stat.posts.map(x => x.format), ['post', 'story', 'story']);
  await editPost(env, 's1', { caption: 'не має зберегтися' }, sman); assert.equal((await publishStatus(env, sf)).posts.find(x => x.id === 's1').caption, '');
  const t1 = Date.now() + 864e5; assert.equal((await spread(env, t1, 0.5, sman, 'story')).n, 2);
  const eff = effective(sman, await getPlan(env)); assert.equal(eff.find(x => x.id === 'p1').at, null); assert.equal(eff.find(x => x.id === 's2').at - eff.find(x => x.id === 's1').at, 432e5);   // 12 годин
  await setAuto(env, true); r = await runAutoPublish(env, { ...so, now: eff.find(x => x.id === 's1').at + 6e4 }); assert.equal(r.id, 's1');
}
// без токена
await set('ig_token', ''); await set('ig_pub', ''); delete env.INSTAGRAM_TOKEN; r = await publishNext(env, { ...o, only: 'a' }); assert.equal(r.ok, false); assert.match(r.error, /не підключено/);
// Facebook: різні формулювання рядка «посилання в шапці» замінюються на адресу сайту
{
  const f4 = async (url, o = {}) => { url = String(url); if (url.endsWith('/social/posts.json')) return new Response(JSON.stringify([{ id: 'v1', type: 'IMAGE', files: ['v.jpg'], caption: 'Привіт\n\nІдеї подарунків: посилання в шапці профілю · Gift ideas: link in bio\n\n#a' }])); if (url.includes('fields=access_token')) return new Response(JSON.stringify({ access_token: 'PAGE' })); if (url.includes('status_code')) return new Response(JSON.stringify({ status_code: 'FINISHED' })); if (url.endsWith('/media_publish')) return new Response(JSON.stringify({ id: 'M9' })); return new Response(JSON.stringify({ id: 'C9' })); };
  await set('ig_token', 'T'.repeat(40)); await set('ig_mode', 'fb'); await set('ig_id', '17841400000000001'); await set('ig_pub', ''); await set('ig_plan', ''); await set('fb_page', JSON.stringify({ id: '99999', name: 'ReeAdvent.fun' })); const sent = [];
  const f5 = async (url, o = {}) => { if (o.body && String(url).endsWith('/99999/photos')) sent.push(Object.fromEntries(new URLSearchParams(o.body))); return f4(url, o); };
  const rr = await publishNext(env, { fetchImpl: f5, delay: 0 }); assert.equal(rr.ok, true, JSON.stringify(rr));
  assert(sent[0].caption.includes('https://reeadvent.fun') && !/link in bio/i.test(sent[0].caption) && !/шапці/.test(sent[0].caption) && sent[0].caption.includes('#a'), sent[0].caption);
}
console.log('OK igpublish');
