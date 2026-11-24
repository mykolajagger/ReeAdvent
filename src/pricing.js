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
/** Діючі ціни з урахуванням акції: стандартна (перекреслена) і акційна; після «Ціна діє до» (кінець дня за Києвом) діє стандартна. */
export function salePrices(st, rate, now = Date.now()) {
  const eurSet = Number(st.price_eur) > 0, uahSale = Number(st.price_uah) || 0, eurSale = eurSet ? Number(st.price_eur) : Math.max(1, Math.ceil(uahSale / rate));
  const uahStd = Number(st.price_uah_std) || 0, eurStd = Number(st.price_eur_std) || (uahStd ? Math.max(1, Math.ceil(uahStd / rate)) : 0);
  const today = new Date(now + 2 * 36e5).toISOString().slice(0, 10), until = st.sale_until || '', inTime = !until || today <= until;
  const pick = (sale, std) => std > sale ? (inTime ? { price: sale, was: std } : { price: std, was: null }) : { price: sale, was: null };
  const u = pick(uahSale, uahStd), e = pick(eurSale, eurStd), active = !!(u.was || e.was);
  return { uah: u.price, eur: e.price, uahWas: u.was, eurWas: e.was, saleActive: active, saleUntil: active ? until || null : null, saleEnded: !!(until && !inTime && (uahStd > uahSale || eurStd > eurSale)),
    uahSale, eurSale, uahStd, eurStd, eurSet };
}
export async function getPrices(env) {
  const st = await getSettings(env), fx = await getFx(env), rate = Math.round(uahPerEur(fx, st.usd_rate) * 10000) / 10000;
  const now = env && env.NOW_OVERRIDE ? Date.parse(env.NOW_OVERRIDE) : Date.now();
  return { ...salePrices(st, rate, now), uahPerEur: rate };
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
