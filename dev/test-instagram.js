// Instagram: стрічка постів (кеш, відмова), збереження токена з перевіркою, автопродовження, публічний API і захист адмін-маршрутів.
import assert from 'node:assert/strict';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { makeDb } from './d1.js';
import { handle } from '../src/api.js';
import { mapPosts, parseEmbeds, saveEmbeds, getEmbeds, embedsText, instagramFeed, saveToken, refreshToken, igStatus, disconnect, getToken, IG_URL, IG_HANDLE } from '../src/instagram.js';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), db = makeDb(root), env = { DB: db, DEV: '1', CRON_SECRET: 'c'.repeat(24), BASE_URL: 'http://x', PAYMENT_MODE: 'stub', EMAIL_MODE: 'stub', PRICE_UAH: '400' };
assert.equal(IG_HANDLE, 'reeadvent'); assert.equal(IG_URL, 'https://www.instagram.com/reeadvent/');

const media = { data: [
  { id: '1', media_type: 'IMAGE', media_url: 'https://cdn.example/1.jpg', permalink: 'https://www.instagram.com/p/AAA/', caption: 'Перший\n  пост' },
  { id: '2', media_type: 'VIDEO', media_url: 'https://cdn.example/v.mp4', thumbnail_url: 'https://cdn.example/2.jpg', permalink: 'https://www.instagram.com/reel/BBB/' },
  { id: '3', media_type: 'CAROUSEL_ALBUM', media_url: 'https://cdn.example/3.jpg', permalink: 'https://www.instagram.com/p/CCC/' },
  { id: '4', media_type: 'IMAGE', media_url: 'http://insecure/4.jpg', permalink: 'https://www.instagram.com/p/DDD/' },           // не https
  { id: '5', media_type: 'IMAGE', media_url: 'https://cdn.example/5.jpg', permalink: 'https://evil.example/p/EEE/' },             // чужий домен посилання
  { id: '6', media_type: 'VIDEO', media_url: 'https://cdn.example/v6.mp4', permalink: 'https://www.instagram.com/reel/FFF/' },   // відео без обкладинки
  ...Array.from({ length: 10 }, (_, i) => ({ id: 'x' + i, media_type: 'IMAGE', media_url: `https://cdn.example/x${i}.jpg`, permalink: `https://www.instagram.com/p/X${i}/` }))] };
const posts = mapPosts(media);
assert.equal(posts.length, 6); assert.deepEqual(posts.slice(0, 3).map(p => p.id), ['1', '2', '3']); assert.equal(posts[1].img, 'https://cdn.example/2.jpg'); assert.equal(posts[0].alt, 'Перший пост');
assert(posts.every(p => p.img.startsWith('https://') && p.link.startsWith('https://www.instagram.com/')), 'небезпечні посилання відсіяно'); assert.deepEqual(mapPosts(null), []);

let calls = 0, ok = true; const calledUrls = [];
const fakeFetch = async url => { calls++; calledUrls.push(String(url));
  if (String(url).includes('/me/media')) return ok ? new Response(JSON.stringify(media)) : new Response('err', { status: 500 });
  if (String(url).includes('refresh_access_token')) return ok ? new Response(JSON.stringify({ access_token: 'N'.repeat(40), expires_in: 5184000 })) : new Response('{}', { status: 400 });
  if (String(url).includes('graph.facebook.com') && String(url).includes('?fields=username')) return String(url).includes('GOODTOKEN') && String(url).includes('/17841400000000000?') ? new Response(JSON.stringify({ username: 'reeadvent', id: '17841400000000000' })) : new Response('{"error":{}}', { status: 400 });
  if (String(url).includes('graph.facebook.com') && String(url).includes('/media?')) return new Response(JSON.stringify(media));
  if (String(url).includes('/me?fields=username')) return String(url).includes('GOODTOKEN') ? new Response(JSON.stringify({ username: 'reeadvent', id: '1' })) : new Response('{"error":{}}', { status: 400 });
  throw new Error('unexpected ' + url); };

// без токена порожньо, мережу не чіпаємо
assert.deepEqual(await instagramFeed(env, { fetchImpl: fakeFetch }), []); assert.equal(calls, 0); assert.equal((await igStatus(env)).connected, false);
// токен: коротка/зайва/відхилена
for (const bad of ['', 'short', 'a'.repeat(900), 'has space ' + 'a'.repeat(40)]) assert.equal((await saveToken(env, bad, { fetchImpl: fakeFetch })).error, 'bad_token', bad.slice(0, 10));
assert.equal((await saveToken(env, 'WRONG' + 'x'.repeat(40), { fetchImpl: fakeFetch })).error, 'token_rejected'); assert.equal(await getToken(env), null);
const T0 = Date.now(), GOOD = 'GOODTOKEN' + 'g'.repeat(40);
assert.deepEqual(await saveToken(env, GOOD, { fetchImpl: fakeFetch, now: T0 }), { ok: true, username: 'reeadvent' });
let st = await igStatus(env, T0); assert.deepEqual([st.connected, st.username, st.daysLeft], [true, 'reeadvent', 60]);
// стрічка й кеш
calls = 0; let f1 = await instagramFeed(env, { fetchImpl: fakeFetch, now: T0 + 1000 }); assert.equal(f1.length, 6); assert.equal(calls, 1);
f1 = await instagramFeed(env, { fetchImpl: fakeFetch, now: T0 + 30 * 60e3 }); assert.equal(calls, 1, 'у межах години — з кешу');
ok = false; f1 = await instagramFeed(env, { fetchImpl: fakeFetch, now: T0 + 2 * 3600e3 }); assert.equal(calls, 2); assert.equal(f1.length, 6, 'помилка Instagram → віддаємо старий кеш');
assert(calledUrls.some(u => u.includes('access_token=' + GOOD)));
// автопродовження: рано — ні, через 8 днів — так
ok = true; calls = 0; assert.equal((await refreshToken(env, { fetchImpl: fakeFetch, now: T0 + 3 * 864e5 })).refreshed, false); assert.equal(calls, 0);
assert.equal((await refreshToken(env, { fetchImpl: fakeFetch, now: T0 + 8 * 864e5 })).refreshed, true); assert.equal(await getToken(env), 'N'.repeat(40));
st = await igStatus(env, T0 + 8 * 864e5); assert.equal(st.daysLeft, 60);
ok = false; assert.equal((await refreshToken(env, { fetchImpl: fakeFetch, now: T0 + 20 * 864e5 })).refreshed, false); assert.equal(await getToken(env), 'N'.repeat(40), 'невдале продовження токен не стирає');
// токен із секрету середовища теж працює
await disconnect(env); assert.equal(await getToken(env), null); assert.equal((await igStatus(env)).connected, false);
const env2 = { ...env, INSTAGRAM_TOKEN: 'S'.repeat(40) }; assert.equal((await igStatus(env2)).viaSecret, true);

// токен системного користувача (Unified login): graph.facebook.com + ID акаунта, без терміну дії і без продовження
assert.equal((await saveToken(env, GOOD, { igId: 'abc', fetchImpl: fakeFetch })).error, 'bad_id');
assert.equal((await saveToken(env, GOOD, { igId: '99999999', fetchImpl: fakeFetch })).error, 'token_rejected', 'невірний ID');
assert.deepEqual(await saveToken(env, GOOD, { igId: '17841400000000000', fetchImpl: fakeFetch, now: T0 }), { ok: true, username: 'reeadvent' });
st = await igStatus(env, T0 + 400 * 864e5); assert.deepEqual([st.connected, st.neverExpires, st.daysLeft], [true, true, null]);
ok = true; calls = 0; calledUrls.length = 0; const fbPosts = await instagramFeed(env, { fetchImpl: fakeFetch, now: T0 + 5 }); assert.equal(fbPosts.length, 6); assert(calledUrls.some(u => u.startsWith('https://graph.facebook.com/v23.0/17841400000000000/media?')), calledUrls.join(' '));
assert.equal((await refreshToken(env, { fetchImpl: fakeFetch, now: T0 + 90 * 864e5 })).refreshed, false, 'токен без терміну дії не продовжується');
await disconnect(env);
// вбудовані пости (без токена)
const em = parseEmbeds('https://www.instagram.com/p/ABCDEFG12345/\nhttps://instagram.com/reel/Zz-_9yyyyy/?igsh=abc, https://www.instagram.com/p/ABCDEFG12345/ https://evil.example/p/XXXXXXXXXX/ https://www.instagram.com/reeadvent/ javascript:alert(1) https://www.instagram.com/tv/abcd');
assert.deepEqual(em, [{ t: 'p', c: 'ABCDEFG12345' }, { t: 'reel', c: 'Zz-_9yyyyy' }], JSON.stringify(em));
assert.equal(parseEmbeds(Array.from({ length: 9 }, (_, i) => `https://www.instagram.com/p/CODE${i}abcde/`).join('\n')).length, 6, 'не більше 6');
assert.deepEqual(await getEmbeds(env), []); await saveEmbeds(env, 'https://www.instagram.com/p/ABCDEFG12345/'); assert.equal(embedsText(await getEmbeds(env)), 'https://www.instagram.com/p/ABCDEFG12345/'); assert.equal((await igStatus(env)).embeds, 1);
const pubE = await (await handle(new Request('http://x/api/instagram'), env)).json(); assert.deepEqual(pubE.embeds, [{ t: 'p', c: 'ABCDEFG12345' }]);
// публічний API й захист адмінки
const pub = await handle(new Request('http://x/api/instagram'), env); const pj = await pub.json();
assert.equal(pub.status, 200); assert.deepEqual([pj.ok, pj.handle, pj.posts], [true, 'reeadvent', []]); assert.match(pub.headers.get('cache-control'), /max-age=600/);
for (const [m, p, b] of [['GET', '/api/admin/instagram'], ['POST', '/api/admin/instagram/token', { token: GOOD }], ['POST', '/api/admin/instagram/disconnect', {}], ['POST', '/api/admin/instagram/embeds', { text: 'x' }]]) assert([401, 403].includes((await handle(new Request('http://x' + p, { method: m, headers: { 'x-admin': '1', 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }), env)).status), p);
console.log('INSTAGRAM OK');
