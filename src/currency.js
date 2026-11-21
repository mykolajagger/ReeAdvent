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

/** Оновлює курси з відкритого API (https://www.exchangerate-api.com: потрібне посилання-атрибуція на сайті). Повертає { ok, updated?, count? }. */
export async function refreshFx(env, { force = false, fetchImpl = fetch } = {}) {
  const cur = await getFx(env);
  if (!force && cur && Date.now() - cur.updated < STALE_MS) return { ok: true, skipped: true, updated: cur.updated };
  try {
    const res = await fetchImpl('https://open.er-api.com/v6/latest/UAH', { headers: { accept: 'application/json' } });
    if (!res.ok) return { ok: false, error: 'http_' + res.status };
    const j = await res.json();
    if (j.result !== 'success' || !j.rates || !(j.rates.USD > 0)) return { ok: false, error: 'bad_payload' };
    const wanted = new Set([...Object.values(COUNTRY_CCY).filter(Boolean), 'USD', 'EUR']), rates = {};
    for (const [k, v] of Object.entries(j.rates)) if (wanted.has(k) && v > 0 && isFinite(v)) rates[k] = v;
    const value = JSON.stringify({ updated: Date.now(), rates });
    await env.DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(KEY, value, Date.now()).run();
    return { ok: true, updated: Date.now(), count: Object.keys(rates).length };
  } catch (e) { return { ok: false, error: 'network' }; }
}
