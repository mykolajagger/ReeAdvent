// Публікація в Instagram через Content Publishing API: готові пости лежать на сайті (/social/posts.json), публікуємо по одному за чергою.
// Стан у settings: ig_pub = { done: { id: { at, media_id, link } }, err }, ig_auto = '1' (автопублікація раз на добу після 18:00 за Києвом).
import { getToken } from './instagram.js';
export const SITE = 'https://reeadvent.fun';
const GRAPH = 'https://graph.instagram.com', FB = 'https://graph.facebook.com/v23.0', DAY = 864e5;
const getSetting = async (env, k) => { const r = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(k).first(); return r ? r.value : null; };
const setSetting = (env, k, v) => env.DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(k, v, Date.now()).run();
const parse = s => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function loadManifest(fetchImpl = fetch, site = SITE) {
  const r = await fetchImpl(`${site}/social/posts.json`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('manifest ' + r.status);
  return await r.json();
}
export async function pubState(env) { const s = parse(await getSetting(env, 'ig_pub')) || {}; return { done: s.done || {}, err: s.err || null, auto: (await getSetting(env, 'ig_auto')) === '1' }; }
export const setAuto = (env, on) => setSetting(env, 'ig_auto', on ? '1' : '0');
const saveState = (env, st) => setSetting(env, 'ig_pub', JSON.stringify({ done: st.done, err: st.err }));

async function call(fetchImpl, method, url, params) {
  const body = new URLSearchParams(params);
  const r = await fetchImpl(method === 'GET' ? `${url}?${body}` : url, method === 'GET' ? { signal: AbortSignal.timeout(15000) } : { method, body, signal: AbortSignal.timeout(25000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(String((j.error && (j.error.error_user_msg || j.error.message)) || 'HTTP ' + r.status).slice(0, 240));
  return j;
}
/** Чекає, поки Instagram обробить контейнер (для відео довго). */
async function waitReady(fetchImpl, base, id, token, { tries = 40, delay = 3000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const j = await call(fetchImpl, 'GET', `${base}/${id}`, { fields: 'status_code,status', access_token: token });
    if (j.status_code === 'FINISHED') return; if (j.status_code === 'ERROR' || j.status_code === 'EXPIRED') throw new Error('Instagram не обробив файл: ' + (j.status || j.status_code));
    await sleep(delay);
  }
  throw new Error('Instagram довго обробляє файл, спробуйте ще раз за кілька хвилин');
}
/** Публікує один пост із маніфесту. Повертає { media_id, link }. */
export async function publishPost(env, post, { fetchImpl = fetch, site = SITE, delay = 3000 } = {}) {
  const token = await getToken(env); if (!token) throw new Error('Instagram не підключено');
  const fb = (await getSetting(env, 'ig_mode')) === 'fb', id = fb ? await getSetting(env, 'ig_id') : 'me';
  if (!id) throw new Error('Не задано ID акаунта Instagram');
  const base = fb ? FB : GRAPH, url = f => `${site}/social/${f}`, opts = { delay };
  let creation;
  if (post.type === 'IMAGE') creation = (await call(fetchImpl, 'POST', `${base}/${id}/media`, { image_url: url(post.files[0]), caption: post.caption, access_token: token })).id;
  else if (post.type === 'REELS') creation = (await call(fetchImpl, 'POST', `${base}/${id}/media`, { media_type: 'REELS', video_url: url(post.files[0]), caption: post.caption, share_to_feed: 'true', ...(post.cover ? { cover_url: url(post.cover) } : {}), access_token: token })).id;
  else if (post.type === 'CAROUSEL') {
    const kids = []; for (const f of post.files) kids.push((await call(fetchImpl, 'POST', `${base}/${id}/media`, { image_url: url(f), is_carousel_item: 'true', access_token: token })).id);
    for (const k of kids) await waitReady(fetchImpl, base, k, token, { tries: 20, delay });
    creation = (await call(fetchImpl, 'POST', `${base}/${id}/media`, { media_type: 'CAROUSEL', children: kids.join(','), caption: post.caption, access_token: token })).id;
  } else throw new Error('Невідомий тип поста');
  if (!creation) throw new Error('Instagram не повернув ID контейнера');
  await waitReady(fetchImpl, base, creation, token, { tries: post.type === 'REELS' ? 60 : 20, ...opts });
  const pub = await call(fetchImpl, 'POST', `${base}/${id}/media_publish`, { creation_id: creation, access_token: token });
  let link = ''; try { link = (await call(fetchImpl, 'GET', `${base}/${pub.id}`, { fields: 'permalink', access_token: token })).permalink || ''; } catch {}
  return { media_id: pub.id, link };
}

/** Публікує наступний пост за чергою (або конкретний id). Результат: { ok, id } або { ok: false, error } */
export async function publishNext(env, { only = null, fetchImpl = fetch, site = SITE, now = Date.now(), delay = 3000 } = {}) {
  const st = await pubState(env); let man;
  try { man = await loadManifest(fetchImpl, site); } catch (e) { return { ok: false, error: 'Не вдалося прочитати список постів: ' + e.message }; }
  const post = only ? man.find(p => p.id === only) : man.find(p => !st.done[p.id]);
  if (!post) return { ok: false, error: only ? 'Немає такого поста' : 'Усі пости вже опубліковано' };
  if (st.done[post.id]) return { ok: false, error: 'Цей пост уже опубліковано' };
  try { const r = await publishPost(env, post, { fetchImpl, site, delay }); st.done[post.id] = { at: now, ...r }; st.err = null; await saveState(env, st); await setSetting(env, 'ig_cache', ''); return { ok: true, id: post.id, link: r.link }; }
  catch (e) { st.err = { at: now, id: post.id, error: String(e.message || e).slice(0, 240) }; await saveState(env, st); return { ok: false, error: st.err.error }; }
}
/** Автопублікація: раз на добу, після 18:00 за Києвом (UTC+2/+3, беремо 16 UTC), якщо ввімкнена й минуло ≥20 год від останньої. */
export async function runAutoPublish(env, { now = Date.now(), ...rest } = {}) {
  const st = await pubState(env); if (!st.auto) return { skipped: 'off' };
  if (new Date(now).getUTCHours() < 16) return { skipped: 'early' };
  const last = Math.max(0, ...Object.values(st.done).map(d => d.at || 0)); if (now - last < 20 * 36e5) return { skipped: 'recent' };
  if (st.err && st.err.at && now - st.err.at < 6 * 36e5) return { skipped: 'error_cooldown' };
  return publishNext(env, { now, ...rest });
}
export async function publishStatus(env, fetchImpl = fetch, site = SITE) {
  const st = await pubState(env); let man = []; try { man = await loadManifest(fetchImpl, site); } catch {}
  return { auto: st.auto, err: st.err, posts: man.map(p => ({ id: p.id, type: p.type, n: p.files.length, title: (p.caption || '').split('\n')[0].slice(0, 70), done: st.done[p.id] || null })) };
}
