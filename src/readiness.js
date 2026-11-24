// Готовність до запуску реклами: що вже підключено, а що ще ні. Адмінка → «Запуск».
// Повертає лише так/ні й підказки: значення секретів і ключів сюди не потрапляють.
import { trackConfig } from './ads.js';
import { getSettings } from './settings.js';
import { igStatus } from './instagram.js';
import { pubState, getFbPage, getPlan, effective, loadManifest, isComplete } from './igpublish.js';
import { agentFlags } from './agent.js';
import { funnel } from './visits.js';

const DAY = 864e5;
const getSetting = async (env, k) => { const r = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(k).first(); return r ? r.value : null; };
const one = async (env, sql, ...a) => { try { return await env.DB.prepare(sql).bind(...a).first(); } catch { return null; } };

/** Ручні кроки в кабінетах, які сайт перевірити не може: власник відмічає їх сам. */
export const MANUAL = [
  ['meta_card', 'Meta', 'Рекламний акаунт Meta створено, картку додано', 'business.facebook.com → Рекламні акаунти → Налаштування оплати'],
  ['meta_domain', 'Meta', 'Домен reeadvent.fun верифіковано в Meta', 'Безпека бренду → Домени → DNS TXT у Cloudflare'],
  ['meta_aem', 'Meta', 'Пріоритет подій: Purchase, InitiateCheckout, ViewContent', 'Events Manager → Aggregated Event Measurement'],
  ['meta_test', 'Meta', 'Піксель перевірено: PageView видно в Test Events', 'Відкрити сайт → «Прийняти всі» → Events Manager → Test Events'],
  ['meta_ua', 'Meta', 'Кампанія ua_cold створена (посилання з мітками)', 'Продажі → Україна 22–45 → $12/день → 3 оголошення'],
  ['meta_eu', 'Meta', 'Кампанія eu_ua створена', 'PL, DE, CZ, SK, IE, NL, IT, ES, LT, мова українська → $10/день'],
  ['meta_rt', 'Meta', 'Ретаргетинг retarget (з 27.11)', 'Відвідувачі 14 днів + взаємодія з Instagram 30 днів, без покупців'],
  ['g_conv', 'Google', 'Конверсія «Покупка» в Google Ads створена, GA4 пов’язано', 'Цілі → Конверсії; Інструменти → Пов’язані акаунти'],
  ['g_search', 'Google', 'Пошукова кампанія search_ua створена', 'Максимум кліків, стеля $0,35, $12/день, мінус-слова'],
  ['g_events', 'Google', 'begin_checkout і purchase позначено ключовими подіями в GA4', 'GA4 → Адміністрування → Події'],
  ['inf_codes', 'Блогери', 'Промокоди для блогерів створено, пропозиції надіслано', 'Адмінка → Промокоди; текст у marketing/ads/copy.md'],
  ['test_order', 'Перевірка', 'Тестова оплата пройшла: оплата → лист → вхід → повернення коштів', 'Мала сума своєю карткою, потім «Повернути» в замовленні'],
];
export const getManual = async env => { try { const v = JSON.parse(await getSetting(env, 'launch_manual') || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
export async function setManual(env, id, on) {
  if (!MANUAL.some(m => m[0] === id)) return { ok: false, error: 'Невідомий крок' };
  const cur = await getManual(env); if (on) cur[id] = Date.now(); else delete cur[id];
  await env.DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind('launch_manual', JSON.stringify(cur), Date.now()).run();
  return { ok: true };
}

/** ok: true (готово), false (бракує, без цього запуск не варто), 'warn' (бажано), 'opt' (необов'язково, не підключено). */
export async function readiness(env, { now = Date.now(), fetchImpl = fetch } = {}) {
  const C = [], add = (group, id, label, ok, hint, where = '') => C.push({ group, id, label, ok, hint, where });
  const st = await getSettings(env), tr = await trackConfig(env), flags = await agentFlags(env).catch(() => ({}));
  const launch = Date.parse((flags.launch || '2026-12-01') + 'T00:00:00+02:00');

  // --- Продажі й листи ---
  const live = env.PAYMENT_MODE !== 'stub' && !!env.MONOBANK_TOKEN;
  add('Продажі й листи', 'pay', 'Оплата Monobank у бойовому режимі', live, live ? 'Рахунки виставляються справжні' : 'Потрібні секрет MONOBANK_TOKEN і PAYMENT_MODE не «stub»', 'Cloudflare → Pages → Settings → Variables and Secrets');
  const mail = env.EMAIL_MODE !== 'stub' && !!env.RESEND_API_KEY;
  add('Продажі й листи', 'mail', 'Листи надсилаються (Resend)', mail, mail ? `Відправник: ${env.EMAIL_FROM || 'за замовчуванням'}` : 'Потрібен секрет RESEND_API_KEY і EMAIL_MODE не «stub»', 'Cloudflare → Variables and Secrets');
  const failed = await one(env, "SELECT COUNT(*) n FROM email_log WHERE status = 'failed' AND created_at > ?", now - 7 * DAY);
  if (failed && failed.n) add('Продажі й листи', 'mailfail', 'Листи без помилок за 7 днів', 'warn', `Не надіслано листів: ${failed.n}. Деталі: Комунікації → фільтр «не надіслано»`);
  add('Продажі й листи', 'price', 'Ціни задано (грн і євро)', st.price_uah > 0 && st.price_eur > 0 ? true : st.price_uah > 0 ? 'warn' : false, `${st.price_uah || '—'} грн · ${st.price_eur || '—'} €`, 'Налаштування → Ціни');
  const base = String(env.BASE_URL || '');
  add('Продажі й листи', 'base', 'Адреса сайту в листах', /^https:\/\/reeadvent\.fun\/?$/.test(base) ? true : 'warn', base || 'BASE_URL не задано', 'Cloudflare → Variables');
  add('Продажі й листи', 'launch', 'Дата старту календарів', flags.launch ? true : 'warn', flags.launch || '2026-12-01', 'Соцмережі й реклама → Агент росту');
  add('Продажі й листи', 'cron', 'Розклад (щоденні вікна, нагадування, автопублікація)', env.CRON_SECRET ? true : 'warn', env.CRON_SECRET ? 'Секрет CRON_SECRET є' : 'Без CRON_SECRET щоденні задачі не запускаються', 'Cloudflare → Variables and Secrets');
  const paid = await one(env, "SELECT COUNT(*) n, MAX(paid_at) last FROM orders WHERE status = 'paid' AND amount_kop > 0 AND archived_at IS NULL");
  add('Продажі й листи', 'paid', 'Є хоч одна справжня оплата', paid && paid.n ? true : 'warn', paid && paid.n ? `Оплачених замовлень: ${paid.n}` : 'Зробіть тестову оплату малою сумою (крок «Тестова оплата» нижче)');

  // --- Відстеження ---
  let utmCols = false; try { utmCols = ((await env.DB.prepare('PRAGMA table_info(orders)').all()).results || []).some(c => c.name === 'utm_source'); } catch {}
  add('Відстеження реклами', 'utm', 'Мітки UTM зберігаються в замовленнях', utmCols, utmCols ? 'Колонки в базі є' : 'Виконайте docs/d1-console-0010.sql у консолі D1');
  add('Відстеження реклами', 'pixel', 'Піксель Meta', !!tr.meta, tr.meta ? `ID ${tr.meta}` : 'Events Manager → ID піксела → Реклама → Відстеження', 'Соцмережі й реклама → Реклама');
  add('Відстеження реклами', 'gtm', 'Google Tag Manager у коді сайту', true, 'GTM-TTT3ZSPD у режимі згоди (Consent Mode v2) на головній, сторінці оплати й юридичних сторінках');
  add('Відстеження реклами', 'ga4', 'Google Analytics 4', !!tr.ga4, tr.ga4 || 'Measurement ID G-… → Реклама → Відстеження', 'Соцмережі й реклама → Реклама');
  add('Відстеження реклами', 'gads', 'Конверсія Google Ads', tr.gads && tr.gads_label ? true : tr.gads ? 'warn' : false, tr.gads ? (tr.gads_label ? `${tr.gads} / мітка є` : `${tr.gads}, але бракує мітки конверсії`) : 'Conversion ID AW-… і мітка → Реклама → Відстеження', 'Соцмережі й реклама → Реклама');
  const utm7 = await one(env, 'SELECT COUNT(*) n FROM orders WHERE utm_source IS NOT NULL AND created_at > ?', now - 7 * DAY);
  add('Відстеження реклами', 'utmseen', 'Замовлення з рекламних посилань', utm7 && utm7.n ? true : 'warn', utm7 && utm7.n ? `За 7 днів: ${utm7.n}` : 'Ще жодного. Перевірте: відкрийте сайт з ?utm_source=test і оформіть замовлення');
  const sp = await one(env, 'SELECT COUNT(*) n, MAX(day) last FROM ad_spend');
  add('Відстеження реклами', 'spend', 'Витрати на рекламу вносяться', sp && sp.n ? (sp.last >= new Date(now - 2 * DAY).toISOString().slice(0, 10) ? true : 'warn') : 'opt', sp && sp.n ? `Останній запис: ${sp.last}` : flags.metaAcc ? 'Синхронізація Meta налаштована, чекаємо перших витрат' : 'Після старту: щодня або автосинхронізація Meta (ads_read)', 'Соцмережі й реклама → Реклама → Витрати');

  // --- Соцмережі ---
  let ig = null; try { ig = await igStatus(env, now); } catch {}
  add('Соцмережі', 'ig', 'Instagram підключено', ig && ig.connected ? (ig.daysLeft != null && ig.daysLeft < 10 && !ig.neverExpires ? 'warn' : true) : false, ig && ig.connected ? `@${ig.username || 'reeadvent'}${ig.neverExpires ? ', токен безстроковий' : ig.daysLeft != null ? `, токен ще ${ig.daysLeft} дн.` : ''}` : 'Соцмережі й реклама → Підключення: Instagram і Facebook');
  let fbp = null; try { fbp = await getFbPage(env); } catch {}
  add('Соцмережі', 'fb', 'Сторінка Facebook для публікацій', fbp ? true : 'opt', fbp ? fbp.name || fbp.id : 'Необов’язково: пости підуть і на Facebook');
  try {
    const ps = await pubState(env), man = await loadManifest(fetchImpl, undefined, env), eff = effective(man, await getPlan(env));
    const left = eff.filter(p => !isComplete(ps, p, !!fbp)), soon = left.filter(p => p.at && p.at > now && p.at < now + 7 * DAY);
    add('Соцмережі', 'auto', 'Автопублікація увімкнена', ps.auto ? true : 'warn', ps.auto ? 'Пости виходять самі за календарем' : 'Увімкніть у «Публікації Instagram і Facebook»');
    if (!ps.auto && ig && ig.connected) C[C.length - 1].action = 'auto_on';
    add('Соцмережі', 'queue', 'Пости заплановано на тиждень', soon.length >= 5 ? true : soon.length ? 'warn' : false, `Заплановано на 7 днів: ${soon.length}, у черзі без дати: ${left.filter(p => !p.at).length}`, 'Публікації Instagram і Facebook');
    if (ps.err) add('Соцмережі', 'puberr', 'Остання публікація без помилки', 'warn', String(ps.err.message || ps.err).slice(0, 160));
  } catch { add('Соцмережі', 'queue', 'План публікацій', 'warn', 'Не вдалося прочитати план (маніфест недоступний)'); }

  // --- Агент і сервіси ---
  add('Агент і сервіси', 'claude', 'Claude для агента й пропозицій', env.ANTHROPIC_API_KEY ? true : 'opt', env.ANTHROPIC_API_KEY ? `Модель ${env.AGENT_MODEL || 'за замовчуванням'}` : 'Без ключа агент працює за правилами', 'docs/agent.md → Як підключити Claude');
  add('Агент і сервіси', 'r2', 'Сховище R2 (відео у відповідях і Reels)', env.MEDIA ? true : 'opt', env.MEDIA ? 'Підключено' : 'Без нього у відповідях лише фото', 'Pages → Settings → Bindings → R2: MEDIA');
  add('Агент і сервіси', 'places', 'Google Places (заклади в місті)', env.GOOGLE_PLACES_KEY ? true : 'warn', env.GOOGLE_PLACES_KEY ? 'Ключ є' : 'Без нього пригоди без конкретних адрес', 'Cloudflare → Variables and Secrets');
  add('Агент і сервіси', 'metaacc', 'Автооблік витрат Meta', flags.metaAcc ? true : 'opt', flags.metaAcc ? `act_${flags.metaAcc}` : 'Токен з ads_read + ID рекламного акаунта', 'Агент росту');
  add('Агент і сервіси', 'turnstile', 'Захист форм від ботів (Turnstile)', env.TURNSTILE_SECRET && env.TURNSTILE_SITE_KEY ? true : 'opt', env.TURNSTILE_SECRET ? 'Увімкнено' : 'Бажано перед рекламою: менше спаму', 'Cloudflare → Turnstile');
  add('Агент і сервіси', 'gsign', 'Вхід через Google', env.GOOGLE_CLIENT_ID ? true : 'opt', env.GOOGLE_CLIENT_ID ? 'Увімкнено' : 'Необов’язково: є вхід кодом з листа');

  const manual = await getManual(env);
  const must = C.filter(c => c.ok !== 'opt'), ready = must.filter(c => c.ok === true).length;
  const mDone = MANUAL.filter(m => manual[m[0]]).length;
  const fun = await funnel(env, 7, now).catch(() => null);
  return { ok: true, funnel: fun, checks: C, manual: MANUAL.map(([id, group, label, hint]) => ({ id, group, label, hint, done: manual[id] || null })), score: { auto: ready, autoTotal: must.length, manual: mDone, manualTotal: MANUAL.length, blockers: C.filter(c => c.ok === false).length }, launch: flags.launch || '2026-12-01', daysToLaunch: Math.ceil((launch - now) / DAY) };
}
