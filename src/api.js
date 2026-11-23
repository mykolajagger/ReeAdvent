import { GIFTS, INTIMATE, ACTIVITIES, QUESTIONS, REGIONS, generateSchedule, sanitizeSurvey, giftView, intimView, actView, questionText, placesQuery } from './logic.js';
import { recommend } from './places.js';
import { instagramFeed, getEmbeds, IG_HANDLE } from './instagram.js';
import { ensureCity, runVenuesLogged as runVenues, venuePicks, rateVenue, reportVenue, catOfQuery, catOfGift } from './venues.js';
import { createInvoice, verifyPaid, invoiceStatus, invoiceOf, eurInvoiceOff } from './payments.js';
import { listFor, getPrices, CCY_NUM } from './pricing.js';
import { ensureSchema } from './schema.js';
import { verifyTurnstile } from './turnstile.js';
import { handleAdmin } from './admin.js';
import { findPromo, priceWith, rateLimit, normCode } from './promo.js';
import { getSettings } from './settings.js';
import { cleanUtm, publicTrackConfig } from './ads.js';
import { resumeValid } from './recovery.js';
import { serveMedia } from './media.js';
import { getFx, priceCurrency } from './currency.js';
import { sendEmail, welcomeEmail, partnerInviteEmail, loginEmail } from './email.js';
import { runDaily, checkUnsub } from './reminders.js';
import { json, HttpError, localDayNumber, unlockTimes, randomToken, uid, sha256, parseCookies, sessionCookie, EMAIL_RE, normEmail, cleanText, nowOf, tomorrowStr, fromDateStr, toDateStr, todayIndex, windowDates, validTz, DAYS, UNLOCK_HOUR } from './util.js';

// Тимчасово окуповані території України не обслуговуємо: області (Крим, Донеччина, Луганщина) і міста окупованих частин інших областей
const OCCUPIED_REGIONS = ['Автономна Республіка Крим', 'Донецька', 'Луганська'];
const OCCUPIED_CITIES = ['севастополь', 'sevastopol', 'сімферополь', 'simferopol', 'донецьк', 'donetsk', 'луганськ', 'luhansk', 'маріуполь', 'mariupol', 'мелітополь', 'melitopol', 'бердянськ', 'berdiansk', 'енергодар', 'enerhodar', 'нова каховка', 'nova kakhovka', 'каховка', 'kakhovka', 'генічеськ', 'henichesk', 'олешки', 'oleshky', 'скадовськ', 'skadovsk', 'алчевськ', 'alchevsk', 'горлівка', 'horlivka', 'макіївка', 'makiivka', 'керч', 'kerch', 'ялта', 'yalta', 'євпаторія', 'yevpatoriya', 'феодосія', 'feodosiya'];
const BLOCKED_COUNTRIES = ['RU', 'BY']; // не обслуговуємо (умови еквайрингу); змініть тут і в public/assets/countries.js
const MAX_START_DAYS = 90; // найдальша дата старту від завтрашнього дня

const LOGIN_TTL = 30 * 60e3, WELCOME_TTL = 7 * 24 * 3600e3, SESSION_TTL = 60 * 24 * 3600e3;
export const WELCOME_TTL_MS = WELCOME_TTL, LOGIN_TTL_MS = LOGIN_TTL;

export async function handle(request, env) {
  try {
    await ensureSchema(env);   // відсутні колонки (архів, валюта, UTM) додаються самі, один раз на базу
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '');
    const m = request.method;
    if (m === 'GET' && path === '/api/config') return await configResponse(request, env);
    if (m === 'GET' && path === '/api/instagram') return json({ ok: true, handle: IG_HANDLE, posts: await instagramFeed(env), embeds: await getEmbeds(env) }, 200, { 'cache-control': 'public, max-age=600' });
    if (m === 'GET' && path === '/api/track-config') return json({ ok: true, ...(await publicTrackConfig(env)) });
    if (m === 'POST' && path === '/api/orders') return await createOrder(request, env);
    if (m === 'POST' && path === '/api/promo/check') return await promoCheck(request, env);
    let r;
    if (m === 'GET' && (r = path.match(/^\/api\/media\/([\w-]{8,40}(?:\.(?:jpe?g|png|mp4))?)$/i))) return await serveMedia(env, r[1]);
    if (m === 'GET' && (r = path.match(/^\/api\/orders\/([\w-]+)\/resume$/))) return await resumeOrder(request, env, r[1]);
    if (m === 'GET' && (r = path.match(/^\/api\/orders\/([\w-]+)\/status$/))) return await orderStatus(env, r[1]);
    if (m === 'GET' && (r = path.match(/^\/api\/dev\/pay\/([\w-]+)$/))) return await devPay(env, r[1]);
    if (path.startsWith('/api/admin/') && path !== '/api/admin/outbox') return await handleAdmin(request, env, path, m);
    if (m === 'GET' && path === '/api/health') return await health(env);
    if (m === 'GET' && path === '/api/admin/outbox') return await adminOutbox(request, env);
    if (m === 'POST' && (r = path.match(/^\/api\/orders\/([\w-]+)\/resend$/))) return await orderResend(env, r[1]);
    if (m === 'GET' && path === '/api/unsub') return await unsub(env, url);
    if (m === 'POST' && path === '/api/cron/daily') return await cronDaily(request, env);
    if (m === 'POST' && path === '/api/cron/venues') return await cronDaily(request, env, runVenues);
    if (m === 'POST' && path === '/api/payments/monobank/webhook') return await monoWebhook(request, env);
    if (m === 'POST' && path === '/api/auth/request') return await authRequest(request, env);
    if (m === 'POST' && path === '/api/auth/verify') return await authVerify(request, env);
    if (m === 'POST' && path === '/api/auth/google') return await authGoogle(request, env);
    if (m === 'POST' && path === '/api/auth/code') return await authCode(request, env);
    if (m === 'POST' && path === '/api/auth/logout') return await authLogout(request, env);

    // Далі — тільки для авторизованих
    const member = await requireMember(request, env);
    if (m === 'POST' && path === '/api/auth/logout-all') { await run(env, 'DELETE FROM sessions WHERE member_id = ?', member.id); return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0, env.DEV !== '1') }); }
    if (m === 'GET' && path === '/api/state') return json(await stateOf(env, member));
    if (m === 'POST' && path === '/api/survey') return json(await saveSurvey(request, env, member));
    if (m === 'GET' && (r = path.match(/^\/api\/day\/(\d+)$/))) return json(await getDay(env, member, +r[1]));
    if (m === 'POST' && path === '/api/answer') return json(await saveAnswer(request, env, member));
    if (m === 'GET' && (r = path.match(/^\/api\/places\/(\d+)$/))) return json(await placesFor(env, member, +r[1], url.searchParams.get('k')));
    if (m === 'POST' && (r = path.match(/^\/api\/venues\/(\d+)\/rate$/))) { const b = await readJson(request); const out = await rateVenue(env, { memberId: member.id, country: member.country, city: member.city, venueId: +r[1], stars: Number(b.stars) }); if (!out.ok) throw new HttpError(out.error === 'too_many' ? 429 : out.error === 'not_found' ? 404 : 400, out.error); return json(out); }
    if (m === 'POST' && (r = path.match(/^\/api\/venues\/(\d+)\/report$/))) { const out = await reportVenue(env, { memberId: member.id, country: member.country, city: member.city, venueId: +r[1] }); if (!out.ok) throw new HttpError(out.error === 'too_many' ? 429 : 404, out.error); return json(out); }
    if (m === 'GET' && path === '/api/history') return json(await history(env, member));
    if (m === 'POST' && path === '/api/mark') return json(await mark(request, env, member));
    throw new HttpError(404, 'not_found');
  } catch (e) {
    if (e instanceof HttpError) return json({ ok: false, error: e.code, ...(e.detail ? { detail: e.detail } : {}) }, e.status);
    if (e && e.status && e.code) return json({ ok: false, error: e.code, ...(e.detail ? { detail: e.detail } : {}) }, e.status);
    console.error(e);
    // Діагностика: лише коли явно ввімкнено змінну DEBUG=1 (вимкніть після налагодження!)
    return json({ ok: false, error: 'server_error', ...(env.DEBUG === '1' ? { detail: String(e && e.message || e).slice(0, 300) } : {}) }, 500);
  }
}

const readJson = async req => { try { return await req.json(); } catch { throw new HttpError(400, 'bad_json'); } };
const q1 = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).first();
const run = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).run();

// ---------- Замовлення та оплата ----------
async function createOrder(request, env) {
  const b = await readJson(request);
  // Антибот: якщо налаштовано секрет Turnstile, токен обов'язковий
  if (env.TURNSTILE_SECRET && !(await verifyTurnstile(env, b.turnstileToken, request.headers.get('CF-Connecting-IP')))) throw new HttpError(400, 'captcha');
  const o = {
    name_a: cleanText(b.nameA, 30), name_b: cleanText(b.nameB, 30),
    email_a: normEmail(b.emailA), email_b: normEmail(b.emailB),
    city: cleanText(b.city, 60), region: String(b.region || ''), payer_email: normEmail(b.payerEmail || b.emailA),
    start_date: String(b.startDate || ''),
    lang: b.lang === 'en' ? 'en' : 'uk', country: /^[A-Za-z]{2}$/.test(String(b.country || '')) ? String(b.country).toUpperCase() : 'UA',
    tz: validTz(b.tz) ? b.tz : 'Europe/Kyiv'
  };
  if (BLOCKED_COUNTRIES.includes(o.country)) throw new HttpError(400, 'country_blocked'); // оплата з цих країн неможлива
  if (o.country !== 'UA') o.region = cleanText(b.region, 60) || '—';
  if ((o.country === 'UA' && OCCUPIED_REGIONS.includes(o.region)) || OCCUPIED_CITIES.includes(o.city.trim().toLowerCase())) throw new HttpError(400, 'region_occupied');
  if (!o.name_a || !o.name_b) throw new HttpError(400, 'bad_names');
  if (!EMAIL_RE.test(o.email_a) || !EMAIL_RE.test(o.email_b)) throw new HttpError(400, 'bad_email');
  if (o.email_a === o.email_b) throw new HttpError(400, 'same_email');
  if (!o.city) throw new HttpError(400, 'bad_city');
  if (o.country === 'UA' && !REGIONS.includes(o.region)) throw new HttpError(400, 'bad_region');
  // дата старту: від завтра (за Києвом) до +90 днів
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.start_date) || toDateStr(fromDateStr(o.start_date)) !== o.start_date) throw new HttpError(400, 'bad_date');
  const minStart = fromDateStr(tomorrowStr(nowOf(env), o.tz)), ds = fromDateStr(o.start_date);
  if (ds < minStart || ds > minStart + MAX_START_DAYS) throw new HttpError(400, 'bad_date');
  if (b.age18 !== true || b.terms !== true) throw new HttpError(400, 'consent_required');
  // проста антиспам-межа: не більше 5 неоплачених замовлень на одну пошту за годину
  const recent = await q1(env, "SELECT COUNT(*) AS n FROM orders WHERE email_a = ? AND status = 'pending' AND created_at > ?", o.email_a, Date.now() - 3600e3);
  if (recent.n >= 5) throw new HttpError(429, 'too_many');

  // Промокод (необов'язковий): ціну завжди рахує сервер
  let promo = null;
  if (String(b.promo || '').trim()) {
    const r = await findPromo(env, b.promo);
    if (r.error) throw new HttpError(400, 'promo_' + r.error);
    promo = r.promo;
  }
  // ціна: для України в гривнях, для інших країн єдина ціна в євро (суми в мінімальних одиницях валюти)
  const lp = await listFor(env, o.country), price = priceWith(lp.list, promo, lp.fixedScale);
  const order = { id: uid(), amount_kop: price.final, currency: lp.currency, ...o }, utm = cleanUtm(b.utm);
  const free = price.final === 0;
  const inv = free ? { invoiceId: 'free_' + order.id, pageUrl: `${env.BASE_URL}/thanks.html?order=${order.id}`, ccy: CCY_NUM[lp.currency], amount: 0 } : await createInvoice(env, order, lp.uahRate);
  // курс гривні для звітів: для рахунку в гривнях за євро-ціною він точний (скільки гривень справді виставлено)
  const uahRate = lp.currency === 'EUR' ? (inv.ccy === 980 && price.final > 0 ? inv.amount / price.final : lp.uahRate) : 1;
  const baseArgs = [order.id, Date.now(), 'pending', price.final, price.list, price.discount, promo ? promo.code : null, promo ? promo.id : null, o.name_a, o.email_a, o.name_b, o.email_b, o.city, o.region, o.start_date, o.payer_email, inv.invoiceId, Date.now(), o.lang, o.country, o.tz];
  try { await run(env, `INSERT INTO orders (id, created_at, status, amount_kop, list_kop, discount_kop, promo_code, promo_id, name_a, email_a, name_b, email_b, city, region, start_date, payer_email, invoice_id, consent_at, lang, country, tz, utm_source, utm_medium, utm_campaign, utm_content, utm_term, currency, uah_rate, inv_ccy, inv_amount)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ...baseArgs, utm.utm_source || null, utm.utm_medium || null, utm.utm_campaign || null, utm.utm_content || null, utm.utm_term || null, lp.currency, uahRate, inv.ccy, inv.amount); }
  catch (e) { if (!/no column|no such column|has no column/i.test(String(e && e.message))) throw e;   // схему ще не оновлено (рідкісний збій автооновлення): зберігаємо без нових полів
    if (lp.currency !== 'UAH') throw e;
    await run(env, `INSERT INTO orders (id, created_at, status, amount_kop, list_kop, discount_kop, promo_code, promo_id, name_a, email_a, name_b, email_b, city, region, start_date, payer_email, invoice_id, consent_at, lang, country, tz)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ...baseArgs); }
  await ensureCity(env, o.country, o.city); // місто ставиться в пріоритетну чергу наповнення бази закладів (якщо його ще немає)
  if (free) await markPaid(env, order.id); // 100% знижка: календар створюється одразу, без оплати
  return json({ ok: true, orderId: order.id, payUrl: inv.pageUrl, free, amountKop: price.final, currency: lp.currency });
}

async function promoCheck(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  if (!(await rateLimit(env, 'promo:' + ip, 20, 600))) throw new HttpError(429, 'too_many');
  const b = await readJson(request);
  const r = await findPromo(env, b.code);
  const country = /^[A-Za-z]{2}$/.test(String(b.country || '')) ? String(b.country).toUpperCase() : 'UA', lp = await listFor(env, country);   // знижка у валюті країни
  if (r.error) return json({ ok: true, valid: false, reason: r.error, listKop: lp.list, currency: lp.currency });
  const price = priceWith(lp.list, r.promo, lp.fixedScale);
  return json({ ok: true, valid: true, code: r.promo.code, listKop: price.list, discountKop: price.discount, finalKop: price.final, currency: lp.currency, type: r.promo.type, value: r.promo.value });
}

async function orderStatus(env, id) {
  const o = await q1(env, 'SELECT * FROM orders WHERE id = ?', id);
  if (!o) throw new HttpError(404, 'not_found');
  return json({ ok: true, status: o.status, ...(o.status === 'paid' ? { value: Math.round(o.amount_kop) / 100, currency: o.currency || 'UAH' } : {}) });
}

/** Діагностика налаштувань. Працює лише коли ввімкнено DEBUG=1; секрети не показує. */
async function health(env) {
  if (env.DEBUG !== '1') throw new HttpError(404, 'not_found');
  const out = { db_binding: !!env.DB, price: env.PRICE_UAH ?? null, base_url: env.BASE_URL ?? null, payment_mode: env.PAYMENT_MODE ?? null, email_mode: env.EMAIL_MODE ?? null,
    has_monobank_token: !!env.MONOBANK_TOKEN, has_resend_key: !!env.RESEND_API_KEY, has_email_from: !!env.EMAIL_FROM, has_admin_key: !!env.ADMIN_KEY };
  if (env.DB) {
    try {
      const t = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all();
      out.tables = t.results.map(r => r.name);
      const c = await env.DB.prepare('PRAGMA table_info(orders)').all();
      out.orders_columns = c.results.map(r => r.name);
    } catch (e) { out.db_error = String(e && e.message || e).slice(0, 300); }
  }
  return json({ ok: true, ...out });
}

/** Лише для тестового стенду (EMAIL_MODE=stub): читати «надіслані» листи, щоб дістати посилання входу. Потрібен ADMIN_KEY. */
async function adminOutbox(request, env) {
  if (env.EMAIL_MODE !== 'stub' || !env.ADMIN_KEY || env.ADMIN_KEY.length < 16) throw new HttpError(404, 'not_found');
  const a = await sha256(request.headers.get('x-admin-key') || ''), b = await sha256(env.ADMIN_KEY);
  if (a !== b) throw new HttpError(404, 'not_found');
  const rows = (await env.DB.prepare('SELECT id, created_at, to_email, subject, body FROM outbox ORDER BY id DESC LIMIT 20').all()).results;
  return json({ ok: true, rows });
}

async function devPay(env, id) {
  if (env.PAYMENT_MODE === 'monobank') throw new HttpError(404, 'not_found');
  await markPaid(env, id);
  return new Response(null, { status: 302, headers: { Location: `/thanks.html?order=${id}` } });
}

/** Відновлення оплати за посиланням із листа: перевіряє підпис, створює новий інвойс і перенаправляє на сторінку оплати. */
async function resumeOrder(request, env, id) {
  const home = `${env.BASE_URL}/`, go = url => new Response(null, { status: 302, headers: { Location: url } });
  const sig = new URL(request.url).searchParams.get('s') || '';
  if (!(await resumeValid(env, id, sig))) return go(home);
  const o = await q1(env, 'SELECT * FROM orders WHERE id = ?', id);
  if (!o) return go(home);
  if (o.status === 'paid') return go(`${env.BASE_URL}/thanks.html?order=${encodeURIComponent(id)}`);
  if (o.status !== 'pending' || Date.now() - o.created_at > 7 * 864e5 || !(o.amount_kop > 0)) return go(home + '?resume=expired');
  let inv; try { inv = await createInvoice(env, o, (await getPrices(env)).uahPerEur); } catch { return go(home + '?resume=error'); }
  const uahRate = o.currency === 'EUR' ? (inv.ccy === 980 ? inv.amount / o.amount_kop : (await getPrices(env)).uahPerEur) : 1;
  try { await run(env, "UPDATE orders SET invoice_id = ?, inv_ccy = ?, inv_amount = ?, uah_rate = ? WHERE id = ? AND status = 'pending'", inv.invoiceId, inv.ccy, inv.amount, uahRate, id); }
  catch { await run(env, "UPDATE orders SET invoice_id = ? WHERE id = ? AND status = 'pending'", inv.invoiceId, id); }
  return go(inv.pageUrl);
}

async function monoWebhook(request, env) {
  const b = await readJson(request);
  const invoiceId = String(b.invoiceId || '');
  let o = await q1(env, 'SELECT * FROM orders WHERE invoice_id = ?', invoiceId);
  if (!o && env.PAYMENT_MODE === 'monobank' && invoiceId) {   // замовлення могли відновити новим інвойсом: старий інвойс шукаємо за reference (id замовлення) зі статусу Monobank
    const j = await invoiceStatus(env, invoiceId), o2 = j && j.reference ? await q1(env, 'SELECT * FROM orders WHERE id = ?', String(j.reference)) : null;
    const ccy = j ? Number(j.ccy) || 980 : 0, okAmount = j && (ccy === 978 ? o2 && o2.currency === 'EUR' && Number(j.amount) === o2.amount_kop : o2 && (Number(j.amount) === invoiceOf(o2).amount || (o2.currency !== 'EUR' && Number(j.amount) === o2.amount_kop)));
    if (o2 && j.status === 'success' && okAmount) {   // оплачено старим рахунком: запам'ятовуємо саме його валюту й суму
      try { await run(env, 'UPDATE orders SET invoice_id = ?, inv_ccy = ?, inv_amount = ? WHERE id = ?', invoiceId, ccy, Number(j.amount), o2.id); } catch { await run(env, 'UPDATE orders SET invoice_id = ? WHERE id = ?', invoiceId, o2.id); }
      o = { ...o2, invoice_id: invoiceId, inv_ccy: ccy, inv_amount: Number(j.amount) };
    }
  }
  if (!o) return json({ ok: true }); // невідомий інвойс — ігноруємо, але відповідаємо 200
  if (o.status === 'paid') {
    // повернення коштів, зроблене в кабінеті банку чи нашим запитом: підтверджуємо статусом із Monobank
    if (env.PAYMENT_MODE === 'monobank' && (!o.refunded_at || o.refund_status !== 'success')) {
      const j = await invoiceStatus(env, invoiceId);
      if (j && j.status === 'reversed') {
        await run(env, 'UPDATE orders SET refunded_at = COALESCE(refunded_at, ?), refund_kop = COALESCE(refund_kop, ?), refund_status = ? WHERE id = ?', Date.now(), o.amount_kop, 'success', o.id);
        await run(env, 'DELETE FROM sessions WHERE member_id IN (SELECT m.id FROM members m JOIN calendars c ON c.id = m.calendar_id WHERE c.order_id = ?)', o.id);
        await run(env, 'INSERT INTO audit_log (at, admin_email, action, target, detail) VALUES (?,?,?,?,?)', Date.now(), 'system:monobank', 'refund_confirmed', o.id, null);
      }
    }
    return json({ ok: true });
  }
  const inv = invoiceOf(o);
  if (await verifyPaid(env, invoiceId, inv.amount, inv.ccy)) await markPaid(env, o.id);
  return json({ ok: true });
}

/** Ідемпотентно: створює календар, двох учасників і розсилає листа з доступом. */
export async function markPaid(env, orderId) {
  const o = await q1(env, 'SELECT * FROM orders WHERE id = ?', orderId);
  if (!o) throw new HttpError(404, 'not_found');
  const upd = await run(env, "UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ? AND status = 'pending'", Date.now(), orderId);
  if (!upd.meta?.changes) return; // уже оплачено (повторний вебхук)
  if (o.promo_id) await run(env, 'UPDATE promo_codes SET used_count = used_count + 1 WHERE id = ?', o.promo_id);
  // обрана дата; якщо оплатили запізно і вона вже минула — стартуємо завтра
  const tz = o.tz || 'Europe/Kyiv', lang = o.lang || 'uk', tomorrow = tomorrowStr(nowOf(env), tz);
  const startDate = fromDateStr(o.start_date) >= fromDateStr(tomorrow) ? o.start_date : tomorrow;
  const calId = uid(), now = Date.now();
  const mA = uid(), mB = uid();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO calendars (id, order_id, created_at, city, region, start_date, lang, tz, country) VALUES (?,?,?,?,?,?,?,?,?)').bind(calId, orderId, now, o.city, o.region, startDate, lang, tz, o.country || 'UA'),
    env.DB.prepare('INSERT INTO members (id, calendar_id, email, slot, suggested_name) VALUES (?,?,?,?,?)').bind(mA, calId, o.email_a, 0, o.name_a),
    env.DB.prepare('INSERT INTO members (id, calendar_id, email, slot, suggested_name) VALUES (?,?,?,?,?)').bind(mB, calId, o.email_b, 1, o.name_b)
  ]);
  // покупцю — підтвердження; партнеру — запрошення «[ім'я] створює для вас ваш спільний ReeAdvent»
  const linkA = await issueLoginLink(env, mA, WELCOME_TTL), linkB = await issueLoginLink(env, mB, WELCOME_TTL);
  const codeA = await issueLoginCode(env, mA, WELCOME_TTL), codeB = await issueLoginCode(env, mB, WELCOME_TTL);
  const mailA = welcomeEmail(env, o.name_a, o.name_b, startDate, linkA, lang, codeA), mailB = partnerInviteEmail(env, o.name_b, o.name_a, startDate, linkB, lang, codeB);
  // збій пошти не має ламати підтвердження оплати (повторний вебхук уже нічого не надішле): помилка потрапляє в журнал «Комунікації», доступ можна надіслати повторно
  try { await sendEmail(env, o.email_a, mailA.subject, mailA.html, mailA.text, { meta: { kind: 'welcome', orderId, memberId: mA, startDate } }); } catch (e) { console.error('welcome email failed', e && e.message); }
  try { await sendEmail(env, o.email_b, mailB.subject, mailB.html, mailB.text, { meta: { kind: 'partner_invite', orderId, memberId: mB, startDate } }); } catch (e) { console.error('partner invite failed', e && e.message); }
}

// ---------- Авторизація (посилання на пошту) ----------
/** Одноразовий 6-значний код (альтернатива посиланню): одна активна пара «учасник — код», 5 спроб. */
export async function issueLoginCode(env, memberId, ttl) {
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
  await run(env, 'INSERT INTO login_codes (member_id, code_hash, expires_at, attempts) VALUES (?,?,?,0) ON CONFLICT(member_id) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0', memberId, await sha256(code + ':' + memberId), Date.now() + ttl);
  return code;
}

export async function issueLoginLink(env, memberId, ttl) {
  const token = randomToken(32);
  await run(env, 'INSERT INTO login_tokens (token_hash, member_id, created_at, expires_at) VALUES (?,?,?,?)', await sha256(token), memberId, Date.now(), Date.now() + ttl);
  return `${env.BASE_URL}/app/#login=${token}`;
}

async function authRequest(request, env) {
  const b = await readJson(request);
  const email = normEmail(b.email);
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'bad_email');
  // найновіший календар, де ця пошта — учасник
  const mem = await q1(env, `SELECT m.id, m.suggested_name, m.survey_json, c.lang FROM members m JOIN calendars c ON c.id = m.calendar_id JOIN orders o ON o.id = c.order_id WHERE m.email = ? AND o.refunded_at IS NULL ORDER BY c.created_at DESC LIMIT 1`, email);
  if (mem) {
    const recent = await q1(env, 'SELECT COUNT(*) AS n FROM login_tokens WHERE member_id = ? AND created_at > ?', mem.id, Date.now() - 3600e3);
    if (recent.n < 5) {
      const mail = loginEmail(env, mem.survey_json ? JSON.parse(mem.survey_json).name : mem.suggested_name, await issueLoginLink(env, mem.id, LOGIN_TTL), mem.lang, await issueLoginCode(env, mem.id, LOGIN_TTL));
      await sendEmail(env, email, mail.subject, mail.html, mail.text, { meta: { kind: 'login', memberId: mem.id } });
    }
  }
  return json({ ok: true }); // відповідь однакова, щоб не розкривати, чи є така пошта
}

async function authVerify(request, env) {
  const b = await readJson(request);
  const hash = await sha256(String(b.token || ''));
  const row = await q1(env, 'SELECT * FROM login_tokens WHERE token_hash = ?', hash);
  if (!row || row.used_at || row.expires_at < Date.now()) throw new HttpError(401, 'bad_token');
  const used = await run(env, 'UPDATE login_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL', Date.now(), hash);
  if (!used.meta?.changes) throw new HttpError(401, 'bad_token');
  const sess = randomToken(32);
  await run(env, 'INSERT INTO sessions (token_hash, member_id, expires_at) VALUES (?,?,?)', await sha256(sess), row.member_id, Date.now() + SESSION_TTL);
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie(sess, SESSION_TTL / 1000, env.DEV !== '1') });
}

async function authLogout(request, env) {
  const t = parseCookies(request).rs;
  if (t) await run(env, 'DELETE FROM sessions WHERE token_hash = ?', await sha256(t));
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0, env.DEV !== '1') });
}

async function requireMember(request, env) {
  const t = parseCookies(request).rs;
  if (!t) throw new HttpError(401, 'auth');
  const s = await q1(env, 'SELECT member_id, expires_at FROM sessions WHERE token_hash = ?', await sha256(t));
  if (!s || s.expires_at < Date.now()) throw new HttpError(401, 'auth');
  const mem = await q1(env, `SELECT m.*, c.city, c.region, c.start_date, c.schedule_json, c.lang, c.tz, c.country, o.refunded_at FROM members m JOIN calendars c ON c.id = m.calendar_id JOIN orders o ON o.id = c.order_id WHERE m.id = ?`, s.member_id);
  if (!mem || mem.refunded_at) throw new HttpError(401, 'auth');
  return mem;
}

// ---------- Календар ----------
async function partnerOf(env, mem) {
  return q1(env, 'SELECT * FROM members WHERE calendar_id = ? AND id != ?', mem.calendar_id, mem.id);
}
const surveyName = m => (m.survey_json ? JSON.parse(m.survey_json).name : null);

async function stateOf(env, mem) {
  const partner = await partnerOf(env, mem);
  const rows = (await env.DB.prepare('SELECT day FROM progress WHERE member_id = ? AND opened = 1').bind(mem.id).all()).results;
  return {
    ok: true,
    me: { name: surveyName(mem), suggestedName: mem.suggested_name },
    partner: { name: surveyName(partner) || partner.suggested_name, done: !!partner.survey_json },
    myDone: !!mem.survey_json, partnerDone: !!partner.survey_json, ready: !!mem.schedule_json,
    lang: mem.lang, country: mem.country || 'UA', usdRate: (await getSettings(env)).usd_rate, currency: priceCurrency(await getFx(env), mem.country || 'UA', (await getSettings(env)).usd_rate), unlockTimes: unlockTimes(mem.start_date, mem.tz), finished: localDayNumber(mem.start_date, nowOf(env), mem.tz) > DAYS, today: todayIndex(mem.start_date, nowOf(env), mem.tz), startDate: mem.start_date, unlockHour: UNLOCK_HOUR, totalDays: DAYS,
    opened: rows.map(r => r.day), city: mem.city
  };
}

async function saveSurvey(request, env, mem) {
  if (mem.schedule_json) throw new HttpError(409, 'locked');
  const b = await readJson(request);
  const clean = sanitizeSurvey(b.answers);
  await run(env, 'UPDATE members SET survey_json = ? WHERE id = ?', JSON.stringify(clean), mem.id);
  const both = (await env.DB.prepare('SELECT slot, survey_json FROM members WHERE calendar_id = ? ORDER BY slot').bind(mem.calendar_id).all()).results;
  if (both.length === 2 && both.every(r => r.survey_json)) {
    const sched = generateSchedule(both.map(r => JSON.parse(r.survey_json)), 1 + Math.floor(Math.random() * 2147483646), windowDates(mem.start_date), mem.region, mem.country);
    // умовне оновлення: якщо обидва зберегли одночасно, спрацює лише один
    await run(env, 'UPDATE calendars SET schedule_json = ? WHERE id = ? AND schedule_json IS NULL', JSON.stringify(sched), mem.calendar_id);
  }
  const fresh = await requireMemberById(env, mem.id);
  return stateOf(env, fresh);
}
const requireMemberById = (env, id) => q1(env, `SELECT m.*, c.city, c.region, c.start_date, c.schedule_json, c.lang, c.tz, c.country FROM members m JOIN calendars c ON c.id = m.calendar_id WHERE m.id = ?`, id);

async function getDay(env, mem, d) {
  if (!(d >= 1 && d <= DAYS)) throw new HttpError(400, 'bad_day');
  if (d > todayIndex(mem.start_date, nowOf(env), mem.tz)) throw new HttpError(403, 'not_yet');
  if (!mem.schedule_json) throw new HttpError(409, 'not_ready');
  const plan = JSON.parse(mem.schedule_json).days[d];
  const partner = await partnerOf(env, mem);
  const question = QUESTIONS[plan.q];
  const mine = await q1(env, 'SELECT text FROM answers WHERE member_id = ? AND day = ?', mem.id, d);
  // Спершу відповідь на питання дня: поки її немає, завдань сервер не віддає
  if (!mine) return { ok: true, day: d, needAnswer: true, forName: surveyName(partner), question: { text: questionText(question, mem.lang) } };
  const theirs = await q1(env, 'SELECT text FROM answers WHERE member_id = ? AND day = ?', partner.id, d);
  await run(env, `INSERT INTO progress (member_id, day, opened, opened_at) VALUES (?,?,1,?) ON CONFLICT(member_id, day) DO UPDATE SET opened = 1, opened_at = COALESCE(opened_at, excluded.opened_at)`, mem.id, d, Date.now());
  const pr = await q1(env, 'SELECT * FROM progress WHERE member_id = ? AND day = ?', mem.id, d);
  return {
    ok: true, day: d, forName: surveyName(partner),
    question: { text: questionText(question, mem.lang), mine: mine.text, partner: theirs ? theirs.text : null },
    gift: giftView(GIFTS[plan.gift[mem.slot]], mem.city, mem.lang, mem.country), intim: intimView(INTIMATE[plan.intim], mem.lang), act: actView(ACTIVITIES[plan.act], mem.city, mem.lang),
    done: { gift: !!pr.done_gift, intim: !!pr.done_intim, act: !!pr.done_act }
  };
}

async function saveAnswer(request, env, mem) {
  const b = await readJson(request);
  const d = Math.round(Number(b.day));
  if (!(d >= 1 && d <= DAYS) || d > todayIndex(mem.start_date, nowOf(env), mem.tz)) throw new HttpError(400, 'bad_day');
  if (!mem.schedule_json) throw new HttpError(409, 'not_ready');
  const text = String(b.text || '').replace(/[<>]/g, '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 600);
  if (text.length < 2) throw new HttpError(400, 'answer_short');
  const ins = await run(env, 'INSERT OR IGNORE INTO answers (member_id, day, text, created_at) VALUES (?,?,?,?)', mem.id, d, text, Date.now());
  if (!ins.meta?.changes) throw new HttpError(409, 'already_answered'); // відповідь не редагується
  return { ok: true };
}

async function mark(request, env, mem) {
  const b = await readJson(request);
  const d = Math.round(Number(b.day));
  if (!(d >= 1 && d <= DAYS) || d > todayIndex(mem.start_date, nowOf(env), mem.tz)) throw new HttpError(400, 'bad_day');
  const col = { gift: 'done_gift', intim: 'done_intim', act: 'done_act' }[b.key];
  if (!col) throw new HttpError(400, 'bad_key');
  await run(env, `INSERT INTO progress (member_id, day, ${col}) VALUES (?,?,?) ON CONFLICT(member_id, day) DO UPDATE SET ${col} = excluded.${col}`, mem.id, d, b.done ? 1 : 0);
  return { ok: true };
}

// ---------- Повторна відправка доступу (кнопка на сторінці «Дякуємо») ----------
async function orderResend(env, id) {
  if (!(await rateLimit(env, 'oresend:' + id, 3, 3600))) throw new HttpError(429, 'too_many');
  const o = await q1(env, 'SELECT id, paid_at, refunded_at, name_a, name_b, lang FROM orders WHERE id = ?', id);
  if (!o) throw new HttpError(404, 'not_found');
  if (!o.paid_at || o.refunded_at) throw new HttpError(409, 'not_paid');
  const cal = await q1(env, 'SELECT id, start_date FROM calendars WHERE order_id = ?', id);
  const mem = cal && await q1(env, 'SELECT id, email FROM members WHERE calendar_id = ? AND slot = 0', cal.id);
  if (!mem) throw new HttpError(409, 'not_ready');
  const mail = welcomeEmail(env, o.name_a, o.name_b, cal.start_date, await issueLoginLink(env, mem.id, WELCOME_TTL), o.lang || 'uk', await issueLoginCode(env, mem.id, WELCOME_TTL)); // лише покупцю
  await sendEmail(env, mem.email, mail.subject, mail.html, mail.text, { meta: { kind: 'access', orderId: id, memberId: mem.id, startDate: cal.start_date } });
  return json({ ok: true });
}

// ---------- Відписка від нагадувань ----------
async function unsub(env, url) {
  const m = url.searchParams.get('m') || '', sig = url.searchParams.get('s') || '';
  const mem = m && sig && await checkUnsub(env, m, sig) ? await q1(env, 'SELECT m.id, c.lang FROM members m JOIN calendars c ON c.id = m.calendar_id WHERE m.id = ?', m) : null;
  const lang = mem?.lang === 'en' ? 'en' : 'uk';
  if (mem) await run(env, 'UPDATE members SET remind_off = 1 WHERE id = ?', mem.id);
  const msg = mem ? (lang === 'en' ? 'Done. We will no longer send you reminders.' : 'Готово. Ми більше не надсилатимемо вам нагадувань.') : (lang === 'en' ? 'This link is not valid.' : 'Посилання недійсне.');
  return new Response(`<!doctype html><html lang="${lang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>ReeAdvent</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#08090d;color:#f3efe6;font:16px/1.6 system-ui,sans-serif;text-align:center;padding:20px"><div><div style="letter-spacing:.3em;font-size:11px;color:#d6b46a;margin-bottom:12px">REEADVENT</div><p>${msg}</p></div></body></html>`, { status: mem ? 200 : 400, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

// ---------- Щоденний запуск (Cron Worker) ----------
async function cronDaily(request, env, job = runDaily) {
  const key = env.CRON_SECRET;
  if (!key || key.length < 16) throw new HttpError(404, 'not_found');
  const a = await sha256(request.headers.get('x-cron-secret') || ''), b = await sha256(key);
  if (a !== b) throw new HttpError(404, 'not_found');
  return json({ ok: true, ...(await job(env)) });
}

// ---------- Вхід через Google ----------
async function authGoogle(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  if (!(await rateLimit(env, 'gauth:' + ip, 30, 600))) throw new HttpError(429, 'too_many');
  if (!env.GOOGLE_CLIENT_ID) throw new HttpError(404, 'not_found');
  const b = await readJson(request);
  const cred = String(b.credential || '');
  if (cred.length < 20 || cred.length > 4096) throw new HttpError(401, 'bad_token');
  // перевірку підпису й терміну дії виконує Google (tokeninfo); ми звіряємо адресата й підтвердженість пошти
  const res = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(cred));
  if (!res.ok) throw new HttpError(401, 'bad_token');
  const info = await res.json();
  if (info.aud !== env.GOOGLE_CLIENT_ID || String(info.email_verified) !== 'true' || !/^(https:\/\/)?accounts\.google\.com$/.test(info.iss || '')) throw new HttpError(401, 'bad_token');
  const email = normEmail(info.email);
  const mem = await q1(env, `SELECT m.id FROM members m JOIN calendars c ON c.id = m.calendar_id JOIN orders o ON o.id = c.order_id WHERE m.email = ? AND o.refunded_at IS NULL ORDER BY c.created_at DESC LIMIT 1`, email);
  if (!mem) throw new HttpError(403, 'no_access'); // особа підтверджена Google, але цієї пошти немає серед учасників
  const sess = randomToken(32);
  await run(env, 'INSERT INTO sessions (token_hash, member_id, expires_at) VALUES (?,?,?)', await sha256(sess), mem.id, Date.now() + SESSION_TTL);
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie(sess, SESSION_TTL / 1000, env.DEV !== '1') });
}

// ---------- Історія: усі відкриті вікна, питання й відповіді (доступна й після завершення календаря) ----------
async function history(env, mem) {
  if (!mem.schedule_json) return { ok: true, days: [], finished: false };
  const sched = JSON.parse(mem.schedule_json), partner = await partnerOf(env, mem);
  const last = Math.min(todayIndex(mem.start_date, nowOf(env), mem.tz), DAYS);
  const mine = (await env.DB.prepare('SELECT day, text, created_at FROM answers WHERE member_id = ?').bind(mem.id).all()).results;
  const theirs = (await env.DB.prepare('SELECT day, text, created_at FROM answers WHERE member_id = ?').bind(partner.id).all()).results;
  const prog = (await env.DB.prepare('SELECT day, opened, opened_at, done_gift, done_intim, done_act FROM progress WHERE member_id = ?').bind(mem.id).all()).results;
  const byDay = (arr, k = 'day') => new Map(arr.map(r => [r[k], r]));
  const M = byDay(mine), T = byDay(theirs), P = byDay(prog);
  const days = [];
  for (let d = last; d >= 1; d--) {
    const plan = sched.days[d], a = M.get(d), p = P.get(d);
    const row = { day: d, opened: !!(a && p && p.opened), question: questionText(QUESTIONS[plan.q], mem.lang), answered: !!a };
    if (a) { // питання й відповіді видно лише після власної відповіді (як і в самому вікні)
      row.mine = a.text; row.mine_at = a.created_at; const t = T.get(d); row.partner = t ? t.text : null; row.partner_at = t ? t.created_at : null;
    }
    if (row.opened) {
      row.opened_at = p.opened_at || null;
      row.gift = giftView(GIFTS[plan.gift[mem.slot]], mem.city, mem.lang, mem.country).title; row.intim = intimView(INTIMATE[plan.intim], mem.lang).title; row.act = actView(ACTIVITIES[plan.act], mem.city, mem.lang).title;
      row.done = { gift: !!p.done_gift, intim: !!p.done_intim, act: !!p.done_act };
    }
    days.push(row);
  }
  return { ok: true, days, partnerName: surveyName(partner), finished: localDayNumber(mem.start_date, nowOf(env), mem.tz) > DAYS };
}

// ---------- Вхід за кодом із листа ----------
async function authCode(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const b = await readJson(request);
  const email = normEmail(b.email), code = String(b.code || '').replace(/\D/g, '');
  if (!EMAIL_RE.test(email) || code.length !== 6) throw new HttpError(401, 'bad_code');
  if (!(await rateLimit(env, 'codeip:' + ip, 30, 3600)) || !(await rateLimit(env, 'codemail:' + email, 15, 3600))) throw new HttpError(429, 'too_many');
  const mem = await q1(env, `SELECT m.id FROM members m JOIN calendars c ON c.id = m.calendar_id JOIN orders o ON o.id = c.order_id WHERE m.email = ? AND o.refunded_at IS NULL ORDER BY c.created_at DESC LIMIT 1`, email);
  const row = mem && await q1(env, 'SELECT * FROM login_codes WHERE member_id = ?', mem.id);
  // однакова відповідь для всіх невдач: не розкриваємо, чи є така пошта
  if (!row || row.expires_at < Date.now() || row.attempts >= 5) throw new HttpError(401, 'bad_code');
  if ((await sha256(code + ':' + mem.id)) !== row.code_hash) { await run(env, 'UPDATE login_codes SET attempts = attempts + 1 WHERE member_id = ?', mem.id); throw new HttpError(401, 'bad_code'); }
  await run(env, 'DELETE FROM login_codes WHERE member_id = ?', mem.id);
  const sess = randomToken(32);
  await run(env, 'INSERT INTO sessions (token_hash, member_id, expires_at) VALUES (?,?,?)', await sha256(sess), mem.id, Date.now() + SESSION_TTL);
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie(sess, SESSION_TTL / 1000, env.DEV !== '1') });
}

/** Країна за заголовком Cloudflare (CF-IPCountry) та рекомендована мова: Україна → українська, решта світу → англійська. */
export function detectLocale(request) {
  const c = String(request.headers.get('CF-IPCountry') || '').toUpperCase();
  const country = /^[A-Z]{2}$/.test(c) && c !== 'XX' && c !== 'T1' ? c : null;
  const accept = String(request.headers.get('Accept-Language') || '').toLowerCase();
  const lang = country ? (country === 'UA' ? 'uk' : 'en') : (/^uk\b|,\s*uk\b/.test(accept) ? 'uk' : 'en');
  return { country, lang };
}

/** Публічний конфіг: ціна (грн), валюта показу для країни (?country=XX або визначеної за IP) і курс. */
async function configResponse(request, env) {
  const url = new URL(request.url), det = detectLocale(request);
  const asked = (url.searchParams.get('country') || '').toUpperCase(), cc = /^[A-Z]{2}$/.test(asked) ? asked : (det.country || 'UA');
  const st = await getSettings(env), fx = await getFx(env), p = await getPrices(env), eur = cc !== 'UA';
  // ціна у валюті країни: гривня для України, євро для решти; eurInvoice=false означає, що Monobank не приймає євро й оплата піде в гривнях за курсом
  return json({ price: eur ? p.eur : p.uah, currency: { code: eur ? 'EUR' : 'UAH', rate: 1 }, prices: { uah: p.uah, eur: p.eur }, uahPerEur: p.uahPerEur, eurInvoice: !(await eurInvoiceOff(env)),
    usdRate: st.usd_rate, detected: det, country: cc, fxUpdated: fx ? fx.updated : null,
    regions: REGIONS, turnstileSiteKey: env.TURNSTILE_SITE_KEY || null, googleClientId: env.GOOGLE_CLIENT_ID || null });
}

// ---------- Рекомендації закладів за публічними рейтингами (лише після відповіді на питання дня) ----------
async function placesFor(env, mem, d, kind) {
  if (!(d >= 1 && d <= DAYS) || d > todayIndex(mem.start_date, nowOf(env), mem.tz)) throw new HttpError(403, 'not_yet');
  if (!mem.schedule_json) throw new HttpError(409, 'not_ready');
  const answered = await q1(env, 'SELECT 1 AS x FROM answers WHERE member_id = ? AND day = ?', mem.id, d);
  if (!answered) throw new HttpError(403, 'answer_first');
  const plan = JSON.parse(mem.schedule_json).days[d];
  if (kind === 'gift') { // «де купити поблизу»: лише власна база (Google не використовуємо, щоб не множити платні запити)
    const places = await venuePicks(env, { country: mem.country, city: mem.city, cat: catOfGift(GIFTS[plan.gift[mem.slot]].q), seedKey: mem.id + ':g' + d, lang: mem.lang });
    return { ok: true, places };
  }
  const query = placesQuery(ACTIVITIES[plan.act], mem.city, mem.lang);
  let places = query ? await recommend(env, { query, lang: mem.lang, country: mem.country, memberId: mem.id, day: d }) : [];
  if (!places.length) places = await venuePicks(env, { country: mem.country, city: mem.city, cat: catOfQuery(ACTIVITIES[plan.act].q), seedKey: mem.id + ':' + d, lang: mem.lang }); // власна база (OpenStreetMap + оцінки користувачів)
  return { ok: true, places };
}
