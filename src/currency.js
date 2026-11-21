// Валюта країни й курси для орієнтовного показу ціни. Списання завжди в гривнях; решта валют — лише довідково.
import { COUNTRY_CCY } from './geo_currency.js';

export const currencyOf = cc => (cc && COUNTRY_CCY[String(cc).toUpperCase()]) || 'USD';
const KEY = 'fx_rates', STALE_MS = 20 * 3600e3;

/** Збережені курси { updated, rates: { USD: 0.0241, EUR: ... } } (одиниць валюти за 1 UAH) або null. */
export async function getFx(env) {
  const r = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(KEY).first();
  if (!r) return null;
  try { const j = JSON.parse(r.value); return j && j.rates ? j : null; } catch { return null; }
}

/** Яку валюту й курс показати: країна → валюта; немає курсу — USD (за курсом із налаштувань адмінки). */
export function priceCurrency(fx, countryCode, usdRateUahPerUsd) {
  const want = currencyOf(countryCode);
  if (want === 'UAH') return { code: 'UAH', rate: 1 };
  const r = fx && fx.rates && Number(fx.rates[want]);
  if (r > 0) return { code: want, rate: r };
  const usd = fx && fx.rates && Number(fx.rates.USD);
  return { code: 'USD', rate: usd > 0 ? usd : 1 / (Number(usdRateUahPerUsd) || 41) };
}

// ISO 4217 числовий код -> літерний (достатньо для валют, які віддає Monobank)
const NUM2ALPHA = { 36: 'AUD', 124: 'CAD', 156: 'CNY', 203: 'CZK', 208: 'DKK', 348: 'HUF', 376: 'ILS', 392: 'JPY', 410: 'KRW', 484: 'MXN', 578: 'NOK', 702: 'SGD', 752: 'SEK', 756: 'CHF', 784: 'AED', 826: 'GBP', 840: 'USD', 949: 'TRY', 978: 'EUR', 985: 'PLN', 986: 'BRL', 356: 'INR', 946: 'RON', 975: 'BGN', 344: 'HKD', 764: 'THB', 710: 'ZAR', 554: 'NZD', 818: 'EGP', 972: 'TJS', 981: 'GEL', 498: 'MDL', 51: 'AMD', 944: 'AZN', 398: 'KZT', 860: 'UZS', 933: 'BYN', 643: 'RUB', 191: 'HRK', 352: 'ISK', 360: 'IDR', 458: 'MYR', 608: 'PHP', 704: 'VND', 586: 'PKR', 50: 'BDT', 504: 'MAD', 788: 'TND', 12: 'DZD', 566: 'NGN', 404: 'KES', 288: 'GHS', 682: 'SAR', 414: 'KWD', 634: 'QAR', 48: 'BHD', 512: 'OMR', 400: 'JOD' };

/** Курси Monobank (публічний API, без ключа; сервер кешує відповідь ~5 хв). Повертає { USD: <одиниць валюти за 1 UAH>, ... } або null. */
export async function fetchMonobankRates(fetchImpl = fetch) {
  try {
    const res = await fetchImpl('https://api.monobank.ua/bank/currency', { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const arr = await res.json();
    if (!Array.isArray(arr)) return null;
    const rates = {};
    for (const x of arr) {
      if (x.currencyCodeB !== 980) continue; // лише пари до гривні
      const code = NUM2ALPHA[x.currencyCodeA]; if (!code) continue;
      const uahPer = Number(x.rateCross) > 0 ? Number(x.rateCross) : (Number(x.rateBuy) > 0 && Number(x.rateSell) > 0 ? (Number(x.rateBuy) + Number(x.rateSell)) / 2 : 0);
      if (uahPer > 0 && isFinite(uahPer)) rates[code] = 1 / uahPer; // гривень за 1 одиницю -> одиниць за 1 гривню
    }
    return Object.keys(rates).length ? rates : null;
  } catch { return null; }
}

async function fetchErRates(fetchImpl) {
  try {
    const res = await fetchImpl('https://open.er-api.com/v6/latest/UAH', { headers: { accept: 'application/json' } });
    if (!res.ok) return { error: 'http_' + res.status };
    const j = await res.json();
    if (j.result !== 'success' || !j.rates || !(j.rates.USD > 0)) return { error: 'bad_payload' };
    return { rates: j.rates };
  } catch { return { error: 'network' }; }
}

/**
 * Оновлює курси: спочатку Monobank (пріоритет), для решти валют — ExchangeRate-API (https://www.exchangerate-api.com, потрібна атрибуція).
 * Якщо одне джерело недоступне, працює друге. Повертає { ok, updated?, count?, mono?, other? }.
 */
export async function refreshFx(env, { force = false, fetchImpl = fetch } = {}) {
  const cur = await getFx(env);
  if (!force && cur && Date.now() - cur.updated < STALE_MS) return { ok: true, skipped: true, updated: cur.updated };
  const [mono, er] = await Promise.all([fetchMonobankRates(fetchImpl), fetchErRates(fetchImpl)]);
  if (!mono && !er.rates) return { ok: false, error: er.error || 'no_sources' };
  const wanted = new Set([...Object.values(COUNTRY_CCY).filter(Boolean), 'USD', 'EUR']), rates = {};
  if (er.rates) for (const [k, v] of Object.entries(er.rates)) if (wanted.has(k) && v > 0 && isFinite(v)) rates[k] = v;
  let monoCount = 0;
  if (mono) for (const [k, v] of Object.entries(mono)) if (wanted.has(k)) { rates[k] = v; monoCount++; }
  const value = JSON.stringify({ updated: Date.now(), rates, sources: { mono: monoCount, other: Object.keys(rates).length - monoCount } });
  await env.DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(KEY, value, Date.now()).run();
  return { ok: true, updated: Date.now(), count: Object.keys(rates).length, mono: monoCount, other: Object.keys(rates).length - monoCount };
}
