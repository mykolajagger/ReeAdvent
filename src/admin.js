// Адмін-API: /api/admin/*. Доступ лише за посиланням на пошту зі списку ADMIN_EMAILS.
// Менеджер НЕ бачить відповідей анкет і особистих відповідей на питання дня (обіцяно в політиці конфіденційності).
import { HttpError, json, randomToken, uid, sha256, parseCookies, EMAIL_RE, normEmail, cleanText, nowOf, todayIndex, windowDates, fromDateStr, localParts, toDateStr, tomorrowStr } from './util.js';
import { sendEmail, loginEmail, welcomeEmail, partnerInviteEmail, refundEmail, supportReplyEmail } from './email.js';
import { rateLimit, CODE_RE, normCode } from './promo.js';
import { generateSchedule } from './logic.js';
import { issueLoginLink, issueLoginCode, WELCOME_TTL_MS } from './api.js';
import { getSettings, saveSettings, getPriceUah } from './settings.js';
import { getFx, refreshFx } from './currency.js';
import { placesUsage } from './places.js';
import { publishNext as igPublishNext, publishStatus as igPublishStatus, setAuto as igSetAuto } from './igpublish.js';
import { saveToken as igSaveToken, disconnect as igDisconnect, igStatus, saveEmbeds as igSaveEmbeds, igTest } from './instagram.js';
import { venueStats, venueProblems, retryCities, queueCity, overpassProbe, setVenuesPaused, catalogCountries, catalogCities, catalogCity, setVenueHidden, mapUrl } from './venues.js';
import { cancelInvoice } from './payments.js';

const ADMIN_LOGIN_TTL = 30 * 60e3, ADMIN_SESSION_TTL = 14 * 24 * 3600e3;
const q1 = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).first();
const qa = async (env, sql, ...a) => (await env.DB.prepare(sql).bind(...a).all()).results;
const run = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).run();
const readJson = async req => { try { return await req.json(); } catch { throw new HttpError(400, 'bad_json'); } };

export const adminEmails = env => String(env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const adminCookie = (v, maxAge, secure) => `as=${encodeURIComponent(v)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
export const audit = (env, admin, action, target, detail) => run(env, 'INSERT INTO audit_log (at, admin_email, action, target, detail) VALUES (?,?,?,?,?)', Date.now(), admin, action, target || null, detail ? JSON.stringify(detail).slice(0, 1000) : null);

async function requireAdmin(request, env) {
  const t = parseCookies(request).as;
  if (!t) throw new HttpError(401, 'admin_auth');
  const s = await q1(env, 'SELECT email, expires_at FROM admin_sessions WHERE token_hash = ?', await sha256(t));
  if (!s || s.expires_at < Date.now() || !adminEmails(env).includes(s.email)) throw new HttpError(401, 'admin_auth');
  return s.email;
}

export async function handleAdmin(request, env, path, m) {
  const secure = env.DEV !== '1';
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  // --- вхід ---
  if (m === 'POST' && path === '/api/admin/auth/request') {
    if (!(await rateLimit(env, 'adminreq:' + ip, 10, 3600))) throw new HttpError(429, 'too_many');
    const email = normEmail((await readJson(request)).email);
    if (EMAIL_RE.test(email) && adminEmails(env).includes(email) && (await rateLimit(env, 'adminmail:' + email, 5, 3600))) {
      const token = randomToken(32);
      await run(env, 'INSERT INTO admin_tokens (token_hash, email, created_at, expires_at) VALUES (?,?,?,?)', await sha256(token), email, Date.now(), Date.now() + ADMIN_LOGIN_TTL);
      const mail = loginEmail(env, 'адміністраторе', `${env.BASE_URL}/admin/#login=${token}`);
      await sendEmail(env, email, 'Вхід в адмінку ReeAdvent', mail.html, mail.text);
    }
    return json({ ok: true });
  }
  if (m === 'POST' && path === '/api/admin/auth/verify') {
    const hash = await sha256(String((await readJson(request)).token || ''));
    const row = await q1(env, 'SELECT * FROM admin_tokens WHERE token_hash = ?', hash);
    if (!row || row.used_at || row.expires_at < Date.now() || !adminEmails(env).includes(row.email)) throw new HttpError(401, 'bad_token');
    const used = await run(env, 'UPDATE admin_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL', Date.now(), hash);
    if (!used.meta?.changes) throw new HttpError(401, 'bad_token');
    const sess = randomToken(32);
    await run(env, 'INSERT INTO admin_sessions (token_hash, email, expires_at) VALUES (?,?,?)', await sha256(sess), row.email, Date.now() + ADMIN_SESSION_TTL);
    await audit(env, row.email, 'login');
    return json({ ok: true }, 200, { 'set-cookie': adminCookie(sess, ADMIN_SESSION_TTL / 1000, secure) });
  }
  if (m === 'POST' && path === '/api/admin/auth/logout') {
    const t = parseCookies(request).as; if (t) await run(env, 'DELETE FROM admin_sessions WHERE token_hash = ?', await sha256(t));
    return json({ ok: true }, 200, { 'set-cookie': adminCookie('', 0, secure) });
  }

  const admin = await requireAdmin(request, env);
  // CSRF: усі зміни лише з нашого фронтенду (кастомний заголовок змушує CORS-preflight, який ми не дозволяємо)
  if (m !== 'GET' && request.headers.get('x-admin') !== '1') throw new HttpError(403, 'csrf');
  const url = new URL(request.url);
  let r;

  if (m === 'GET' && path === '/api/admin/me') return json({ ok: true, email: admin, price: await getPriceUah(env) });
  if (m === 'GET' && path === '/api/admin/settings') { const fx = await getFx(env); return json({ ok: true, settings: await getSettings(env), places: { enabled: !!env.GOOGLE_PLACES_KEY, used: await placesUsage(env) }, venues: { ...(await venueStats(env)), problems: await venueProblems(env) }, fx: fx ? { updated: fx.updated, usd: fx.rates.USD ? Math.round(1 / fx.rates.USD * 100) / 100 : null, eur: fx.rates.EUR ? Math.round(1 / fx.rates.EUR * 100) / 100 : null, count: Object.keys(fx.rates).length, mono: fx.sources ? fx.sources.mono : null } : null }); }
  if (m === 'POST' && path === '/api/admin/venues/retry') { const b = await readJson(request); const n = await retryCities(env, b.id ? Number(b.id) : null); await audit(env, admin, 'venues_retry', b.id || 'all', { n }); return json({ ok: true, n }); }
  if (m === 'POST' && path === '/api/admin/venues/pause') { const b = await readJson(request); await setVenuesPaused(env, !!b.paused); await audit(env, admin, 'venues_pause', null, { paused: !!b.paused }); return json({ ok: true, paused: !!b.paused }); }
  if (m === 'GET' && path === '/api/admin/venues/countries') return json({ ok: true, countries: await catalogCountries(env) });
  if (m === 'GET' && path === '/api/admin/venues/cities') return json({ ok: true, cities: await catalogCities(env, new URL(request.url).searchParams.get('country')) });
  if (m === 'GET' && (r = path.match(/^\/api\/admin\/venues\/city\/(\d+)$/))) { const x = await catalogCity(env, +r[1]); if (!x) throw new HttpError(404, 'not_found'); return json({ ok: true, ...x }); }
  if (m === 'POST' && path === '/api/admin/venues/hide') { const b = await readJson(request); const n = await setVenueHidden(env, Number(b.id), !!b.hidden); await audit(env, admin, b.hidden ? 'venue_hide' : 'venue_show', String(b.id), {}); return json({ ok: true, n }); }
  if (m === 'GET' && path === '/api/admin/instagram') return json({ ok: true, ...(await igStatus(env)) });
  if (m === 'POST' && path === '/api/admin/instagram/token') { const b = await readJson(request); const out = await igSaveToken(env, b.token, { igId: b.igId }); if (!out.ok) throw new HttpError(400, out.error); await audit(env, admin, 'instagram_connect', null, { username: out.username }); return json({ ok: true, ...(await igStatus(env)) }); }
  if (m === 'POST' && path === '/api/admin/instagram/embeds') { const b = await readJson(request); const list = await igSaveEmbeds(env, b.text); await audit(env, admin, 'instagram_embeds', null, { n: list.length }); return json({ ok: true, ...(await igStatus(env)) }); }
  if (m === 'GET' && path === '/api/admin/instagram/publish') return json({ ok: true, ...(await igPublishStatus(env)) });
  if (m === 'POST' && path === '/api/admin/instagram/publish') { const b = await readJson(request); const out = await igPublishNext(env, { only: b.id || null }); await audit(env, admin, 'instagram_publish', null, { ok: out.ok, id: out.id || null }); return json({ ...out, ...(await igPublishStatus(env)), ok: out.ok, error: out.error }); }
  if (m === 'POST' && path === '/api/admin/instagram/auto') { const b = await readJson(request); await igSetAuto(env, !!b.on); await audit(env, admin, 'instagram_auto', null, { on: !!b.on }); return json({ ok: true, ...(await igPublishStatus(env)) }); }
  if (m === 'POST' && path === '/api/admin/instagram/test') return json({ ok: true, ...(await igTest(env)), status2: await igStatus(env) });
  if (m === 'POST' && path === '/api/admin/instagram/disconnect') { await igDisconnect(env); await audit(env, admin, 'instagram_disconnect', null, {}); return json({ ok: true, ...(await igStatus(env)) }); }
  if (m === 'POST' && path === '/api/admin/venues/test') return json({ ok: true, probe: await overpassProbe() });
  if (m === 'POST' && path === '/api/admin/venues/add') { const b = await readJson(request); if (!(await queueCity(env, b.country, b.name))) throw new HttpError(400, 'bad_city'); await audit(env, admin, 'venues_add', null, { country: b.country, name: b.name }); return json({ ok: true }); }
  if (m === 'POST' && path === '/api/admin/fx/refresh') { const r = await refreshFx(env, { force: true }); await audit(env, admin, 'fx_refresh', null, r); if (!r.ok) throw Object.assign(new HttpError(502, 'fx_failed'), { detail: r.error }); return json({ ok: true, ...r }); }
  if (m === 'POST' && path === '/api/admin/settings') { const saved = await saveSettings(env, await readJson(request)); await audit(env, admin, 'settings', null, saved); return json({ ok: true, settings: await getSettings(env) }); }
  if (m === 'GET' && path === '/api/admin/dashboard') return json({ ok: true, ...(await dashboard(env, url.searchParams.get('days') || '30')) });
  if (m === 'GET' && path === '/api/admin/orders') return json({ ok: true, ...(await listOrders(env, url)) });
  if (m === 'GET' && (r = path.match(/^\/api\/admin\/orders\/([\w-]+)$/))) return json({ ok: true, ...(await orderDetail(env, r[1])) });
  if (m === 'POST' && (r = path.match(/^\/api\/admin\/orders\/([\w-]+)\/(update|resend|refund|note)$/))) return json(await orderAction(request, env, admin, r[1], r[2]));
  if (m === 'GET' && path === '/api/admin/customers') return json({ ok: true, customers: await customers(env, url.searchParams.get('q') || '') });
  if (m === 'GET' && path === '/api/admin/customers.csv') {
    const rows = await customers(env, '');
    await audit(env, admin, 'export_customers', null, { count: rows.length });
    return csvResponse('customers.csv', ['email', 'імена', 'замовлень', 'сплачено_грн', 'останнє_замовлення', 'міста'], rows.map(c => [c.email, c.names, c.orders, (c.paid_kop / 100).toFixed(2), new Date(c.last_at).toISOString().slice(0, 10), c.cities]));
  }
  if (m === 'GET' && path === '/api/admin/promos') return json({ ok: true, promos: await listPromos(env), price: await getPriceUah(env) });
  if (m === 'POST' && path === '/api/admin/promos') return json(await createPromo(request, env, admin));
  if (m === 'POST' && (r = path.match(/^\/api\/admin\/promos\/([\w-]+)$/))) return json(await updatePromo(request, env, admin, r[1]));
  if (m === 'GET' && path === '/api/admin/audit') return json({ ok: true, rows: await qa(env, 'SELECT * FROM audit_log ORDER BY id DESC LIMIT 200') });
  if (m === 'GET' && path === '/api/admin/inbox') return json({ ok: true, threads: await inboxList(env, url.searchParams.get('status') || 'open') });
  if (m === 'GET' && (r = path.match(/^\/api\/admin\/inbox\/thread\/(.+)$/))) return json({ ok: true, ...(await inboxThread(env, normEmail(decodeURIComponent(r[1])))) });
  if (m === 'POST' && (r = path.match(/^\/api\/admin\/inbox\/thread\/(.+)\/(reply|status)$/))) return json(await inboxAction(request, env, admin, normEmail(decodeURIComponent(r[1])), r[2]));
  throw new HttpError(404, 'not_found');
}

// ---------- CSV ----------
const csvCell = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function csvResponse(name, head, rows) {
  const body = '﻿' + [head, ...rows].map(r => r.map(csvCell).join(',')).join('\n');
  return new Response(body, { status: 200, headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store' } });
}

// ---------- Замовлення ----------
const esc = s => String(s).replace(/[\\%_]/g, c => '\\' + c);
function statusOf(o) { if (o.refunded_at) return 'refunded'; if (o.paid_at) return 'paid'; return Date.now() - o.created_at > 3600e3 ? 'abandoned' : 'pending'; }

async function listOrders(env, url) {
  const status = url.searchParams.get('status') || 'all', q = (url.searchParams.get('q') || '').trim().slice(0, 80);
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1), limit = 50;
  const where = [], args = [];
  if (status === 'paid') where.push('paid_at IS NOT NULL AND refunded_at IS NULL');
  else if (status === 'refunded') where.push('refunded_at IS NOT NULL');
  else if (status === 'pending') where.push('paid_at IS NULL AND created_at > ?'), args.push(Date.now() - 3600e3);
  else if (status === 'abandoned') where.push('paid_at IS NULL AND created_at <= ?'), args.push(Date.now() - 3600e3);
  const promo = url.searchParams.get('promo'); if (promo) where.push('promo_code = ?'), args.push(normCode(promo));
  if (q) { const like = '%' + esc(q) + '%'; where.push("(email_a LIKE ? ESCAPE '\\' OR email_b LIKE ? ESCAPE '\\' OR name_a LIKE ? ESCAPE '\\' OR name_b LIKE ? ESCAPE '\\' OR city LIKE ? ESCAPE '\\' OR id = ?)"); args.push(like, like, like, like, like, q); }
  const W = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = (await q1(env, `SELECT COUNT(*) AS n FROM orders ${W}`, ...args)).n;
  const rows = await qa(env, `SELECT id, created_at, paid_at, refunded_at, amount_kop, list_kop, discount_kop, promo_code, name_a, email_a, name_b, email_b, city, region, start_date FROM orders ${W} ORDER BY created_at DESC LIMIT ? OFFSET ?`, ...args, limit, (page - 1) * limit);
  return { total, page, pages: Math.max(1, Math.ceil(total / limit)), orders: rows.map(o => ({ ...o, status: statusOf(o) })) };
}

async function orderDetail(env, id) {
  const o = await q1(env, 'SELECT * FROM orders WHERE id = ?', id);
  if (!o) throw new HttpError(404, 'not_found');
  const cal = await q1(env, 'SELECT id, start_date, (schedule_json IS NOT NULL) AS ready FROM calendars WHERE order_id = ?', id);
  let members = [];
  if (cal) {
    members = await qa(env, 'SELECT id, slot, email, suggested_name, (survey_json IS NOT NULL) AS survey_done FROM members WHERE calendar_id = ? ORDER BY slot', cal.id);
    for (const mem of members) {
      const p = await q1(env, 'SELECT COALESCE(SUM(opened),0) AS opened, COALESCE(SUM(done_gift+done_intim+done_act),0) AS done FROM progress WHERE member_id = ?', mem.id);
      const a = await q1(env, 'SELECT COUNT(*) AS n FROM answers WHERE member_id = ?', mem.id);
      mem.opened_days = p.opened; mem.tasks_done = p.done; mem.answers_count = a.n; mem.survey_done = !!mem.survey_done;
    }
  }
  const log = await qa(env, "SELECT at, admin_email, action, detail FROM audit_log WHERE target = ? ORDER BY id DESC LIMIT 30", id);
  const threads = await qa(env, 'SELECT email, status, unread, last_at, last_subject FROM threads WHERE email IN (?, ?)', o.email_a, o.email_b);
  return { order: { ...o, status: statusOf(o) }, calendar: cal ? { ...cal, ready: !!cal.ready, today: todayIndex(cal.start_date, nowOf(env)) } : null, members, log, threads };
}

async function orderAction(request, env, admin, id, action) {
  const b = await readJson(request);
  const o = await q1(env, 'SELECT * FROM orders WHERE id = ?', id);
  if (!o) throw new HttpError(404, 'not_found');
  const cal = await q1(env, 'SELECT * FROM calendars WHERE order_id = ?', id);
  const members = cal ? await qa(env, 'SELECT * FROM members WHERE calendar_id = ? ORDER BY slot', cal.id) : [];

  if (action === 'note') {
    await run(env, 'UPDATE orders SET note = ? WHERE id = ?', cleanText(b.note, 1000) || null, id);
    await audit(env, admin, 'note', id);
    return { ok: true };
  }
  if (action === 'resend') {
    if (!cal) throw new HttpError(409, 'no_calendar');
    const slots = b.slot === 0 || b.slot === 1 ? [b.slot] : [0, 1];
    for (const s of slots) {
      const mem = members[s], partner = members[1 - s];
      const link = await issueLoginLink(env, mem.id, WELCOME_TTL_MS), code = await issueLoginCode(env, mem.id, WELCOME_TTL_MS);
      const mail = s === 0 ? welcomeEmail(env, mem.suggested_name, partner.suggested_name, cal.start_date, link, cal.lang, code) : partnerInviteEmail(env, mem.suggested_name, partner.suggested_name, cal.start_date, link, cal.lang, code);
      await sendEmail(env, mem.email, mail.subject, mail.html, mail.text);
    }
    await audit(env, admin, 'resend_access', id, { slots });
    return { ok: true };
  }
  if (action === 'refund') {
    if (!o.paid_at) throw new HttpError(409, 'not_paid');
    if (o.refunded_at) throw new HttpError(409, 'already_refunded');
    const amount = b.amountKop == null ? o.amount_kop : Math.round(Number(b.amountKop));
    if (!(amount >= 0 && amount <= o.amount_kop)) throw new HttpError(400, 'bad_amount');
    // спосіб: автоматично через Monobank (за замовчуванням для платних замовлень) або лише відмітка
    const auto = b.method !== 'manual' && env.PAYMENT_MODE === 'monobank' && amount > 0 && o.invoice_id && !String(o.invoice_id).startsWith('free_');
    let refundStatus = 'manual', refundRef = null;
    if (auto) {
      refundRef = 'refund_' + o.id;
      const r = await cancelInvoice(env, o.invoice_id, amount, refundRef);
      if (!r.ok || r.status === 'failure') { const e = new HttpError(502, 'refund_failed'); e.detail = String(r.error || 'failure').slice(0, 200); throw e; }
      refundStatus = r.status || 'processing';
    }
    await run(env, 'UPDATE orders SET refunded_at = ?, refund_kop = ?, refund_status = ?, refund_ref = ? WHERE id = ?', Date.now(), amount, refundStatus, refundRef, id);
    if (b.revoke !== false) for (const mem of members) await run(env, 'DELETE FROM sessions WHERE member_id = ?', mem.id); // доступ закривається
    if (b.notify !== false && amount > 0) { // повідомлення покупцю (не критично, якщо не вдалось)
      try { const mail = refundEmail(env, `${(amount / 100).toLocaleString('uk-UA', { minimumFractionDigits: amount % 100 ? 2 : 0 })} ₴`, o.lang || 'uk'); await sendEmail(env, o.payer_email || o.email_a, mail.subject, mail.html, mail.text); } catch (e) { console.error('refund email failed', e); }
    }
    await audit(env, admin, 'refund', id, { amountKop: amount, method: auto ? 'monobank_api' : 'manual', status: refundStatus, revoke: b.revoke !== false, note: cleanText(b.note, 300) });
    return { ok: true, method: auto ? 'api' : 'manual', status: refundStatus };
  }
  // update: дата старту й контакти
  const patch = {};
  if (b.nameA != null) patch.name_a = cleanText(b.nameA, 30);
  if (b.nameB != null) patch.name_b = cleanText(b.nameB, 30);
  if (b.emailA != null) patch.email_a = normEmail(b.emailA);
  if (b.emailB != null) patch.email_b = normEmail(b.emailB);
  for (const k of ['name_a', 'name_b']) if (k in patch && !patch[k]) throw new HttpError(400, 'bad_names');
  for (const k of ['email_a', 'email_b']) if (k in patch && !EMAIL_RE.test(patch[k])) throw new HttpError(400, 'bad_email');
  const ea = patch.email_a ?? o.email_a, eb = patch.email_b ?? o.email_b;
  if (ea === eb) throw new HttpError(400, 'same_email');
  let newStart = null;
  if (b.startDate != null && b.startDate !== (cal ? cal.start_date : o.start_date)) {
    const d = String(b.startDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || toDateStr(fromDateStr(d)) !== d) throw new HttpError(400, 'bad_date');
    if (cal && todayIndex(cal.start_date, nowOf(env)) > 0) throw new HttpError(409, 'already_started'); // дату можна міняти лише до старту
    newStart = d; patch.start_date = d;
  }
  const keys = Object.keys(patch);
  if (!keys.length) return { ok: true, changed: [] };
  await run(env, `UPDATE orders SET ${keys.map(k => k + ' = ?').join(', ')} WHERE id = ?`, ...keys.map(k => patch[k]), id);
  const emailChanged = [];
  if (cal) {
    if (newStart) {
      await run(env, 'UPDATE calendars SET start_date = ? WHERE id = ?', newStart, cal.id);
      if (cal.schedule_json) { // свята прив'язані до дат і вихідні — перераховуємо розклад з тим самим зерном
        const surveys = members.map(x => x.survey_json && JSON.parse(x.survey_json));
        if (surveys.every(Boolean)) await run(env, 'UPDATE calendars SET schedule_json = ? WHERE id = ?', JSON.stringify(generateSchedule(surveys, JSON.parse(cal.schedule_json).seed, windowDates(newStart), cal.region, cal.country || 'UA')), cal.id);
      }
    }
    for (const [i, em, nm] of [[0, patch.email_a, patch.name_a], [1, patch.email_b, patch.name_b]]) {
      const mem = members[i];
      if (nm) await run(env, 'UPDATE members SET suggested_name = ? WHERE id = ?', nm, mem.id);
      if (em && em !== mem.email) {
        await run(env, 'UPDATE members SET email = ? WHERE id = ?', em, mem.id);
        await run(env, 'DELETE FROM sessions WHERE member_id = ?', mem.id); await run(env, 'DELETE FROM login_tokens WHERE member_id = ?', mem.id);
        const partner = members[1 - i], link = await issueLoginLink(env, mem.id, WELCOME_TTL_MS), code = await issueLoginCode(env, mem.id, WELCOME_TTL_MS);
        const nameMe = nm || mem.suggested_name, namePartner = (i === 0 ? patch.name_b : patch.name_a) || partner.suggested_name;
        const mail = i === 0 ? welcomeEmail(env, nameMe, namePartner, newStart || cal.start_date, link, cal.lang, code) : partnerInviteEmail(env, nameMe, namePartner, newStart || cal.start_date, link, cal.lang, code);
        await sendEmail(env, em, mail.subject, mail.html, mail.text);
        emailChanged.push(i);
      }
    }
  }
  await audit(env, admin, 'update_order', id, { changed: keys, from: { start: cal?.start_date || o.start_date, email_a: o.email_a, email_b: o.email_b }, to: patch });
  return { ok: true, changed: keys, emailsReissued: emailChanged };
}

// ---------- Клієнти ----------
async function customers(env, q) {
  const like = '%' + esc(q.trim().slice(0, 80)) + '%';
  const rows = await qa(env, `SELECT email, GROUP_CONCAT(DISTINCT name) AS names, COUNT(*) AS orders, COALESCE(SUM(CASE WHEN paid_at IS NOT NULL AND refunded_at IS NULL THEN amount_kop ELSE 0 END),0) AS paid_kop, MAX(created_at) AS last_at, GROUP_CONCAT(DISTINCT city) AS cities
    FROM (SELECT email_a AS email, name_a AS name, city, amount_kop, paid_at, refunded_at, created_at FROM orders UNION ALL SELECT email_b, name_b, city, 0, paid_at, refunded_at, created_at FROM orders)
    WHERE email LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\' GROUP BY email ORDER BY last_at DESC LIMIT 1000`, like, like);
  return rows;
}

// ---------- Промокоди ----------
async function listPromos(env) {
  const rows = await qa(env, `SELECT p.*, (SELECT COUNT(*) FROM orders o WHERE o.promo_id = p.id AND o.paid_at IS NOT NULL) AS paid_orders,
    (SELECT COALESCE(SUM(o.discount_kop),0) FROM orders o WHERE o.promo_id = p.id AND o.paid_at IS NOT NULL) AS discount_kop,
    (SELECT COALESCE(SUM(o.amount_kop),0) FROM orders o WHERE o.promo_id = p.id AND o.paid_at IS NOT NULL AND o.refunded_at IS NULL) AS revenue_kop
    FROM promo_codes p ORDER BY created_at DESC`);
  return rows;
}
function parsePromoBody(b, env, partial) {
  const out = {};
  if (!partial || b.code != null) { const c = normCode(b.code); if (!CODE_RE.test(c)) throw new HttpError(400, 'bad_code'); out.code = c; }
  if (!partial || b.type != null) { if (!['percent', 'fixed'].includes(b.type)) throw new HttpError(400, 'bad_type'); out.type = b.type; }
  if (!partial || b.value != null) {
    const type = out.type || b.type, v = Number(b.value);
    if (type === 'percent') { if (!(Number.isInteger(v) && v >= 1 && v <= 100)) throw new HttpError(400, 'bad_value'); out.value = v; }
    else { if (!(v > 0 && v <= 100000)) throw new HttpError(400, 'bad_value'); out.value = Math.round(v * 100); } // у запиті гривні -> копійки
  }
  if (b.maxUses !== undefined) { if (b.maxUses === null || b.maxUses === '') out.max_uses = null; else { const n = Number(b.maxUses); if (!(Number.isInteger(n) && n >= 1)) throw new HttpError(400, 'bad_max'); out.max_uses = n; } }
  for (const [k, col] of [['startsAt', 'starts_at'], ['expiresAt', 'expires_at']]) if (b[k] !== undefined) { if (b[k] === null || b[k] === '') out[col] = null; else { const t = Date.parse(b[k]); if (isNaN(t)) throw new HttpError(400, 'bad_date'); out[col] = t; } }
  if (b.label !== undefined) out.label = cleanText(b.label, 80) || null;
  if (b.active !== undefined) out.active = b.active ? 1 : 0;
  return out;
}
async function createPromo(request, env, admin) {
  const b = await readJson(request), p = parsePromoBody(b, env, false);
  if (await q1(env, 'SELECT 1 AS x FROM promo_codes WHERE code = ?', p.code)) throw new HttpError(409, 'code_exists');
  const id = uid();
  await run(env, 'INSERT INTO promo_codes (id, code, type, value, max_uses, starts_at, expires_at, active, label, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', id, p.code, p.type, p.value, p.max_uses ?? null, p.starts_at ?? null, p.expires_at ?? null, p.active ?? 1, p.label ?? null, Date.now());
  await audit(env, admin, 'promo_create', id, { code: p.code, type: p.type, value: p.value });
  return { ok: true, id };
}
async function updatePromo(request, env, admin, id) {
  const b = await readJson(request);
  if (!(await q1(env, 'SELECT 1 AS x FROM promo_codes WHERE id = ?', id))) throw new HttpError(404, 'not_found');
  const p = parsePromoBody({ ...b, code: undefined, type: undefined, value: undefined }, env, true); // код, тип і значення після створення не міняються
  const keys = Object.keys(p); if (!keys.length) return { ok: true };
  await run(env, `UPDATE promo_codes SET ${keys.map(k => k + ' = ?').join(', ')} WHERE id = ?`, ...keys.map(k => p[k]), id);
  await audit(env, admin, 'promo_update', id, p);
  return { ok: true };
}

// ---------- Дашборд ----------
export async function dashboard(env, daysParam) {
  const days = daysParam === 'all' ? null : [7, 30, 90, 365].includes(Number(daysParam)) ? Number(daysParam) : 30;
  const now = Date.now(), since = days ? now - days * 864e5 : 0; // мітки часу замовлень — реальні, тому й «зараз» реальне
  const st = await getSettings(env), taxPct = st.tax_percent + st.military_percent;
  const created = await qa(env, 'SELECT id, status, paid_at, created_at FROM orders WHERE created_at >= ?', since);
  const paid = await qa(env, 'SELECT * FROM orders WHERE paid_at >= ? ORDER BY paid_at', since);
  const sum = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0);
  const list = sum(paid, o => o.list_kop ?? o.amount_kop), discount = sum(paid, o => o.discount_kop), revenue = sum(paid, o => o.amount_kop);
  const refunds = sum(paid.filter(o => o.refunded_at), o => o.refund_kop);
  const netRevenue = revenue - refunds;
  // Комісія Monobank: 1,3% з українських карток, 2% з іноземних (країну замовлення беремо як ознаку). Повернення в день оплати комісію знімає;
  // повернення в інший день комісію НЕ повертає (покупець отримує повну суму, комісію несемо ми).
  const kyivDay = ms => { const p = localParts(new Date(ms)); return `${p.y}-${p.m}-${p.d}`; };
  let fee = 0;
  for (const o of paid) {
    if (o.amount_kop <= 0) continue;
    if (o.refunded_at && kyivDay(o.paid_at) === kyivDay(o.refunded_at)) continue;
    fee += Math.round(o.amount_kop * ((o.country && o.country !== 'UA') ? st.fee_foreign_percent : st.fee_percent) / 100);
  }
  const tax = Math.round(netRevenue * taxPct / 100);
  const paidCount = paid.length, freeCount = paid.filter(o => o.amount_kop === 0).length;
  const createdPaid = created.filter(o => o.paid_at).length;
  const pending = created.filter(o => !o.paid_at && now - o.created_at <= 3600e3).length, abandoned = created.filter(o => !o.paid_at && now - o.created_at > 3600e3).length;

  // серія по днях (за Києвом)
  const byDay = new Map();
  for (const o of paid) { const p = localParts(new Date(o.paid_at)); const k = toDateStr(Math.floor(Date.UTC(p.y, p.m - 1, p.d) / 864e5)); const e = byDay.get(k) || { date: k, revenue_kop: 0, orders: 0 }; e.revenue_kop += o.amount_kop - (o.refund_kop || 0); e.orders++; byDay.set(k, e); }
  const fill = []; // безперервна серія, нулі там, де не було продажів
  if (paid.length || days) {
    const to = (() => { const p = localParts(new Date(now)); return Math.floor(Date.UTC(p.y, p.m - 1, p.d) / 864e5); })();
    const from = days ? to - (days - 1) : (paid.length ? Math.floor(Date.UTC(...(p => [p.y, p.m - 1, p.d])(localParts(new Date(paid[0].paid_at)))) / 864e5) : to);
    for (let d = from; d <= to; d++) { const k = toDateStr(d); fill.push(byDay.get(k) || { date: k, revenue_kop: 0, orders: 0 }); }
  }

  const group = (arr, key) => { const m = new Map(); for (const o of arr) { const k = key(o) || '—'; const e = m.get(k) || { name: k, orders: 0, revenue_kop: 0 }; e.orders++; e.revenue_kop += o.amount_kop - (o.refund_kop || 0); m.set(k, e); } return [...m.values()].sort((a, b) => b.orders - a.orders || b.revenue_kop - a.revenue_kop); };
  const byRegion = group(paid, o => o.region).slice(0, 10), byCity = group(paid, o => o.city.trim()).slice(0, 10);
  const promoRows = group(paid.filter(o => o.promo_code), o => o.promo_code).map(e => ({ ...e, discount_kop: sum(paid.filter(o => o.promo_code === e.name), o => o.discount_kop) }));

  // воронка: оплачені календарі -> анкети -> відкривають вікна
  const cals = await qa(env, `SELECT c.id, (c.schedule_json IS NOT NULL) AS ready, (SELECT COUNT(DISTINCT p.day) FROM progress p JOIN members m ON m.id = p.member_id WHERE m.calendar_id = c.id AND p.opened = 1) AS opened_days
    FROM calendars c JOIN orders o ON o.id = c.order_id WHERE o.paid_at >= ?`, since);
  const funnel = [
    { key: 'created', label: 'Створили замовлення', n: created.length },
    { key: 'paid', label: 'Оплатили', n: createdPaid },
    { key: 'surveys', label: 'Обидва заповнили анкети', n: cals.filter(c => c.ready).length },
    { key: 'opened', label: 'Відкрили хоча б одне вікно', n: cals.filter(c => c.opened_days >= 1).length },
    { key: 'half', label: 'Відкрили 12+ вікон', n: cals.filter(c => c.opened_days >= 12).length },
    { key: 'full', label: 'Відкрили всі 24', n: cals.filter(c => c.opened_days >= 24).length }
  ];
  // найближчі старти (операційно)
  const lp = localParts(new Date(now)), todayK = toDateStr(Math.floor(Date.UTC(lp.y, lp.m - 1, lp.d) / 864e5));
  const starts = await qa(env, "SELECT c.start_date AS date, COUNT(*) AS n FROM calendars c JOIN orders o ON o.id = c.order_id WHERE c.start_date >= ? AND o.refunded_at IS NULL GROUP BY c.start_date ORDER BY c.start_date LIMIT 14", todayK);
  const inbox = await q1(env, "SELECT COUNT(*) AS open, COALESCE(SUM(unread),0) AS unread FROM threads WHERE status = 'open'");
  const customers = (await q1(env, 'SELECT COUNT(DISTINCT email) AS n FROM (SELECT email_a AS email FROM orders WHERE paid_at IS NOT NULL UNION SELECT email_b FROM orders WHERE paid_at IS NOT NULL)')).n;
  return {
    period: days || 'all',
    kpi: { paid: paidCount, free: freeCount, created: created.length, conversion: created.length ? createdPaid / created.length : null, list_kop: list, discount_kop: discount, revenue_kop: revenue, refunds_kop: refunds, net_revenue_kop: netRevenue,
      avg_check_kop: paidCount - freeCount > 0 ? Math.round(sum(paid.filter(o => o.amount_kop > 0), o => o.amount_kop) / (paidCount - freeCount)) : 0,
      fee_kop: fee, tax_kop: tax, profit_kop: netRevenue - fee - tax, fee_pct: st.fee_percent, fee_foreign_pct: st.fee_foreign_percent, tax_pct: taxPct, tax_single_pct: st.tax_percent, tax_military_pct: st.military_percent, pending, abandoned, customers, inbox_open: inbox.open, inbox_unread: inbox.unread },
    series: fill, funnel, regions: byRegion, cities: byCity, promos: promoRows, upcoming_starts: starts
  };
}

// ---------- Підтримка (скринька) ----------
async function inboxList(env, status) {
  const where = status === 'all' ? '' : 'WHERE status = ?';
  return qa(env, `SELECT t.*, (SELECT COUNT(*) FROM orders o WHERE o.email_a = t.email OR o.email_b = t.email) AS orders FROM threads t ${where} ORDER BY unread DESC, last_at DESC LIMIT 200`, ...(status === 'all' ? [] : [status === 'closed' ? 'closed' : 'open']));
}
async function inboxThread(env, email) {
  const t = await q1(env, 'SELECT * FROM threads WHERE email = ?', email);
  if (!t) throw new HttpError(404, 'not_found');
  await run(env, 'UPDATE threads SET unread = 0 WHERE email = ?', email);
  const messages = await qa(env, 'SELECT id, direction, from_email, from_name, to_email, subject, body_text, created_at FROM messages WHERE thread_email = ? ORDER BY created_at', email);
  const orders = await qa(env, 'SELECT id, created_at, paid_at, refunded_at, amount_kop, name_a, name_b, email_a, email_b, start_date FROM orders WHERE email_a = ? OR email_b = ? ORDER BY created_at DESC LIMIT 10', email, email);
  return { thread: { ...t, unread: 0 }, messages, orders: orders.map(o => ({ ...o, status: statusOf(o) })) };
}
async function inboxAction(request, env, admin, email, action) {
  const t = await q1(env, 'SELECT * FROM threads WHERE email = ?', email);
  if (!t) throw new HttpError(404, 'not_found');
  const b = await readJson(request);
  if (action === 'status') {
    if (!['open', 'closed'].includes(b.status)) throw new HttpError(400, 'bad_status');
    await run(env, 'UPDATE threads SET status = ? WHERE email = ?', b.status, email);
    await audit(env, admin, 'thread_' + b.status, email);
    return { ok: true };
  }
  const body = String(b.body || '').replace(/\r/g, '').trim().slice(0, 5000);
  if (body.length < 2) throw new HttpError(400, 'empty');
  const subject = cleanText(b.subject || t.last_subject || 'Відповідь підтримки', 200);
  const last = await q1(env, "SELECT msg_id FROM messages WHERE thread_email = ? AND direction = 'in' AND msg_id IS NOT NULL ORDER BY created_at DESC LIMIT 1", email);
  const lg = await q1(env, 'SELECT lang FROM orders WHERE email_a = ? OR email_b = ? ORDER BY created_at DESC LIMIT 1', email, email);
  const mail = supportReplyEmail(env, body, last?.msg_id, lg?.lang || 'uk');
  await sendEmail(env, email, /^re:/i.test(subject) ? subject : 'Re: ' + subject, mail.html, mail.text, { from: env.EMAIL_SUPPORT_FROM || env.EMAIL_FROM, replyTo: env.SUPPORT_EMAIL || 'support@reeadvent.fun', headers: mail.headers });
  const mid = uid(), now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO messages (id, thread_email, direction, from_email, from_name, to_email, subject, body_text, created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(mid, email, 'out', env.SUPPORT_EMAIL || 'support@reeadvent.fun', admin, email, subject, body, now),
    env.DB.prepare('UPDATE threads SET last_at = ?, last_subject = ?, status = ? WHERE email = ?').bind(now, subject, b.close ? 'closed' : t.status, email)
  ]);
  await audit(env, admin, 'support_reply', email, { chars: body.length });
  return { ok: true, id: mid };
}
