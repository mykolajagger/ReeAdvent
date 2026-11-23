// Ціни: для України в гривнях, для решти країн єдина ціна в євро. Обидві задає власник в адмінці (Налаштування → Ціна календаря).
// Суми в коді завжди в мінімальних одиницях валюти замовлення: копійки для гривні, центи для євро.
import { getSettings } from './settings.js';
import { getFx } from './currency.js';

export const isUA = cc => !cc || String(cc).toUpperCase() === 'UA';
export const currencyFor = cc => (isUA(cc) ? 'UAH' : 'EUR');
export const CCY_NUM = { UAH: 980, EUR: 978 };

/** Гривень за 1 євро: курс із бази (Monobank, ExchangeRate-API), інакше запасний курс долара з адмінки × 1,08. */
export function uahPerEur(fx, usdRate) {
  const eur = fx && fx.rates && Number(fx.rates.EUR);
  if (eur > 0) return 1 / eur;
  const usd = fx && fx.rates && Number(fx.rates.USD);
  return (usd > 0 ? 1 / usd : (Number(usdRate) || 41)) * 1.08;
}

/** Поточні ціни: { uah, eur, eurSet, uahPerEur }. Поки ціну в євро не задано, вона рахується з гривневої за курсом і округлюється вгору до цілого євро. */
export async function getPrices(env) {
  const st = await getSettings(env), fx = await getFx(env), rate = Math.round(uahPerEur(fx, st.usd_rate) * 10000) / 10000;
  const eurSet = Number(st.price_eur) > 0;
  return { uah: st.price_uah, eur: eurSet ? st.price_eur : Math.max(1, Math.ceil(st.price_uah / rate)), eurSet, uahPerEur: rate };
}

/** Прайс для країни: { currency, list (мінімальні одиниці), uahRate (гривень за 1 одиницю валюти), fixedScale (як перерахувати фіксовану знижку в гривнях) }. */
export async function listFor(env, country) {
  const p = await getPrices(env);
  if (currencyFor(country) === 'EUR') return { currency: 'EUR', list: Math.round(p.eur * 100), uahRate: p.uahPerEur, fixedScale: 1 / p.uahPerEur, prices: p };
  return { currency: 'UAH', list: Math.round(p.uah * 100), uahRate: 1, fixedScale: 1, prices: p };
}

/** Сума замовлення в гривнях (копійках) для звітів: за курсом на момент замовлення (для рахунку в гривнях за євро-ціною курс точний). */
export const toUah = (o, kop) => Math.round((Number(kop) || 0) * (o && o.currency === 'EUR' ? (Number(o.uah_rate) || 0) : 1));

/** Текст суми у валюті замовлення: «1 499 ₴» або «29 €» / «€29». */
export function moneyText(kop, currency = 'UAH', lang = 'uk') {
  const v = (Number(kop) || 0) / 100, frac = kop % 100 ? 2 : 0;
  if (currency === 'EUR') return lang === 'en' ? '€' + v.toLocaleString('en', { minimumFractionDigits: frac, maximumFractionDigits: 2 }) : v.toLocaleString('uk-UA', { minimumFractionDigits: frac, maximumFractionDigits: 2 }) + ' €';
  return v.toLocaleString('uk-UA', { minimumFractionDigits: frac, maximumFractionDigits: 2 }) + ' ₴';
}
