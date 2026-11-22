// Публікація в Instagram і на сторінку Facebook: готові пости й сторіс лежать на сайті (/social/posts.json), публікуємо за розкладом або вручну.
// Типи: IMAGE, CAROUSEL, REELS (пости) і STORY, STORY_VIDEO (сторіс: без підпису, текст уже на картинці).
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
export async function pubState(env) { const s = parse(await getSetting(env, 'ig_pub')) || {}; return { done: s.done || {}, fb: s.fb || {}, err: s.err || null, auto: (await getSetting(env, 'ig_auto')) === '1' }; }
export const getFbPage = async env => parse(await getSetting(env, 'fb_page')) || null;   // { id, name }
export const FB_LINE = 'https://reeadvent.fun';
export const setAuto = (env, on) => setSetting(env, 'ig_auto', on ? '1' : '0');
export const isStory = p => !!p && (p.type === 'STORY' || p.type === 'STORY_VIDEO');
export async function getPlan(env) { const p = parse(await getSetting(env, 'ig_plan')) || {}; return { order: Array.isArray(p.order) ? p.order : [], posts: p.posts && typeof p.posts === 'object' ? p.posts : {} }; }
export const savePlan = (env, plan) => setSetting(env, 'ig_plan', JSON.stringify(plan));
/** Маніфест + правки адміна: порядок, свій підпис, запланований час. */
export function effective(man, plan) {
  const byId = Object.fromEntries(man.map(p => [p.id, p])), ids = [...plan.order.filter(i => byId[i]), ...man.map(p => p.id).filter(i => !plan.order.includes(i))];
  return ids.map(id => { const p = byId[id], o = plan.posts[id] || {}; return { ...p, format: isStory(p) ? 'story' : 'post', defaultCaption: p.caption || '', caption: isStory(p) ? '' : typeof o.caption === 'string' ? o.caption : p.caption, at: Number.isFinite(o.at) ? o.at : null, ig: o.ig !== false, fb: o.fb !== false }; });
}
export const MAX_CAPTION = 2200;
/** Усі ввімкнені майданчики поста вже опубліковано? Facebook враховується лише якщо підключено сторінку. */
export const isComplete = (st, p, hasFb) => { const needIg = p.ig !== false && !st.done[p.id], needFb = hasFb && p.fb !== false && !st.fb[p.id]; return !needIg && !needFb && (p.ig !== false || (hasFb && p.fb !== false)) ; };
/** Зберігає правки одного поста: caption (рядок або null = стандартний), at (мс або null). Опубліковані пости не змінюються. */
export async function editPost(env, id, { caption, at, ig, fb } = {}, man) {
  const st = await pubState(env); if (!man.find(p => p.id === id)) return { ok: false, error: 'Немає такого поста' };
  const fbp = await getFbPage(env), cur = effective(man, await getPlan(env)).find(p => p.id === id);
  if (isComplete(st, cur, !!fbp)) return { ok: false, error: 'Пост уже опубліковано, його не можна змінити' };
  const plan = await getPlan(env), o = plan.posts[id] = plan.posts[id] || {};
  if (typeof ig === 'boolean') o.ig = ig; if (typeof fb === 'boolean') o.fb = fb;
  if (caption !== undefined && !isStory(cur)) { if (caption === null) delete o.caption; else { caption = String(caption).replace(/\r/g, '').trim(); if (!caption || caption.length > MAX_CAPTION) return { ok: false, error: 'Підпис: від 1 до 2200 символів' }; if ((caption.match(/#[^\s#]+/g) || []).length > 30) return { ok: false, error: 'Не більше 30 хештегів' }; o.caption = caption; } }
  if (at !== undefined) { if (at === null) delete o.at; else { at = Number(at); if (!Number.isFinite(at) || at < Date.now() - 864e5 || at > Date.now() + 400 * 864e5) return { ok: false, error: 'Некоректна дата' }; o.at = Math.round(at / 6e4) * 6e4; } }
  await savePlan(env, plan); return { ok: true };
}
export async function setOrder(env, order, man) {
  const ids = man.map(p => p.id); if (!Array.isArray(order) || order.length !== ids.length || !ids.every(i => order.includes(i))) return { ok: false, error: 'Некоректний порядок' };
  const plan = await getPlan(env); plan.order = order; await savePlan(env, plan); return { ok: true };
}
/** Розставляє незаплановані й заплановані неопубліковані пости по одному на кожні N днів від заданого часу, у поточному порядку. */
export async function spread(env, startMs, everyDays, man, format = null) {
  startMs = Number(startMs); everyDays = Math.max(1 / 24, Math.min(14, Number(everyDays) || 1));   // крок у днях, може бути дробовим (0,25 = кожні 6 год)
  if (!Number.isFinite(startMs) || startMs < Date.now() - 36e5) return { ok: false, error: 'Оберіть початок у майбутньому' };
  const st = await pubState(env), plan = await getPlan(env), hasFb = !!(await getFbPage(env)); let k = 0;
  for (const p of effective(man, plan)) if (!isComplete(st, p, hasFb) && (!format || p.format === format)) { (plan.posts[p.id] = plan.posts[p.id] || {}).at = Math.round((startMs + k * everyDays * DAY) / 6e4) * 6e4; k++; }
  await savePlan(env, plan); return { ok: true, n: k };
}
const saveState = (env, st) => setSetting(env, 'ig_pub', JSON.stringify({ done: st.done, fb: st.fb, err: st.err }));

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
  else if (post.type === 'STORY') creation = (await call(fetchImpl, 'POST', `${base}/${id}/media`, { media_type: 'STORIES', image_url: url(post.files[0]), access_token: token })).id;
  else if (post.type === 'STORY_VIDEO') creation = (await call(fetchImpl, 'POST', `${base}/${id}/media`, { media_type: 'STORIES', video_url: url(post.files[0]), access_token: token })).id;
  else if (post.type === 'CAROUSEL') {
    const kids = []; for (const f of post.files) kids.push((await call(fetchImpl, 'POST', `${base}/${id}/media`, { image_url: url(f), is_carousel_item: 'true', access_token: token })).id);
    for (const k of kids) await waitReady(fetchImpl, base, k, token, { tries: 20, delay });
    creation = (await call(fetchImpl, 'POST', `${base}/${id}/media`, { media_type: 'CAROUSEL', children: kids.join(','), caption: post.caption, access_token: token })).id;
  } else throw new Error('Невідомий тип поста');
  if (!creation) throw new Error('Instagram не повернув ID контейнера');
  await waitReady(fetchImpl, base, creation, token, { tries: post.type === 'REELS' || post.type === 'STORY_VIDEO' ? 60 : 20, ...opts });
  const pub = await call(fetchImpl, 'POST', `${base}/${id}/media_publish`, { creation_id: creation, access_token: token });
  let link = ''; try { link = (await call(fetchImpl, 'GET', `${base}/${pub.id}`, { fields: 'permalink', access_token: token })).permalink || ''; } catch {}
  return { media_id: pub.id, link };
}

/** Публікація на сторінку Facebook (токен системного користувача → токен сторінки). Повертає { id, link }. */
export async function publishFb(env, post, { fetchImpl = fetch, site = SITE } = {}) {
  const token = await getToken(env); if (!token) throw new Error('Токен не додано');
  const page = await getFbPage(env); if (!page) throw new Error('Не задано сторінку Facebook');
  let pt = token; try { const j = await call(fetchImpl, 'GET', `${FB}/${page.id}`, { fields: 'access_token', access_token: token }); if (j.access_token) pt = j.access_token; } catch {}
  const url = f => `${site}/social/${f}`, text = String(post.caption || '').replace(/^.*(?:в шапці профілю|link in bio).*$/gim, FB_LINE);   // будь-який рядок «…посилання в шапці профілю · …link in bio» → адреса сайту
  let j, noLink = false;
  if (post.type === 'STORY') {   // фото-сторіс: спершу неопубліковане фото, потім сторіс із нього
    const ph = await call(fetchImpl, 'POST', `${FB}/${page.id}/photos`, { url: url(post.files[0]), published: 'false', access_token: pt });
    j = await call(fetchImpl, 'POST', `${FB}/${page.id}/photo_stories`, { photo_id: ph.id, access_token: pt }); noLink = true;
  } else if (post.type === 'STORY_VIDEO') {   // відео-сторіс у три кроки: старт → завантаження за посиланням на файл → завершення
    const st = await call(fetchImpl, 'POST', `${FB}/${page.id}/video_stories`, { upload_phase: 'start', access_token: pt });
    if (!st.video_id || !st.upload_url) throw new Error('Facebook не відкрив завантаження відео-сторіс');
    const up = await fetchImpl(st.upload_url, { method: 'POST', headers: { Authorization: 'OAuth ' + pt, file_url: url(post.files[0]) }, signal: AbortSignal.timeout(60000) });
    const uj = await up.json().catch(() => ({})); if (!up.ok || uj.success === false) throw new Error(String((uj.debug_info && uj.debug_info.message) || uj.message || 'завантаження відео-сторіс: HTTP ' + up.status).slice(0, 200));
    j = await call(fetchImpl, 'POST', `${FB}/${page.id}/video_stories`, { upload_phase: 'finish', video_id: st.video_id, access_token: pt }); j.id = j.id || st.video_id; noLink = true;
  } else if (post.type === 'IMAGE') j = await call(fetchImpl, 'POST', `${FB}/${page.id}/photos`, { url: url(post.files[0]), caption: text, access_token: pt });
  else if (post.type === 'REELS') j = await call(fetchImpl, 'POST', `${FB}/${page.id}/videos`, { file_url: url(post.files[0]), description: text, access_token: pt });
  else {
    const ids = []; for (const f of post.files) ids.push((await call(fetchImpl, 'POST', `${FB}/${page.id}/photos`, { url: url(f), published: 'false', access_token: pt })).id);
    j = await call(fetchImpl, 'POST', `${FB}/${page.id}/feed`, { message: text, access_token: pt, ...Object.fromEntries(ids.map((id, i) => [`attached_media[${i}]`, JSON.stringify({ media_fbid: id })])) });
  }
  const id = j.post_id || j.id; if (!id) throw new Error('Facebook не повернув ID публікації');
  return { id, link: noLink ? '' : `https://www.facebook.com/${id}` };
}

/** Публікує наступний пост за чергою (або конкретний id) на всі ввімкнені майданчики, що ще не отримали його. */
export async function publishNext(env, { only = null, fetchImpl = fetch, site = SITE, now = Date.now(), delay = 3000 } = {}) {
  const st = await pubState(env); let man;
  try { man = await loadManifest(fetchImpl, site); } catch (e) { return { ok: false, error: 'Не вдалося прочитати список постів: ' + e.message }; }
  const fbp = await getFbPage(env), hasFb = !!fbp, eff = effective(man, await getPlan(env)), post = only ? eff.find(p => p.id === only) : eff.find(p => !isComplete(st, p, hasFb));
  if (!post) return { ok: false, error: only ? 'Немає такого поста' : 'Усі пости вже опубліковано' };
  if (isComplete(st, post, hasFb)) return { ok: false, error: 'Цей пост уже опубліковано' };
  const errors = [], link = {};
  if (post.ig !== false && !st.done[post.id]) { try { const r = await publishPost(env, post, { fetchImpl, site, delay }); st.done[post.id] = { at: now, ...r }; link.ig = r.link; await saveState(env, st); await setSetting(env, 'ig_cache', ''); } catch (e) { errors.push('Instagram: ' + String(e.message || e).slice(0, 200)); } }
  if (hasFb && post.fb !== false && !st.fb[post.id]) { try { const r = await publishFb(env, post, { fetchImpl, site }); st.fb[post.id] = { at: now, ...r }; link.fb = r.link; await saveState(env, st); } catch (e) { errors.push('Facebook: ' + String(e.message || e).slice(0, 200)); } }
  st.err = errors.length ? { at: now, id: post.id, error: errors.join(' · ').slice(0, 400) } : null; await saveState(env, st);
  return errors.length ? { ok: false, id: post.id, error: st.err.error } : { ok: true, id: post.id, link: link.ig || link.fb };
}
/** Слоти за UTC: стрічка о 16:00 (18:00 за Києвом узимку), сторіс о 08:00 і 18:00 (10:00 і 20:00). */
export const SLOTS = { post: [[16, 0]], story: [[8, 0], [18, 0]] };
/** Призначає час усім неопублікованим публікаціям без дати: стрічка раз на день, сторіс двічі на день, з найближчого вільного слота (не раніше ніж за 2 год). Уже призначені не чіпає. */
export async function fillQueue(env, { now = Date.now(), fetchImpl = fetch, site = SITE, man = null, lead = 2 * 36e5 } = {}) {
  man = man || await loadManifest(fetchImpl, site);
  const st = await pubState(env), plan = await getPlan(env), hasFb = !!(await getFbPage(env)), eff = effective(man, plan), out = { post: 0, story: 0, first: null, last: null };
  for (const fmt of ['post', 'story']) {
    const taken = eff.filter(p => p.format === fmt && p.at).map(p => p.at), todo = eff.filter(p => p.format === fmt && !p.at && !isComplete(st, p, hasFb));
    let day = Math.floor((now + lead) / DAY), guard = 0;
    for (const p of todo) {
      let slot = null;
      while (slot == null && guard++ < 800) { for (const [h, m] of SLOTS[fmt]) { const t = day * DAY + (h * 60 + m) * 6e4; if (t >= now + lead && !taken.some(x => Math.abs(x - t) < 30 * 6e4)) { slot = t; break; } } if (slot == null) day++; }
      if (slot == null) break;
      (plan.posts[p.id] = plan.posts[p.id] || {}).at = slot; taken.push(slot); out[fmt]++; out.first = out.first == null ? slot : Math.min(out.first, slot); out.last = Math.max(out.last || 0, slot);
    }
  }
  if (out.post + out.story) await savePlan(env, plan);
  return out;
}
/** Автопублікація за розкладом: якщо ввімкнена, публікуємо найраніший пост, час якого настав (раз на запуск). Після помилки пауза 6 год. */
export async function runAutoPublish(env, { now = Date.now(), ...rest } = {}) {
  const st = await pubState(env); if (!st.auto) return { skipped: 'off' };
  if (st.err && st.err.at && now - st.err.at < 6 * 36e5) return { skipped: 'error_cooldown' };
  let man; try { man = await loadManifest(rest.fetchImpl || fetch, rest.site || SITE); } catch { return { skipped: 'manifest' }; }
  const hasFb = !!(await getFbPage(env)), due = effective(man, await getPlan(env)).filter(p => !isComplete(st, p, hasFb) && p.at && p.at <= now).sort((a, b) => a.at - b.at)[0];
  if (!due) return { skipped: 'none_due' };
  return publishNext(env, { now, only: due.id, ...rest });
}
export async function publishStatus(env, fetchImpl = fetch, site = SITE) {
  const st = await pubState(env), fbp = await getFbPage(env); let man = []; try { man = await loadManifest(fetchImpl, site); } catch {}
  return { auto: st.auto, err: st.err, now: Date.now(), fbPage: fbp, posts: effective(man, await getPlan(env)).map(p => ({ id: p.id, type: p.type, format: p.format, title: p.title || null, scene: p.scene || null, files: p.files, cover: p.cover || null, caption: p.caption, defaultCaption: p.defaultCaption, edited: p.caption !== p.defaultCaption, at: p.at, ig: p.ig, fb: p.fb, done: st.done[p.id] || null, fbDone: st.fb[p.id] || null, complete: isComplete(st, p, !!fbp) })) };
}
/** Зберігає сторінку Facebook: перевіряє токеном, що вона доступна, і запам'ятовує назву. */
export async function saveFbPage(env, id, { fetchImpl = fetch } = {}) {
  id = String(id || '').trim(); if (!id) { await setSetting(env, 'fb_page', ''); return { ok: true, page: null }; }
  if (!/^\d{5,25}$/.test(id)) return { ok: false, error: 'ID сторінки: лише цифри' };
  const token = await getToken(env); if (!token) return { ok: false, error: 'Спершу підключіть токен' };
  try { const j = await call(fetchImpl, 'GET', `${FB}/${id}`, { fields: 'name', access_token: token }); if (!j.name) return { ok: false, error: 'Сторінку не знайдено' }; await setSetting(env, 'fb_page', JSON.stringify({ id, name: j.name })); return { ok: true, page: { id, name: j.name } }; }
  catch (e) { return { ok: false, error: 'Facebook не пустив до сторінки: ' + String(e.message).slice(0, 160) }; }
}
