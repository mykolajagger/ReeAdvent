// Instagram: стрічка останніх постів для головної (Instagram API with Instagram Login), токен зберігається в settings і оновлюється автоматично.
// Дані постів кешуються на сервері на годину; без токена стрічка просто не показується.
export const IG_HANDLE = 'reeadvent';
export const IG_URL = `https://www.instagram.com/${IG_HANDLE}/`;
const GRAPH = 'https://graph.instagram.com';
const HOUR = 3600e3, DAY = 864e5;

const getSetting = async (env, key) => { const r = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first(); return r ? r.value : null; };
const setSetting = (env, key, value) => env.DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(key, value, Date.now()).run();
const parse = s => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

export async function getToken(env) { return (await getSetting(env, 'ig_token')) || env.INSTAGRAM_TOKEN || null; }

/** Пости для сітки на сайті: картинки (для відео — обкладинка), до 6 штук. */
export function mapPosts(data) {
  return ((data && data.data) || []).map(p => ({ id: String(p.id), img: p.media_type === 'VIDEO' ? p.thumbnail_url : p.media_url, link: p.permalink, alt: String(p.caption || '').replace(/\s+/g, ' ').slice(0, 120) }))
    .filter(p => p.img && /^https:\/\//.test(p.img) && /^https:\/\/www\.instagram\.com\//.test(p.link || '')).slice(0, 6);
}

/** Стрічка з кешем на годину; при помилці віддаємо старий кеш, а без нього порожній список. */
export async function instagramFeed(env, { fetchImpl = fetch, now = Date.now() } = {}) {
  const cache = parse(await getSetting(env, 'ig_cache'));
  if (cache && now - cache.at < HOUR) return cache.posts;
  const token = await getToken(env); if (!token) return [];
  try {
    const r = await fetchImpl(`${GRAPH}/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=12&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('ig ' + r.status);
    const posts = mapPosts(await r.json());
    await setSetting(env, 'ig_cache', JSON.stringify({ at: now, posts }));
    return posts;
  } catch { return cache ? cache.posts : []; }
}

/** Перевіряє токен (запит профілю) і зберігає його; повертає { ok, username } або { ok: false, error }. */
export async function saveToken(env, token, { fetchImpl = fetch, now = Date.now() } = {}) {
  token = String(token || '').trim();
  if (token.length < 30 || token.length > 600 || /\s/.test(token)) return { ok: false, error: 'bad_token' };
  try {
    const r = await fetchImpl(`${GRAPH}/me?fields=username&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(8000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.username) return { ok: false, error: 'token_rejected' };
    await setSetting(env, 'ig_token', token);
    await setSetting(env, 'ig_meta', JSON.stringify({ username: j.username, saved_at: now, refreshed_at: now, expires_at: now + 60 * DAY }));
    await setSetting(env, 'ig_cache', '');
    return { ok: true, username: j.username };
  } catch { return { ok: false, error: 'ig_unreachable' }; }
}

export async function disconnect(env) { for (const k of ['ig_token', 'ig_meta', 'ig_cache']) await setSetting(env, k, ''); }

export async function igStatus(env, now = Date.now()) {
  const meta = parse(await getSetting(env, 'ig_meta')), token = await getToken(env);
  return { connected: !!token, viaSecret: !(await getSetting(env, 'ig_token')) && !!env.INSTAGRAM_TOKEN, username: meta ? meta.username : null, expiresAt: meta ? meta.expires_at : null, daysLeft: meta ? Math.max(0, Math.floor((meta.expires_at - now) / DAY)) : null };
}

/** Раз на 7 днів продовжує довгоживучий токен (діє 60 днів). Викликається щогодини з cron, але працює лише коли настав час. */
export async function refreshToken(env, { fetchImpl = fetch, now = Date.now() } = {}) {
  const token = await getSetting(env, 'ig_token'), meta = parse(await getSetting(env, 'ig_meta'));
  if (!token || !meta || now - meta.refreshed_at < 7 * DAY) return { refreshed: false };
  try {
    const r = await fetchImpl(`${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(8000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) return { refreshed: false, error: 'rejected' };
    await setSetting(env, 'ig_token', j.access_token);
    await setSetting(env, 'ig_meta', JSON.stringify({ ...meta, refreshed_at: now, expires_at: now + (Number(j.expires_in) || 60 * 86400) * 1000 }));
    return { refreshed: true };
  } catch { return { refreshed: false, error: 'unreachable' }; }
}
