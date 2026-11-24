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

// Тип місця має відповідати активності: музей — лише музеї, ліс чи озеро — природа, а не площа чи кав’ярня.
// [регулярний вираз на запит/назву активності, дозволені типи Google Places, тип для includedType]
const PLACE_RULES = [
  [/науков.*музей|експериментаріум/, ['museum', 'science_museum'], 'museum'], [/галере/, ['art_gallery', 'museum', 'art_museum'], 'art_gallery'], [/музей|скансен/, ['museum', 'art_museum', 'history_museum', 'science_museum'], 'museum'],
  [/ресторан у лісі|заміськ.*ресторан/, ['restaurant'], 'restaurant'],
  [/ліс|озер|водоспад|скелі|поляна|національн.*парк|природ/, ['park', 'national_park', 'hiking_area', 'state_park', 'nature_preserve', 'campground', 'lake', 'woods'], null],
  [/зоопарк/, ['zoo'], 'zoo'], [/ботаніч|оранжере/, ['botanical_garden', 'park', 'garden'], 'botanical_garden'], [/батут/, ['amusement_center', 'sports_activity_location', 'gym', 'amusement_park'], null],
  [/парк/, ['park', 'national_park', 'garden', 'botanical_garden', 'city_park'], 'park'], [/оглядов|пагорб/, ['observation_deck', 'tourist_attraction', 'park', 'hiking_area'], null],
  [/кінотеатр/, ['movie_theater'], 'movie_theater'], [/театр|філармон/, ['performing_arts_theater', 'concert_hall', 'opera_house', 'philharmonic_hall'], 'performing_arts_theater'],
  [/боулінг/, ['bowling_alley'], 'bowling_alley'], [/басейн/, ['swimming_pool', 'sports_complex', 'fitness_center', 'water_park'], null], [/сауна|масаж|спа/, ['spa', 'sauna', 'massage', 'wellness_center', 'public_bath'], 'spa'],
  [/каток|ковзанк/, ['ice_skating_rink', 'sports_complex'], null], [/скеледром|скелелаз/, ['climbing_gym', 'sports_activity_location', 'gym'], null], [/йога|пілатес/, ['yoga_studio', 'gym', 'fitness_center'], null],
  [/храм|собор|церкв/, ['church', 'place_of_worship', 'cathedral'], 'church'], [/замок|фортец|палац|садиб/, ['castle', 'historical_landmark', 'historical_place', 'tourist_attraction', 'museum'], null],
  [/кав.ярн|бранч|сніданок/, ['cafe', 'coffee_shop', 'breakfast_restaurant', 'brunch_restaurant', 'bakery'], 'cafe'], [/ресторан|піцер|кухн|бургер|вечеря/, ['restaurant'], 'restaurant'],
  [/бар|коктейл|караоке|джаз/, ['bar', 'night_club', 'karaoke', 'pub', 'wine_bar', 'cocktail_bar'], null], [/книгарн/, ['book_store'], 'book_store'], [/квіт/, ['florist'], 'florist'], [/ринок|ярмар/, ['market', 'farmers_market'], null]
];
const BAD_FOR_NATURE = /площ|майдан|сквер|ринок|square|plaza|market/i;
/** Правило для активності (за запитом і назвою), або null — тоді тип не обмежуємо. */
export function placeRule(text) { const s = String(text || '').toLowerCase(); for (const [re, types, inc] of PLACE_RULES) if (re.test(s)) return { types, inc, nature: types.includes('national_park') && !types.includes('city_park') && re.source.startsWith('ліс') }; return null; }
/** Лишає лише місця дозволених типів (за полем types від Google); для природи прибирає площі, сквери й ринки за назвою. */
export function byRule(places, rule) {
  if (!rule) return places || [];
  return (places || []).filter(p => { const t = [p.primaryType, ...(p.types || [])].filter(Boolean); return t.some(x => rule.types.includes(x)) && !(rule.nature && (BAD_FOR_NATURE.test((p.displayName && p.displayName.text) || '') || t.some(x => /plaza|market|shopping/.test(x)))); });
}

/** «Схоже, нещодавно відкрились»: високі оцінки (≥ 4.5), але ще мало відгуків (5–60), діючі; не ті, що вже в топі. Google не дає дати відкриття, тож це обережна ознака. */
export function pickFresh(places, exclude = [], n = 2) {
  const ex = new Set(exclude.map(p => p.url));
  return (places || []).filter(p => p && p.displayName && p.displayName.text && p.rating >= 4.5 && p.userRatingCount >= 5 && p.userRatingCount <= 60 && (!p.businessStatus || p.businessStatus === 'OPERATIONAL'))
    .map(p => ({ name: String(p.displayName.text).slice(0, 80), rating: Math.round(p.rating * 10) / 10, count: p.userRatingCount, address: p.shortFormattedAddress ? String(p.shortFormattedAddress).slice(0, 80) : '', url: p.googleMapsUri || '', fresh: true }))
    .filter(p => /^https:\/\/(www\.)?(google\.[a-z.]+|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl)\//i.test(p.url) && !ex.has(p.url))
    .sort((a, b) => b.rating - a.rating || a.count - b.count).slice(0, n);
}
/**
 * Повертає [{ name, rating, count, address, url }] або [] (немає ключа, ліміт, помилка, мало даних).
 * query — готовий пошуковий запит із містом («cafe Lyon»).
 */
export async function recommend(env, { query, lang, country, memberId, day, rule = null, fetchImpl = fetch }) {
  if (!env.GOOGLE_PLACES_KEY || !query) return [];
  if (!(await rateLimit(env, `places:${memberId}:${day}`, 4, 86400))) return [];           // не більше 4 запитів на учасника за вікно
  const cap = (await getSettings(env)).places_monthly_cap;
  if (!(cap > 0) || !(await reserve(env, cap))) return [];                                   // місячний ліміт витрат
  try {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 4000);
    const res = await fetchImpl('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': env.GOOGLE_PLACES_KEY, 'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount,places.googleMapsUri,places.shortFormattedAddress,places.businessStatus,places.types,places.primaryType' },
      body: JSON.stringify({ textQuery: query, languageCode: lang === 'en' ? 'en' : 'uk', ...(country && /^[A-Z]{2}$/.test(country) ? { regionCode: country } : {}), maxResultCount: 20, minRating: 4, ...(rule && rule.inc ? { includedType: rule.inc } : {}) })
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const all = byRule((await res.json()).places || [], rule), fresh = pickFresh(all), fu = new Set(fresh.map(p => p.url));
    return [...pickTop(all.filter(p => !fu.has(p.googleMapsUri))), ...fresh];   // топ за рейтингом + «нещодавно відкрились»
  } catch { return []; }
}
