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
import { listProposals, generateProposals, editProposal, reviseProposal, restoreVersion, rejectProposal, approveProposal, previewPlace, withdrawProposal, proposalCounts, TEMPLATES, SCENES } from './proposals.js';
import { putMedia, mediaMode, MAX_R2 } from './media.js';
import { hasClaude } from './claude.js';
import { commsList, commsGet, commsOrder } from './comms.js';
import { restoreComms } from './commsRestore.js';
import { agentFlags, saveAgentFlags, getHist, runAgent, agentAction, syncMetaSpend } from './agent.js';
import { trackConfig, saveTrackConfig, addSpend, deleteSpend, listSpend, adsReport, CHANNELS as AD_CHANNELS } from './ads.js';
import { publishNext as igPublishNext, publishStatus as igPublishStatus, setAuto as igSetAuto, editPost as igEditPost, saveFbPage as igSaveFbPage, setOrder as igSetOrder, swapPosts as igSwapPosts, spread as igSpread, loadManifest as igManifest , pubState } from './igpublish.js';
import { saveToken as igSaveToken, disconnect as igDisconnect, igStatus, saveEmbeds as igSaveEmbeds, igTest } from './instagram.js';
import { venueStats, venueProblems, retryCities, queueCity, overpassProbe, setVenuesPaused, catalogCountries, catalogCities, catalogCity, setVenueHidden, mapUrl } from './venues.js';
import { cancelInvoice, toInvoiceUnits } from './payments.js';
import { getPrices, toUah, moneyText } from './pricing.js';
import { recoveryState } from './recovery.js';
import { purgeAnswerMedia } from './answerMedia.js';
import { ratingsReport } from './feedback.js';
import { readiness, setManual } from './readiness.js';
import { bestPlace as igBestPlace } from './placement.js';

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
  if (m === 'GET' && path === '/api/admin/settings') { const fx = await getFx(env); return json({ ok: true, settings: await getSettings(env), places: { enabled: !!env.GOOGLE_PLACES_KEY, used: await placesUsage(env) }, venues: { ...(await venueStats(env)), problems: await venueProblems(env) }, fx: fx ? { updated: fx.updated, usd: fx.rates.USD ? Math.round(1 / fx.rates.USD * 100) / 100 : null, eur: fx.rates.EUR ? Math.round(1 / fx.rates.EUR * 100) / 100 : null, count: Object.keys(fx.rates).length, mono: fx.sources ? fx.sources.mono : null } : null, prices: await getPrices(env) }); }
  if (m === 'POST' && path === '/api/admin/venues/retry') { const b = await readJson(request); const n = await retryCities(env, b.id ? Number(b.id) : null); await audit(env, admin, 'venues_retry', b.id || 'all', { n }); return json({ ok: true, n }); }
  if (m === 'POST' && path === '/api/admin/venues/pause') { const b = await readJson(request); await setVenuesPaused(env, !!b.paused); await audit(env, admin, 'venues_pause', null, { paused: !!b.paused }); return json({ ok: true, paused: !!b.paused }); }
  if (m === 'GET' && path === '/api/admin/venues/countries') return json({ ok: true, countries: await catalogCountries(env) });
  if (m === 'GET' && path === '/api/admin/venues/cities') return json({ ok: true, cities: await catalogCities(env, new URL(request.url).searchParams.get('country')) });
  if (m === 'GET' && (r = path.match(/^\/api\/admin\/venues\/city\/(\d+)$/))) { const x = await catalogCity(env, +r[1]); if (!x) throw new HttpError(404, 'not_found'); return json({ ok: true, ...x }); }
  if (m === 'POST' && path === '/api/admin/venues/hide') { const b = await readJson(request); const n = await setVenueHidden(env, Number(b.id), !!b.hidden); await audit(env, admin, b.hidden ? 'venue_hide' : 'venue_show', String(b.id), {}); return json({ ok: true, n }); }
  // --- пропозиції агента: погодити, відхилити, змінити, доопрацювати за промтом ---
  const propsOut = async () => { const list = await listProposals(env); return { ok: true, list, counts: proposalCounts(list), hasKey: hasClaude(env), mediaMode: mediaMode(env), templates: TEMPLATES, scenes: SCENES }; };
  if (m === 'GET' && path === '/api/admin/proposals') return json(await propsOut());
  if (m === 'POST' && path === '/api/admin/proposals/generate') { const b = await readJson(request); const out = await generateProposals(env, { count: b.count, focus: b.focus, refs: b.refs }); await audit(env, admin, 'proposals_generate', null, { added: out.added, mode: out.mode }); return json({ ...(await propsOut()), generated: out }); }
  if (m === 'POST' && path === '/api/admin/proposals/edit') { const b = await readJson(request); await editProposal(env, String(b.id || ''), b.patch || {}); await audit(env, admin, 'proposal_edit', String(b.id || ''), {}); return json(await propsOut()); }
  if (m === 'POST' && path === '/api/admin/proposals/revise') { const b = await readJson(request); await reviseProposal(env, String(b.id || ''), b.instruction, { refs: b.refs }); await audit(env, admin, 'proposal_revise', String(b.id || ''), { prompt: String(b.instruction || '').slice(0, 200) }); return json(await propsOut()); }
  if (m === 'POST' && path === '/api/admin/proposals/restore') { const b = await readJson(request); await restoreVersion(env, String(b.id || ''), b.version); await audit(env, admin, 'proposal_restore', String(b.id || ''), { version: b.version }); return json(await propsOut()); }
  if (m === 'POST' && path === '/api/admin/proposals/reject') { const b = await readJson(request); await rejectProposal(env, String(b.id || ''), b.reason); await audit(env, admin, 'proposal_reject', String(b.id || ''), { reason: String(b.reason || '').slice(0, 200) }); return json(await propsOut()); }
  if (m === 'POST' && path === '/api/admin/proposals/approve') { const b = await readJson(request); const out = await approveProposal(env, String(b.id || ''), { at: b.at, targets: b.targets, media: b.media, cover: b.cover, place: b.place }); await audit(env, admin, 'proposal_approve', String(b.id || ''), { entry: out.entry ? out.entry.id : null, at: out.placed ? out.placed.at : null }); return json({ ...(await propsOut()), placed: out.placed || null }); }
  if (m === 'POST' && path === '/api/admin/proposals/place') { const b = await readJson(request); return json({ ok: true, placed: await previewPlace(env, String(b.id || ''), String(b.mode || 'best')) }); }
  if (m === 'POST' && path === '/api/admin/proposals/withdraw') { const b = await readJson(request); await withdrawProposal(env, String(b.id || ''), async eid => !!((await pubState(env)).done[eid] || (await pubState(env)).fb[eid])); await audit(env, admin, 'proposal_withdraw', String(b.id || ''), {}); return json(await propsOut()); }
  if (m === 'POST' && path === '/api/admin/media') { const len = Number(request.headers.get('content-length') || 0); if (len > MAX_R2) throw new HttpError(413, 'media_too_big'); const out = await putMedia(env, new Uint8Array(await request.arrayBuffer())); return json({ ok: true, id: out.id, mime: out.mime, size: out.size, url: '/api/media/' + out.id }); }
  // --- комунікації: журнал листів, надісланих клієнтам (до, під час і після замовлення) ---
  if (m === 'GET' && path === '/api/admin/comms') return json(await commsList(env, url.searchParams));
  if (m === 'POST' && path === '/api/admin/comms/restore') { const out = await restoreComms(env, {}); await audit(env, admin, 'comms_restore', null, { added: out.added, remaining: out.remaining }); return json(out); }
  if (m === 'GET' && (r = path.match(/^\/api\/admin\/comms\/(\d{1,12})$/))) return json(await commsGet(env, +r[1]));
  if (m === 'GET' && (r = path.match(/^\/api\/admin\/comms\/order\/([\w-]{3,64})$/))) { const o = await q1(env, 'SELECT id, created_at, paid_at, refunded_at, name_a, name_b, email_a, email_b, payer_email, city, amount_kop FROM orders WHERE id = ?', r[1]); return json(await commsOrder(env, r[1], o && { ...o, status: statusOf(o) })); }
  if (m === 'GET' && path === '/api/admin/ratings') return json({ ok: true, ...(await ratingsReport(env)) });
  if (m === 'GET' && path === '/api/admin/launch') return json(await readiness(env));
  if (m === 'POST' && path === '/api/admin/launch') { const b = await readJson(request); const out = await setManual(env, String(b.id || ''), !!b.done); if (out.ok) await audit(env, admin, 'launch_step', null, { id: b.id, done: !!b.done }); return json(out); }
  if (m === 'GET' && path === '/api/admin/agent') { const hist = await getHist(env); return json({ ok: true, flags: await agentFlags(env), last: hist[0] || null, history: hist.slice(1, 8).map(h => ({ at: h.at, day: h.day, mode: h.mode, headline: h.headline })) }); }
  if (m === 'POST' && path === '/api/admin/agent/settings') { const out = await saveAgentFlags(env, await readJson(request)); if (!out.ok) throw new HttpError(400, out.error); await audit(env, admin, 'agent_settings', null, {}); return json({ ok: true, flags: await agentFlags(env) }); }
  if (m === 'POST' && path === '/api/admin/agent/run') { const out = await runAgent(env, { force: true }); await audit(env, admin, 'agent_run', null, { mode: out.mode }); const hist = await getHist(env); return json({ ok: true, ...out, flags: await agentFlags(env), last: hist[0] || null, history: hist.slice(1, 8).map(h => ({ at: h.at, day: h.day, mode: h.mode, headline: h.headline })) }); }
  if (m === 'POST' && path === '/api/admin/agent/action') { const b = await readJson(request); const out = await agentAction(env, { at: b.at, id: String(b.id || ''), op: String(b.op || '') }); if (!out.ok) throw new HttpError(400, out.error); await audit(env, admin, 'agent_action', String(b.id || ''), { op: b.op }); const hist = await getHist(env); return json({ ok: true, message: out.message || null, last: hist[0] || null }); }
  if (m === 'POST' && path === '/api/admin/agent/sync') { const out = await syncMetaSpend(env); if (out.ok === false) throw new HttpError(400, out.error); return json({ ok: true, ...out }); }
  if (m === 'GET' && path === '/api/admin/ads') { const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days')) || 30)); const config = await trackConfig(env); try { return json({ ok: true, config, channels: AD_CHANNELS, spend: await listSpend(env), report: await adsReport(env, Date.now() - days * 864e5, Date.now() + 864e5) }); } catch (e) { if (!/no such (table|column)|utm_|ad_spend/i.test(String(e && e.message))) throw e; return json({ ok: true, migrate: true, config, channels: AD_CHANNELS, spend: [], report: { rate: 0, rows: [], campaigns: [], totals: { started: 0, paid: 0, revenue_kop: 0, spend_cents: 0, cpa_usd: null, roas: null }, spentAllCents: 0 } }); } }
  if (m === 'POST' && path === '/api/admin/ads/config') { const out = await saveTrackConfig(env, await readJson(request)); if (!out.ok) throw new HttpError(400, out.error); await audit(env, admin, 'ads_config', null, {}); return json({ ok: true, config: await trackConfig(env) }); }
  if (m === 'POST' && path === '/api/admin/ads/spend') { const b = await readJson(request); if (b.delete) { await deleteSpend(env, b.delete); await audit(env, admin, 'ads_spend_delete', String(b.delete), {}); return json({ ok: true }); } const out = await addSpend(env, b); if (!out.ok) throw new HttpError(400, out.error); await audit(env, admin, 'ads_spend', null, { channel: b.channel, amount: b.amount }); return json({ ok: true }); }
  if (m === 'GET' && path === '/api/admin/instagram') return json({ ok: true, ...(await igStatus(env)) });
  if (m === 'POST' && path === '/api/admin/instagram/token') { const b = await readJson(request); const out = await igSaveToken(env, b.token, { igId: b.igId }); if (!out.ok) throw new HttpError(400, out.error); await audit(env, admin, 'instagram_connect', null, { username: out.username }); return json({ ok: true, ...(await igStatus(env)) }); }
  if (m === 'POST' && path === '/api/admin/instagram/embeds') { const b = await readJson(request); const list = await igSaveEmbeds(env, b.text); await audit(env, admin, 'instagram_embeds', null, { n: list.length }); return json({ ok: true, ...(await igStatus(env)) }); }
  if (m === 'GET' && path === '/api/admin/instagram/publish') return json({ ok: true, ...(await igPublishStatus(env)) });
  if (m === 'POST' && path === '/api/admin/instagram/publish') { const b = await readJson(request); const out = await igPublishNext(env, { only: b.id || null }); await audit(env, admin, 'instagram_publish', null, { ok: out.ok, id: out.id || null }); return json({ ...out, ...(await igPublishStatus(env)), ok: out.ok, error: out.error }); }
  if (m === 'POST' && path === '/api/admin/instagram/plan') { const b = await readJson(request); const man = await igManifest(undefined, undefined, env); const out = b.place ? await igBestPlace(env, String(b.id || ''), b.place === 'free' ? 'free' : 'best', man) : Array.isArray(b.swap) ? await igSwapPosts(env, String(b.swap[0] || ''), String(b.swap[1] || ''), man) : b.order ? await igSetOrder(env, b.order, man) : b.spread ? await igSpread(env, b.start, b.everyDays, man, b.format === 'story' || b.format === 'post' ? b.format : null) : await igEditPost(env, b.id, { caption: b.caption, at: b.at, ig: b.ig, fb: b.fb }, man); if (!out.ok) throw new HttpError(400, out.error); await audit(env, admin, 'instagram_plan', null, { id: b.id || null, order: !!b.order, spread: !!b.spread, swap: Array.isArray(b.swap) ? b.swap.slice(0, 2) : undefined, place: b.place || undefined }); return json({ ok: true, placed: out.placed || null, ...(await igPublishStatus(env)) }); }
  if (m === 'POST' && path === '/api/admin/instagram/fbpage') { const b = await readJson(request); const out = await igSaveFbPage(env, b.id); if (!out.ok) throw new HttpError(400, out.error); await audit(env, admin, 'facebook_page', null, { id: b.id || null }); return json({ ok: true, ...(await igPublishStatus(env)) }); }
  if (m === 'POST' && path === '/api/admin/instagram/auto') { const b = await readJson(request); await igSetAuto(env, !!b.on); await audit(env, admin, 'instagram_auto', null, { on: !!b.on }); return json({ ok: true, ...(await igPublishStatus(env)) }); }
  if (m === 'POST' && path === '/api/admin/instagram/test') return json({ ok: true, ...(await igTest(env)), status2: await igStatus(env) });
  if (m === 'POST' && path === '/api/admin/instagram/disconnect') { await igDisconnect(env); await audit(env, admin, 'instagram_disconnect', null, {}); return json({ ok: true, ...(await igStatus(env)) }); }
  if (m === 'POST' && path === '/api/admin/venues/test') return json({ ok: true, probe: await overpassProbe() });
  if (m === 'POST' && path === '/api/admin/venues/add') { const b = await readJson(request); if (!(await queueCity(env, b.country, b.name))) throw new HttpError(400, 'bad_city'); await audit(env, admin, 'venues_add', null, { country: b.country, name: b.name }); return json({ ok: true }); }
  if (m === 'POST' && path === '/api/admin/fx/refresh') { const r = await refreshFx(env, { force: true }); await audit(env, admin, 'fx_refresh', null, r); if (!r.ok) throw Object.assign(new HttpError(502, 'fx_failed'), { detail: r.error }); return json({ ok: true, ...r }); }
  if (m === 'POST' && path === '/api/admin/settings') { const b = await readJson(request); const saved = await saveSettings(env, b); if (Object.keys(saved).length) await audit(env, admin, 'settings', null, saved); return json({ ok: true, settings: await getSettings(env), prices: await getPrices(env) }); }
  if (m === 'GET' && path === '/api/admin/dashboard') return json({ ok: true, ...(await dashboard(env, url.searchParams.get('days') || '30')) });
  if (m === 'GET' && path === '/api/admin/orders') return json({ ok: true, ...(await listOrders(env, url)) });
  if (m === 'GET' && (r = path.match(/^\/api\/admin\/orders\/([\w-]+)$/))) return json({ ok: true, ...(await orderDetail(env, r[1])) });
  if (m === 'POST' && path === '/api/admin/orders/bulk') return json(await ordersBulk(env, admin, await readJson(request)));
  if (m === 'POST' && (r = path.match(/^\/api\/admin\/orders\/([\w-]+)\/(update|resend|refund|note|archive|delete|test|testreset|testlinks)$/))) return json(await orderAction(request, env, admin, r[1], r[2]));
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
  const where = [status === 'archived' ? 'archived_at IS NOT NULL' : 'archived_at IS NULL'], args = [];   // архівні (тестові й непотрібні) показуються лише у фільтрі «Архів»
  if (status === 'paid') where.push('paid_at IS NOT NULL AND refunded_at IS NULL');
  else if (status === 'refunded') where.push('refunded_at IS NOT NULL');
  else if (status === 'pending') where.push('paid_at IS NULL AND created_at > ?'), args.push(Date.now() - 3600e3);
  else if (status === 'abandoned') where.push('paid_at IS NULL AND created_at <= ?'), args.push(Date.now() - 3600e3);
  const promo = url.searchParams.get('promo'); if (promo) where.push('promo_code = ?'), args.push(normCode(promo));
  if (q) { const like = '%' + esc(q) + '%'; where.push("(email_a LIKE ? ESCAPE '\\' OR email_b LIKE ? ESCAPE '\\' OR name_a LIKE ? ESCAPE '\\' OR name_b LIKE ? ESCAPE '\\' OR city LIKE ? ESCAPE '\\' OR id = ?)"); args.push(like, like, like, like, like, q); }
  const W = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = (await q1(env, `SELECT COUNT(*) AS n FROM orders ${W}`, ...args)).n;
  const rows = await qa(env, `SELECT id, created_at, paid_at, refunded_at, amount_kop, list_kop, discount_kop, promo_code, name_a, email_a, name_b, email_b, city, region, start_date, currency, archived_at, (SELECT test_mode FROM calendars c WHERE c.order_id = orders.id) AS test_mode FROM orders ${W} ORDER BY created_at DESC LIMIT ? OFFSET ?`, ...args, limit, (page - 1) * limit);
  return { total, page, pages: Math.max(1, Math.ceil(total / limit)), orders: rows.map(o => ({ ...o, status: statusOf(o) })) };
}

async function orderDetail(env, id) {
  const o = await q1(env, 'SELECT * FROM orders WHERE id = ?', id);
  if (!o) throw new HttpError(404, 'not_found');
  const cal = await q1(env, 'SELECT id, start_date, (schedule_json IS NOT NULL) AS ready, test_mode FROM calendars WHERE order_id = ?', id);
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
  return { order: { ...o, status: statusOf(o) }, calendar: cal ? { ...cal, ready: !!cal.ready, test_mode: !!cal.test_mode, today: todayIndex(cal.start_date, nowOf(env)) } : null, members, log, threads };
}

/** Остаточне видалення замовлення (лише з архіву): календар, учасники, їхні відповіді й прогрес, входи, листи в журналі. Для реальних оплат краще лишити в архіві. */
async function deleteOrder(env, admin, o) {
  if (!o.archived_at) throw new HttpError(409, 'not_archived');
  const cal = await q1(env, 'SELECT id FROM calendars WHERE order_id = ?', o.id);
  const mem = cal ? await qa(env, 'SELECT id FROM members WHERE calendar_id = ?', cal.id) : [];
  const stmts = [];
  await purgeAnswerMedia(env, mem.map(m => m.id));   // фото й відео з відповідей
  for (const m of mem) for (const t of ['answers', 'progress', 'sessions', 'login_tokens', 'login_codes', 'reminders_sent', 'venue_ratings', 'venue_reports', 'item_ratings']) stmts.push(env.DB.prepare(`DELETE FROM ${t} WHERE member_id = ?`).bind(m.id));   // оцінки тестових замовлень не впливають на рейтинг
  if (cal) stmts.push(env.DB.prepare('DELETE FROM members WHERE calendar_id = ?').bind(cal.id), env.DB.prepare('DELETE FROM calendars WHERE id = ?').bind(cal.id));
  if (o.paid_at && o.promo_id) stmts.push(env.DB.prepare('UPDATE promo_codes SET used_count = MAX(0, used_count - 1) WHERE id = ?').bind(o.promo_id));   // ліміт промокоду знову доступний
  stmts.push(env.DB.prepare('DELETE FROM orders WHERE id = ?').bind(o.id));
  await env.DB.batch(stmts);
  try { await run(env, 'DELETE FROM email_log WHERE order_id = ?', o.id); } catch {}
  try { const st = await recoveryState(env); if (st[o.id]) { delete st[o.id]; await run(env, 'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', 'recovery_state', JSON.stringify(st), Date.now()); } } catch {}
  await audit(env, admin, 'order_delete', o.id, { status: statusOf(o), amountKop: o.amount_kop, currency: o.currency || 'UAH', created: o.created_at });
}

/** Масові дії зі списку замовлень: archive | unarchive | delete (видаляються лише архівні; до 20 за раз, решту надсилає адмінка наступними запитами). */
async function ordersBulk(env, admin, b) {
  const act = String(b.action || ''), max = act === 'delete' ? 20 : 200;
  if (!['archive', 'unarchive', 'delete'].includes(act)) throw new HttpError(400, 'bad_action');
  const ids = Array.isArray(b.ids) ? [...new Set(b.ids.map(String))].filter(x => /^[\w-]{3,64}$/.test(x)) : [];
  if (!ids.length || ids.length > max) throw new HttpError(400, 'bad_ids');
  let n = 0, skipped = 0;
  if (act === 'delete') {
    for (const id of ids) { const o = await q1(env, 'SELECT * FROM orders WHERE id = ?', id); if (!o || !o.archived_at) { skipped++; continue; } await deleteOrder(env, admin, o); n++; }
  } else {
    for (let i = 0; i < ids.length; i += 90) {
      const part = ids.slice(i, i + 90), ph = part.map(() => '?').join(',');
      const res = act === 'archive' ? await run(env, `UPDATE orders SET archived_at = ? WHERE archived_at IS NULL AND id IN (${ph})`, Date.now(), ...part) : await run(env, `UPDATE orders SET archived_at = NULL WHERE archived_at IS NOT NULL AND id IN (${ph})`, ...part);
      n += Number(res.meta && res.meta.changes) || 0;
    }
    skipped = ids.length - n;
  }
  await audit(env, admin, 'orders_' + act, null, { n, skipped, ids: ids.slice(0, 50) });
  return { ok: true, n, skipped };
}

async function orderAction(request, env, admin, id, action) {
  const b = await readJson(request);
  const o = await q1(env, 'SELECT * FROM orders WHERE id = ?', id);
  if (!o) throw new HttpError(404, 'not_found');
  const cal = await q1(env, 'SELECT * FROM calendars WHERE order_id = ?', id);
  const members = cal ? await qa(env, 'SELECT * FROM members WHERE calendar_id = ? ORDER BY slot', cal.id) : [];

  if (action === 'archive') {   // в архів і назад: замовлення зникає зі списків і звітів, але нічого не видаляється
    const on = b.archived !== false;
    await run(env, 'UPDATE orders SET archived_at = ? WHERE id = ?', on ? (o.archived_at || Date.now()) : null, id);
    await audit(env, admin, on ? 'order_archive' : 'order_unarchive', id, {});
    return { ok: true, archived: on };
  }
  if (action === 'delete') { await deleteOrder(env, admin, o); return { ok: true, deleted: true }; }
  // Тестовий режим: вікна по черзі без очікування дат (наступне після відповіді на попереднє), порядок дій у дні звичайний (відповідь → подарунок, пригода, активність)
  if (action === 'test') {
    if (!cal) throw new HttpError(409, 'no_calendar');
    const on = !!b.on; await run(env, 'UPDATE calendars SET test_mode = ? WHERE id = ?', on ? 1 : null, cal.id);
    await audit(env, admin, on ? 'order_test_on' : 'order_test_off', id, {}); return { ok: true, test: on };
  }
  if (action === 'testreset') {   // лише в тестовому режимі: стерти прогрес (і за бажання анкети), щоб пройти календар ще раз
    if (!cal || !cal.test_mode) throw new HttpError(409, 'not_test');
    const ids = members.map(m => m.id), stmts = [];
    await purgeAnswerMedia(env, ids);
    for (const mid of ids) for (const t of ['answers', 'progress', 'item_ratings', 'answer_media', 'reminders_sent']) stmts.push(env.DB.prepare(`DELETE FROM ${t} WHERE member_id = ?`).bind(mid));
    if (b.surveys) { stmts.push(env.DB.prepare('UPDATE members SET survey_json = NULL WHERE calendar_id = ?').bind(cal.id)); stmts.push(env.DB.prepare('UPDATE calendars SET schedule_json = NULL WHERE id = ?').bind(cal.id)); }
    await env.DB.batch(stmts); await audit(env, admin, 'order_test_reset', id, { surveys: !!b.surveys }); return { ok: true, reset: true, surveys: !!b.surveys };
  }
  if (action === 'testlinks') {   // одноразові посилання для входу за кожного учасника (діють 30 хв), лише в тестовому режимі
    if (!cal || !cal.test_mode) throw new HttpError(409, 'not_test');
    const links = []; for (const m of members) links.push({ slot: m.slot, name: m.suggested_name, email: m.email, link: await issueLoginLink(env, m.id, 30 * 60e3) });
    await audit(env, admin, 'order_test_links', id, {}); return { ok: true, links };
  }
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
      await sendEmail(env, mem.email, mail.subject, mail.html, mail.text, { meta: { kind: 'access', orderId: id, memberId: mem.id, startDate: cal.start_date } });
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
      const r = await cancelInvoice(env, o.invoice_id, toInvoiceUnits(o, amount), refundRef);   // сума у валюті виставленого рахунку
      if (!r.ok || r.status === 'failure') { const e = new HttpError(502, 'refund_failed'); e.detail = String(r.error || 'failure').slice(0, 200); throw e; }
      refundStatus = r.status || 'processing';
    }
    await run(env, 'UPDATE orders SET refunded_at = ?, refund_kop = ?, refund_status = ?, refund_ref = ? WHERE id = ?', Date.now(), amount, refundStatus, refundRef, id);
    if (b.revoke !== false) for (const mem of members) await run(env, 'DELETE FROM sessions WHERE member_id = ?', mem.id); // доступ закривається
    if (b.notify !== false && amount > 0) { // повідомлення покупцю (не критично, якщо не вдалось)
      try { const mail = refundEmail(env, moneyText(amount, o.currency || 'UAH'), o.lang || 'uk'); await sendEmail(env, o.payer_email || o.email_a, mail.subject, mail.html, mail.text, { meta: { kind: 'refund', orderId: id } }); } catch (e) { console.error('refund email failed', e); }
    }
    await audit(env, admin, 'refund', id, { amountKop: amount, currency: o.currency || 'UAH', method: auto ? 'monobank_api' : 'manual', status: refundStatus, revoke: b.revoke !== false, note: cleanText(b.note, 300) });
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
        await sendEmail(env, em, mail.subject, mail.html, mail.text, { meta: { kind: 'access', orderId: id, memberId: mem.id, startDate: newStart || cal.start_date } });
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
  const rows = await qa(env, `SELECT email, GROUP_CONCAT(DISTINCT name) AS names, COUNT(*) AS orders, CAST(ROUND(COALESCE(SUM(CASE WHEN paid_at IS NOT NULL AND refunded_at IS NULL THEN uah ELSE 0 END),0)) AS INTEGER) AS paid_kop, MAX(created_at) AS last_at, GROUP_CONCAT(DISTINCT city) AS cities
    FROM (SELECT email_a AS email, name_a AS name, city, amount_kop * COALESCE(uah_rate, 1) AS uah, paid_at, refunded_at, created_at FROM orders WHERE archived_at IS NULL UNION ALL SELECT email_b, name_b, city, 0, paid_at, refunded_at, created_at FROM orders WHERE archived_at IS NULL)
    WHERE email LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\' GROUP BY email ORDER BY last_at DESC LIMIT 1000`, like, like);
  return rows;
}

// ---------- Промокоди ----------
async function listPromos(env) {
  const rows = await qa(env, `SELECT p.*, (SELECT COUNT(*) FROM orders o WHERE o.promo_id = p.id AND o.paid_at IS NOT NULL AND o.archived_at IS NULL) AS paid_orders,
    (SELECT CAST(ROUND(COALESCE(SUM(o.discount_kop * COALESCE(o.uah_rate, 1)),0)) AS INTEGER) FROM orders o WHERE o.promo_id = p.id AND o.paid_at IS NOT NULL AND o.archived_at IS NULL) AS discount_kop,
    (SELECT CAST(ROUND(COALESCE(SUM(o.amount_kop * COALESCE(o.uah_rate, 1)),0)) AS INTEGER) FROM orders o WHERE o.promo_id = p.id AND o.paid_at IS NOT NULL AND o.refunded_at IS NULL AND o.archived_at IS NULL) AS revenue_kop
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
  // архівні (тестові) замовлення в звіти не потрапляють; суми в євро переводимо в гривні за курсом на момент замовлення
  const created = await qa(env, 'SELECT id, status, paid_at, created_at FROM orders WHERE created_at >= ? AND archived_at IS NULL', since);
  const paid = (await qa(env, 'SELECT * FROM orders WHERE paid_at >= ? AND archived_at IS NULL ORDER BY paid_at', since)).map(o => o.currency === 'EUR'
    ? { ...o, eur_cents: o.amount_kop, eur_refund_cents: o.refund_kop || 0, amount_kop: toUah(o, o.amount_kop), list_kop: toUah(o, o.list_kop ?? o.amount_kop), discount_kop: toUah(o, o.discount_kop), refund_kop: o.refund_kop == null ? null : toUah(o, o.refund_kop) } : o);
  const sum = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0);
  const list = sum(paid, o => o.list_kop ?? o.amount_kop), discount = sum(paid, o => o.discount_kop), revenue = sum(paid, o => o.amount_kop);
  const refunds = sum(paid.filter(o => o.refunded_at), o => o.refund_kop);
  const eurPaid = paid.filter(o => o.currency === 'EUR'), eur = { paid: eurPaid.length, cents: sum(eurPaid, o => o.eur_cents - (o.refunded_at ? o.eur_refund_cents : 0)), uah_kop: sum(eurPaid, o => o.amount_kop - (o.refunded_at ? o.refund_kop || 0 : 0)) };
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
    FROM calendars c JOIN orders o ON o.id = c.order_id WHERE o.paid_at >= ? AND o.archived_at IS NULL`, since);
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
  const starts = await qa(env, "SELECT c.start_date AS date, COUNT(*) AS n FROM calendars c JOIN orders o ON o.id = c.order_id WHERE c.start_date >= ? AND o.refunded_at IS NULL AND o.archived_at IS NULL GROUP BY c.start_date ORDER BY c.start_date LIMIT 14", todayK);
  const inbox = await q1(env, "SELECT COUNT(*) AS open, COALESCE(SUM(unread),0) AS unread FROM threads WHERE status = 'open'");
  const customers = (await q1(env, 'SELECT COUNT(DISTINCT email) AS n FROM (SELECT email_a AS email FROM orders WHERE paid_at IS NOT NULL AND archived_at IS NULL UNION SELECT email_b FROM orders WHERE paid_at IS NOT NULL AND archived_at IS NULL)')).n;
  return {
    period: days || 'all',
    kpi: { paid: paidCount, free: freeCount, created: created.length, conversion: created.length ? createdPaid / created.length : null, list_kop: list, discount_kop: discount, revenue_kop: revenue, refunds_kop: refunds, net_revenue_kop: netRevenue,
      avg_check_kop: paidCount - freeCount > 0 ? Math.round(sum(paid.filter(o => o.amount_kop > 0), o => o.amount_kop) / (paidCount - freeCount)) : 0,
      fee_kop: fee, tax_kop: tax, profit_kop: netRevenue - fee - tax, fee_pct: st.fee_percent, fee_foreign_pct: st.fee_foreign_percent, tax_pct: taxPct, tax_single_pct: st.tax_percent, tax_military_pct: st.military_percent, pending, abandoned, customers, inbox_open: inbox.open, inbox_unread: inbox.unread, eur },
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
  await sendEmail(env, email, /^re:/i.test(subject) ? subject : 'Re: ' + subject, mail.html, mail.text, { from: env.EMAIL_SUPPORT_FROM || env.EMAIL_FROM, replyTo: env.SUPPORT_EMAIL || 'support@reeadvent.fun', headers: mail.headers, meta: { kind: 'support_reply' } });
  const mid = uid(), now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO messages (id, thread_email, direction, from_email, from_name, to_email, subject, body_text, created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(mid, email, 'out', env.SUPPORT_EMAIL || 'support@reeadvent.fun', admin, email, subject, body, now),
    env.DB.prepare('UPDATE threads SET last_at = ?, last_subject = ?, status = ? WHERE email = ?').bind(now, subject, b.close ? 'closed' : t.status, email)
  ]);
  await audit(env, admin, 'support_reply', email, { chars: body.length });
  return { ok: true, id: mid };
}
