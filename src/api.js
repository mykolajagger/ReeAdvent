import { GIFTS, INTIMATE, ACTIVITIES, QUESTIONS, REGIONS, generateSchedule, sanitizeSurvey, giftView, intimView, actView } from './logic.js';
import { createInvoice, verifyPaid } from './payments.js';
import { verifyTurnstile } from './turnstile.js';
import { findPromo, priceWith, rateLimit, normCode } from './promo.js';
import { sendEmail, welcomeEmail, loginEmail } from './email.js';
import { json, HttpError, randomToken, uid, sha256, parseCookies, sessionCookie, EMAIL_RE, normEmail, cleanText, nowOf, tomorrowStr, fromDateStr, toDateStr, todayIndex, windowDates, DAYS, UNLOCK_HOUR } from './util.js';

const MAX_START_DAYS = 90; // найдальша дата старту від завтрашнього дня

const LOGIN_TTL = 30 * 60e3, WELCOME_TTL = 7 * 24 * 3600e3, SESSION_TTL = 60 * 24 * 3600e3;

export async function handle(request, env) {
  try {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '');
    const m = request.method;
    if (m === 'GET' && path === '/api/config') return json({ price: Number(env.PRICE_UAH), currency: 'UAH', regions: REGIONS, turnstileSiteKey: env.TURNSTILE_SITE_KEY || null });
    if (m === 'POST' && path === '/api/orders') return await createOrder(request, env);
    if (m === 'POST' && path === '/api/promo/check') return await promoCheck(request, env);
    let r;
    if (m === 'GET' && (r = path.match(/^\/api\/orders\/([\w-]+)\/status$/))) return await orderStatus(env, r[1]);
    if (m === 'GET' && (r = path.match(/^\/api\/dev\/pay\/([\w-]+)$/))) return await devPay(env, r[1]);
    if (m === 'GET' && path === '/api/health') return await health(env);
    if (m === 'GET' && path === '/api/admin/outbox') return await adminOutbox(request, env);
    if (m === 'POST' && path === '/api/payments/monobank/webhook') return await monoWebhook(request, env);
    if (m === 'POST' && path === '/api/auth/request') return await authRequest(request, env);
    if (m === 'POST' && path === '/api/auth/verify') return await authVerify(request, env);
    if (m === 'POST' && path === '/api/auth/logout') return await authLogout(request, env);

    // Далі — тільки для авторизованих
    const member = await requireMember(request, env);
    if (m === 'GET' && path === '/api/state') return json(await stateOf(env, member));
    if (m === 'POST' && path === '/api/survey') return json(await saveSurvey(request, env, member));
    if (m === 'GET' && (r = path.match(/^\/api\/day\/(\d+)$/))) return json(await getDay(env, member, +r[1]));
    if (m === 'POST' && path === '/api/answer') return json(await saveAnswer(request, env, member));
    if (m === 'POST' && path === '/api/mark') return json(await mark(request, env, member));
    throw new HttpError(404, 'not_found');
  } catch (e) {
    if (e instanceof HttpError) return json({ ok: false, error: e.code }, e.status);
    if (e && e.status && e.code) return json({ ok: false, error: e.code }, e.status);
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
    start_date: String(b.startDate || '')
  };
  if (!o.name_a || !o.name_b) throw new HttpError(400, 'bad_names');
  if (!EMAIL_RE.test(o.email_a) || !EMAIL_RE.test(o.email_b)) throw new HttpError(400, 'bad_email');
  if (o.email_a === o.email_b) throw new HttpError(400, 'same_email');
  if (!o.city) throw new HttpError(400, 'bad_city');
  if (!REGIONS.includes(o.region)) throw new HttpError(400, 'bad_region');
  // дата старту: від завтра (за Києвом) до +90 днів
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.start_date) || toDateStr(fromDateStr(o.start_date)) !== o.start_date) throw new HttpError(400, 'bad_date');
  const minStart = fromDateStr(tomorrowStr(nowOf(env))), ds = fromDateStr(o.start_date);
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
  const price = priceWith(env, promo);
  const order = { id: uid(), amount_kop: price.final, ...o };
  const free = price.final === 0;
  const inv = free ? { invoiceId: 'free_' + order.id, pageUrl: `${env.BASE_URL}/thanks.html?order=${order.id}` } : await createInvoice(env, order);
  await run(env, `INSERT INTO orders (id, created_at, status, amount_kop, list_kop, discount_kop, promo_code, promo_id, name_a, email_a, name_b, email_b, city, region, start_date, payer_email, invoice_id, consent_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, order.id, Date.now(), 'pending', price.final, price.list, price.discount, promo ? promo.code : null, promo ? promo.id : null,
    o.name_a, o.email_a, o.name_b, o.email_b, o.city, o.region, o.start_date, o.payer_email, inv.invoiceId, Date.now());
  if (free) await markPaid(env, order.id); // 100% знижка: календар створюється одразу, без оплати
  return json({ ok: true, orderId: order.id, payUrl: inv.pageUrl, free, amountKop: price.final });
}

async function promoCheck(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  if (!(await rateLimit(env, 'promo:' + ip, 20, 600))) throw new HttpError(429, 'too_many');
  const b = await readJson(request);
  const r = await findPromo(env, b.code);
  const list = priceWith(env, null);
  if (r.error) return json({ ok: true, valid: false, reason: r.error, listKop: list.list });
  const price = priceWith(env, r.promo);
  return json({ ok: true, valid: true, code: r.promo.code, listKop: price.list, discountKop: price.discount, finalKop: price.final, type: r.promo.type, value: r.promo.value });
}

async function orderStatus(env, id) {
  const o = await q1(env, 'SELECT status FROM orders WHERE id = ?', id);
  if (!o) throw new HttpError(404, 'not_found');
  return json({ ok: true, status: o.status });
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

async function monoWebhook(request, env) {
  const b = await readJson(request);
  const invoiceId = String(b.invoiceId || '');
  const o = await q1(env, 'SELECT * FROM orders WHERE invoice_id = ?', invoiceId);
  if (!o) return json({ ok: true }); // невідомий інвойс — ігноруємо, але відповідаємо 200
  if (o.status === 'paid') return json({ ok: true });
  if (await verifyPaid(env, invoiceId, o.amount_kop)) await markPaid(env, o.id);
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
  const tomorrow = tomorrowStr(nowOf(env));
  const startDate = fromDateStr(o.start_date) >= fromDateStr(tomorrow) ? o.start_date : tomorrow;
  const calId = uid(), now = Date.now();
  const mA = uid(), mB = uid();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO calendars (id, order_id, created_at, city, region, start_date) VALUES (?,?,?,?,?,?)').bind(calId, orderId, now, o.city, o.region, startDate),
    env.DB.prepare('INSERT INTO members (id, calendar_id, email, slot, suggested_name) VALUES (?,?,?,?,?)').bind(mA, calId, o.email_a, 0, o.name_a),
    env.DB.prepare('INSERT INTO members (id, calendar_id, email, slot, suggested_name) VALUES (?,?,?,?,?)').bind(mB, calId, o.email_b, 1, o.name_b)
  ]);
  for (const [mid, email, name, partner] of [[mA, o.email_a, o.name_a, o.name_b], [mB, o.email_b, o.name_b, o.name_a]]) {
    const link = await issueLoginLink(env, mid, WELCOME_TTL);
    const mail = welcomeEmail(env, name, partner, startDate, link);
    await sendEmail(env, email, mail.subject, mail.html, mail.text);
  }
}

// ---------- Авторизація (посилання на пошту) ----------
async function issueLoginLink(env, memberId, ttl) {
  const token = randomToken(32);
  await run(env, 'INSERT INTO login_tokens (token_hash, member_id, created_at, expires_at) VALUES (?,?,?,?)', await sha256(token), memberId, Date.now(), Date.now() + ttl);
  return `${env.BASE_URL}/app/#login=${token}`;
}

async function authRequest(request, env) {
  const b = await readJson(request);
  const email = normEmail(b.email);
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'bad_email');
  // найновіший календар, де ця пошта — учасник
  const mem = await q1(env, `SELECT m.id, m.suggested_name, m.survey_json FROM members m JOIN calendars c ON c.id = m.calendar_id WHERE m.email = ? ORDER BY c.created_at DESC LIMIT 1`, email);
  if (mem) {
    const recent = await q1(env, 'SELECT COUNT(*) AS n FROM login_tokens WHERE member_id = ? AND created_at > ?', mem.id, Date.now() - 3600e3);
    if (recent.n < 5) {
      const mail = loginEmail(env, mem.survey_json ? JSON.parse(mem.survey_json).name : mem.suggested_name, await issueLoginLink(env, mem.id, LOGIN_TTL));
      await sendEmail(env, email, mail.subject, mail.html, mail.text);
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
  const mem = await q1(env, `SELECT m.*, c.city, c.region, c.start_date, c.schedule_json FROM members m JOIN calendars c ON c.id = m.calendar_id WHERE m.id = ?`, s.member_id);
  if (!mem) throw new HttpError(401, 'auth');
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
    today: todayIndex(mem.start_date, nowOf(env)), startDate: mem.start_date, unlockHour: UNLOCK_HOUR, totalDays: DAYS,
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
    const sched = generateSchedule(both.map(r => JSON.parse(r.survey_json)), 1 + Math.floor(Math.random() * 2147483646), windowDates(mem.start_date), mem.region);
    // умовне оновлення: якщо обидва зберегли одночасно, спрацює лише один
    await run(env, 'UPDATE calendars SET schedule_json = ? WHERE id = ? AND schedule_json IS NULL', JSON.stringify(sched), mem.calendar_id);
  }
  const fresh = await requireMemberById(env, mem.id);
  return stateOf(env, fresh);
}
const requireMemberById = (env, id) => q1(env, `SELECT m.*, c.city, c.region, c.start_date, c.schedule_json FROM members m JOIN calendars c ON c.id = m.calendar_id WHERE m.id = ?`, id);

async function getDay(env, mem, d) {
  if (!(d >= 1 && d <= DAYS)) throw new HttpError(400, 'bad_day');
  if (d > todayIndex(mem.start_date, nowOf(env))) throw new HttpError(403, 'not_yet');
  if (!mem.schedule_json) throw new HttpError(409, 'not_ready');
  const plan = JSON.parse(mem.schedule_json).days[d];
  const partner = await partnerOf(env, mem);
  const question = QUESTIONS[plan.q];
  const mine = await q1(env, 'SELECT text FROM answers WHERE member_id = ? AND day = ?', mem.id, d);
  // Спершу відповідь на питання дня: поки її немає, завдань сервер не віддає
  if (!mine) return { ok: true, day: d, needAnswer: true, forName: surveyName(partner), question: { text: question.text } };
  const theirs = await q1(env, 'SELECT text FROM answers WHERE member_id = ? AND day = ?', partner.id, d);
  await run(env, `INSERT INTO progress (member_id, day, opened) VALUES (?,?,1) ON CONFLICT(member_id, day) DO UPDATE SET opened = 1`, mem.id, d);
  const pr = await q1(env, 'SELECT * FROM progress WHERE member_id = ? AND day = ?', mem.id, d);
  return {
    ok: true, day: d, forName: surveyName(partner),
    question: { text: question.text, mine: mine.text, partner: theirs ? theirs.text : null },
    gift: giftView(GIFTS[plan.gift[mem.slot]], mem.city), intim: intimView(INTIMATE[plan.intim]), act: actView(ACTIVITIES[plan.act], mem.city),
    done: { gift: !!pr.done_gift, intim: !!pr.done_intim, act: !!pr.done_act }
  };
}

async function saveAnswer(request, env, mem) {
  const b = await readJson(request);
  const d = Math.round(Number(b.day));
  if (!(d >= 1 && d <= DAYS) || d > todayIndex(mem.start_date, nowOf(env))) throw new HttpError(400, 'bad_day');
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
  if (!(d >= 1 && d <= DAYS) || d > todayIndex(mem.start_date, nowOf(env))) throw new HttpError(400, 'bad_day');
  const col = { gift: 'done_gift', intim: 'done_intim', act: 'done_act' }[b.key];
  if (!col) throw new HttpError(400, 'bad_key');
  await run(env, `INSERT INTO progress (member_id, day, ${col}) VALUES (?,?,?) ON CONFLICT(member_id, day) DO UPDATE SET ${col} = excluded.${col}`, mem.id, d, b.done ? 1 : 0);
  return { ok: true };
}
