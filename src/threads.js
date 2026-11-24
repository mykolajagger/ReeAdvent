// Публікація в Threads (Threads API, graph.threads.net): ті самі пости, що й в Instagram, з тими самими файлами з сайту.
// Сторіс у Threads немає, тож вони пропускаються. Текст до 500 символів: українська частина підпису без хештегів + адреса сайту.
// Токен (довгостроковий, 60 днів) зберігається в settings (th_token) і сам продовжується раз на тиждень (cron).
const TH = 'https://graph.threads.net/v1.0', DAY = 864e5, LIMIT = 500;
const getSetting = async (env, k) => { const r = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(k).first(); return r ? r.value : null; };
const setSetting = (env, k, v) => env.DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(k, v, Date.now()).run();
const parse = s => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
const sleepMs = ms => new Promise(r => setTimeout(r, ms));
export const THREADS_HANDLE = 'reeadvent', THREADS_URL = `https://www.threads.com/@${THREADS_HANDLE}`;

async function call(fetchImpl, method, url, params) {
  const u = new URL(url), body = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v !== undefined && v !== null) (method === 'GET' ? u.searchParams : body).set(k, String(v));
  const r = await fetchImpl(u.toString(), method === 'GET' ? { signal: AbortSignal.timeout(20000) } : { method, body, signal: AbortSignal.timeout(30000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(String((j.error && (j.error.error_user_msg || j.error.message)) || 'HTTP ' + r.status).slice(0, 240));
  return j;
}

export async function getThreadsToken(env) { return (await getSetting(env, 'th_token')) || env.THREADS_TOKEN || null; }
export async function threadsStatus(env, now = Date.now()) {
  const token = await getThreadsToken(env), meta = parse(await getSetting(env, 'th_meta')) || {};
  return { connected: !!token, username: meta.username || null, userId: meta.id || null, daysLeft: meta.expires_at ? Math.max(0, Math.floor((meta.expires_at - now) / DAY)) : null, lastError: parse(await getSetting(env, 'th_err')) };
}
/** Зберігає токен після перевірки (GET /me); за наявності THREADS_APP_SECRET короткий токен обмінюється на 60-денний. */
export async function saveThreadsToken(env, token, { fetchImpl = fetch, now = Date.now() } = {}) {
  token = String(token || '').trim(); if (token.length < 20) return { ok: false, error: 'Вставте токен Threads' };
  let me; try { me = await call(fetchImpl, 'GET', `${TH}/me`, { fields: 'id,username', access_token: token }); } catch (e) { return { ok: false, error: 'Threads не прийняв токен: ' + e.message }; }
  let expires = now + 60 * DAY;
  if (env.THREADS_APP_SECRET) { try { const x = await call(fetchImpl, 'GET', 'https://graph.threads.net/access_token', { grant_type: 'th_exchange_token', client_secret: env.THREADS_APP_SECRET, access_token: token }); if (x.access_token) { token = x.access_token; expires = now + (Number(x.expires_in) || 60 * 86400) * 1000; } } catch {} }
  await setSetting(env, 'th_token', token); await setSetting(env, 'th_meta', JSON.stringify({ id: me.id, username: me.username, saved_at: now, expires_at: expires })); await setSetting(env, 'th_err', '');
  return { ok: true, username: me.username };
}
export async function disconnectThreads(env) { for (const k of ['th_token', 'th_meta', 'th_err']) await setSetting(env, k, ''); }
/** Раз на 7 днів продовжує токен (діє 60 днів); викликається з cron щогодини, але працює лише коли настав час. */
export async function refreshThreadsToken(env, { fetchImpl = fetch, now = Date.now() } = {}) {
  const token = await getSetting(env, 'th_token'), meta = parse(await getSetting(env, 'th_meta')) || {};
  if (!token || (meta.saved_at && now - meta.saved_at < 7 * DAY)) return { skipped: true };
  const j = await call(fetchImpl, 'GET', 'https://graph.threads.net/refresh_access_token', { grant_type: 'th_refresh_token', access_token: token });
  if (!j.access_token) return { ok: false };
  await setSetting(env, 'th_token', j.access_token); await setSetting(env, 'th_meta', JSON.stringify({ ...meta, saved_at: now, expires_at: now + (Number(j.expires_in) || 60 * 86400) * 1000 }));
  return { ok: true };
}

/** Текст для Threads: без хештегів і рядка «посилання в шапці профілю», до 500 символів, наприкінці адреса сайту. */
export function threadsText(caption, site = 'https://reeadvent.fun') {
  const link = site.replace(/^https?:\/\//, '');
  let t = String(caption || '').replace(/\r/g, '').split('\n').filter(l => !/(в шапці профілю|link in bio)/i.test(l) && !/^\s*(#[^\s#]+\s*)+$/.test(l)).join('\n').replace(/#[^\s#]+/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const max = LIMIT - link.length - 2;
  if (t.length > max) {   // спершу лишаємо цілі абзаци (українська частина йде першою), інакше обрізаємо по слову
    const paras = t.split(/\n\n/); let out = ''; for (const p of paras) { const n = out ? out + '\n\n' + p : p; if (n.length > max) break; out = n; }
    t = out || t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
  }
  return (t ? t + '\n\n' : '') + link;
}

/** Публікує пост у Threads: IMAGE, CAROUSEL (до 20), REELS як відео. Повертає { id, link } або null для сторіс. */
export async function publishThreads(env, post, { fetchImpl = fetch, site = 'https://reeadvent.fun', wait = sleepMs } = {}) {
  if (post.type === 'STORY' || post.type === 'STORY_VIDEO') return null;
  const token = await getThreadsToken(env); if (!token) throw new Error('Threads не підключено');
  const meta = parse(await getSetting(env, 'th_meta')) || {}; let uid = meta.id;
  if (!uid) uid = (await call(fetchImpl, 'GET', `${TH}/me`, { fields: 'id', access_token: token })).id;
  const url = f => (String(f).startsWith('/') ? site + f : `${site}/social/${f}`), text = threadsText(post.caption, site);
  const ready = async (id, tries = 30) => { for (let i = 0; i < tries; i++) { const s = await call(fetchImpl, 'GET', `${TH}/${id}`, { fields: 'status,error_message', access_token: token }); if (s.status === 'FINISHED') return; if (s.status === 'ERROR' || s.status === 'EXPIRED') throw new Error('Threads не обробив файл: ' + (s.error_message || s.status)); await wait(i < 3 ? 2000 : 5000); } throw new Error('Threads довго обробляє файл, спробуйте пізніше'); };
  let container;
  if (post.type === 'CAROUSEL' && (post.files || []).length > 1) {
    const kids = []; for (const f of post.files.slice(0, 20)) { const c = await call(fetchImpl, 'POST', `${TH}/${uid}/threads`, { media_type: 'IMAGE', image_url: url(f), is_carousel_item: 'true', access_token: token }); kids.push(c.id); }
    for (const k of kids) await ready(k, 12);
    container = (await call(fetchImpl, 'POST', `${TH}/${uid}/threads`, { media_type: 'CAROUSEL', children: kids.join(','), text, access_token: token })).id;
  } else if (post.type === 'REELS') container = (await call(fetchImpl, 'POST', `${TH}/${uid}/threads`, { media_type: 'VIDEO', video_url: url(post.files[0]), text, access_token: token })).id;
  else container = (await call(fetchImpl, 'POST', `${TH}/${uid}/threads`, { media_type: 'IMAGE', image_url: url(post.files[0]), text, access_token: token })).id;
  await ready(container, post.type === 'REELS' ? 40 : 15);
  const pub = await call(fetchImpl, 'POST', `${TH}/${uid}/threads_publish`, { creation_id: container, access_token: token });
  let link = ''; try { link = (await call(fetchImpl, 'GET', `${TH}/${pub.id}`, { fields: 'permalink', access_token: token })).permalink || ''; } catch {}
  return { id: pub.id, link };
}
