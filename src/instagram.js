// Instagram: стрічка останніх постів для головної (Instagram API with Instagram Login), токен зберігається в settings і оновлюється автоматично.
// Дані постів кешуються на сервері на годину; без токена стрічка просто не показується.
export const IG_HANDLE = 'reeadvent';
export const IG_URL = `https://www.instagram.com/${IG_HANDLE}/`;
const GRAPH = 'https://graph.instagram.com';           // токени «Instagram Login» (термін дії 60 днів, продовжуються)
const FB = 'https://graph.facebook.com/v23.0';         // токени системного користувача (Unified login): без терміну дії, потрібен ID акаунта Instagram
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
  const fbId = (await getSetting(env, 'ig_mode')) === 'fb' ? await getSetting(env, 'ig_id') : null;
  try {
    const r = await fetchImpl(`${fbId ? `${FB}/${fbId}` : `${GRAPH}/me`}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=12&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('ig ' + r.status);
    const posts = mapPosts(await r.json());
    await setSetting(env, 'ig_cache', JSON.stringify({ at: now, posts }));
    return posts;
  } catch { return cache ? cache.posts : []; }
}

/** Перевіряє токен (запит профілю) і зберігає його; повертає { ok, username } або { ok: false, error }. */
export async function saveToken(env, token, { igId = '', fetchImpl = fetch, now = Date.now() } = {}) {
  token = String(token || '').trim(); igId = String(igId || '').trim();
  if (token.length < 30 || token.length > 800 || /\s/.test(token)) return { ok: false, error: 'bad_token' };
  if (igId && !/^\d{5,25}$/.test(igId)) return { ok: false, error: 'bad_id' };
  try {
    // з ID акаунта: токен системного користувача (graph.facebook.com), без нього: токен Instagram Login (graph.instagram.com)
    const r = await fetchImpl(`${igId ? `${FB}/${igId}` : `${GRAPH}/me`}?fields=username&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(8000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.username) return { ok: false, error: 'token_rejected' };
    await setSetting(env, 'ig_token', token); await setSetting(env, 'ig_mode', igId ? 'fb' : 'ig'); await setSetting(env, 'ig_id', igId);
    await setSetting(env, 'ig_meta', JSON.stringify({ username: j.username, saved_at: now, refreshed_at: now, expires_at: igId ? null : now + 60 * DAY, never: !!igId }));
    await setSetting(env, 'ig_cache', '');
    return { ok: true, username: j.username };
  } catch { return { ok: false, error: 'ig_unreachable' }; }
}

export async function disconnect(env) { for (const k of ['ig_token', 'ig_meta', 'ig_cache', 'ig_mode', 'ig_id']) await setSetting(env, k, ''); }

export async function igStatus(env, now = Date.now()) {
  const meta = parse(await getSetting(env, 'ig_meta')), token = await getToken(env), embeds = await getEmbeds(env);
  return { embeds: embeds.length, embedsText: embedsText(embeds), connected: !!token, viaSecret: !(await getSetting(env, 'ig_token')) && !!env.INSTAGRAM_TOKEN, username: meta ? meta.username : null, expiresAt: meta ? meta.expires_at : null, neverExpires: !!(meta && meta.never), daysLeft: meta && meta.expires_at ? Math.max(0, Math.floor((meta.expires_at - now) / DAY)) : null };
}

/** Раз на 7 днів продовжує довгоживучий токен (діє 60 днів). Викликається щогодини з cron, але працює лише коли настав час. */
export async function refreshToken(env, { fetchImpl = fetch, now = Date.now() } = {}) {
  const token = await getSetting(env, 'ig_token'), meta = parse(await getSetting(env, 'ig_meta'));
  if (!token || !meta || meta.never || (await getSetting(env, 'ig_mode')) === 'fb' || now - meta.refreshed_at < 7 * DAY) return { refreshed: false };
  try {
    const r = await fetchImpl(`${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(8000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) return { refreshed: false, error: 'rejected' };
    await setSetting(env, 'ig_token', j.access_token);
    await setSetting(env, 'ig_meta', JSON.stringify({ ...meta, refreshed_at: now, expires_at: now + (Number(j.expires_in) || 60 * 86400) * 1000 }));
    return { refreshed: true };
  } catch { return { refreshed: false, error: 'unreachable' }; }
}

// ---------- Вбудовані пости (без API): адмін вставляє посилання на пости, на сайті показуються офіційні embed-блоки Instagram ----------
const EMBED_RE = /^https:\/\/(?:www\.)?instagram\.com\/(p|reel|tv)\/([A-Za-z0-9_-]{5,20})\/?(?:\?.*)?$/;
/** Розбирає текст (посилання по одному в рядку) у список { t, c }: тип і короткий код поста; до 6 унікальних. */
export function parseEmbeds(text) {
  const out = [], seen = new Set();
  for (const line of String(text || '').split(/[\s,]+/)) { const m = line.trim().match(EMBED_RE); if (m && !seen.has(m[2])) { seen.add(m[2]); out.push({ t: m[1], c: m[2] }); } if (out.length >= 6) break; }
  return out;
}
export async function getEmbeds(env) { return parse(await getSetting(env, 'ig_embeds')) || []; }
export async function saveEmbeds(env, text) { const list = parseEmbeds(text); await setSetting(env, 'ig_embeds', JSON.stringify(list)); return list; }
export const embedsText = list => (list || []).map(e => `https://www.instagram.com/${e.t}/${e.c}/`).join('\n');
