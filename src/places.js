// Рекомендації закладів за публічними рейтингами (Google Places API (New), Text Search) у момент відкриття вікна.
// Умови Google: дані Places НЕ зберігаються у нашій базі й не кешуються на сервері; ми лише показуємо їх клієнту з атрибуцією «Google Maps».
// Вмикається, лише якщо задано секрет GOOGLE_PLACES_KEY. Місячний ліміт запитів (places_monthly_cap) захищає від непередбачених витрат.
import { getSettings } from './settings.js';
import { rateLimit } from './promo.js';

const monthKey = (d = new Date()) => `places_used_${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

export async function placesUsage(env) {
  const r = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(monthKey()).first();
  return r ? Number(r.value) || 0 : 0;
}
/** Атомарно резервує один запит у місячному ліміті; false — ліміт вичерпано. */
async function reserve(env, cap) {
  const k = monthKey();
  await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, '0', ?) ON CONFLICT(key) DO NOTHING").bind(k, Date.now()).run();
  const r = await env.DB.prepare("UPDATE settings SET value = CAST(value AS INTEGER) + 1, updated_at = ? WHERE key = ? AND CAST(value AS INTEGER) < ?").bind(Date.now(), k, cap).run();
  return !!r.meta?.changes;
}

/** Відбір і ранжування: рейтинг ≥ 4.2, ≥ 20 відгуків, лише діючі; топ-3 за rating × log(відгуків). */
export function pickTop(places, n = 3) {
  return (places || []).filter(p => p && p.displayName && p.displayName.text && p.rating >= 4.2 && p.userRatingCount >= 20 && (!p.businessStatus || p.businessStatus === 'OPERATIONAL'))
    .map(p => ({ name: String(p.displayName.text).slice(0, 80), rating: Math.round(p.rating * 10) / 10, count: p.userRatingCount, address: p.shortFormattedAddress ? String(p.shortFormattedAddress).slice(0, 80) : '', url: p.googleMapsUri || '', score: p.rating * Math.log10(1 + p.userRatingCount) }))
    .filter(p => /^https:\/\/(www\.)?(google\.[a-z.]+|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl)\//i.test(p.url))
    .sort((a, b) => b.score - a.score).slice(0, n).map(({ score, ...p }) => p);
}

/**
 * Повертає [{ name, rating, count, address, url }] або [] (немає ключа, ліміт, помилка, мало даних).
 * query — готовий пошуковий запит із містом («cafe Lyon»).
 */
export async function recommend(env, { query, lang, country, memberId, day, fetchImpl = fetch }) {
  if (!env.GOOGLE_PLACES_KEY || !query) return [];
  if (!(await rateLimit(env, `places:${memberId}:${day}`, 4, 86400))) return [];           // не більше 4 запитів на учасника за вікно
  const cap = (await getSettings(env)).places_monthly_cap;
  if (!(cap > 0) || !(await reserve(env, cap))) return [];                                   // місячний ліміт витрат
  try {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 4000);
    const res = await fetchImpl('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': env.GOOGLE_PLACES_KEY, 'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount,places.googleMapsUri,places.shortFormattedAddress,places.businessStatus' },
      body: JSON.stringify({ textQuery: query, languageCode: lang === 'en' ? 'en' : 'uk', ...(country && /^[A-Z]{2}$/.test(country) ? { regionCode: country } : {}), maxResultCount: 10, minRating: 4 })
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    return pickTop((await res.json()).places);
  } catch { return []; }
}
