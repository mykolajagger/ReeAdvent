// Відновлення журналу «Комунікації» за даними системи.
// Листи, надіслані до появи журналу, не записувалися, але самі події збереглися: оплата, нагадування, відповіді підтримки, повернення коштів, дії в адмінці.
// Відновлений запис має статус «restored»: час і адресат точні, а от чи дійшов лист, невідомо, і текст зібрано за поточним шаблоном (у реальному листі він міг дещо відрізнятися).
// Робота безпечна для повторів: кожен запис має ключ (ext_id), а листи, які вже є в журналі «наживо», пропускаються (збіг адресата, типу й часу в межах 10 хвилин).
import { welcomeEmail, partnerInviteEmail, reminderEmail, recoveryEmail, refundEmail, loginEmail, supportReplyEmail } from './email.js';
import { redact, phaseFor, ensureLog, RESTORED_KEY } from './comms.js';
import { recoveryState } from './recovery.js';
import { LOGIN_TTL_MS } from './api.js';
import { moneyText } from './pricing.js';

const qa = async (env, sql, ...a) => (await env.DB.prepare(sql).bind(...a).all()).results;
const WINDOW = 10 * 60e3;
const norm = s => String(s || '').trim().toLowerCase();
const parse = s => { try { return JSON.parse(s) || {}; } catch { return {}; } };

/** Усі листи, які можна відновити (з урахуванням уже наявних поки не відсіяно). Шаблони ті самі, що й у реальних листах, а посилання й коди підставні (у журнал і так потрапляє лише «…»). */
async function collect(env) {
  const BASE = String(env.BASE_URL || '').replace(/\/$/, ''), LINK = `${BASE}/app/#login=restored`, CODE = '000000', out = [];
  const add = (kind, key, at, to, mail, o = {}) => { if (at && norm(to) && mail) out.push({ kind, key, at: Number(at), to: norm(to), subject: mail.subject, text: mail.text, orderId: o.orderId || null, memberId: o.memberId || null, startDate: o.startDate || null }); };
  const safe = fn => { try { fn(); } catch (e) { /* незвична або пошкоджена запис: пропускаємо */ } };

  // Журнал дій адміністратора: звідси відомо, коли міняли пошту в замовленні, тож кожен лист можна адресувати на ту пошту, що була чинна в момент відправки
  const aud = await qa(env, "SELECT at, action, target, detail FROM audit_log WHERE action IN ('resend_access', 'update_order') ORDER BY at"), changes = new Map();
  for (const a of aud) if (a.action === 'update_order') { const d = parse(a.detail); for (const [slot, k] of [[0, 'email_a'], [1, 'email_b']]) if (d.to && d.to[k] && d.from && d.from[k] && d.to[k] !== d.from[k]) { if (!changes.has(a.target)) changes.set(a.target, []); changes.get(a.target).push({ at: a.at, slot, from: d.from[k], to: d.to[k] }); } }
  const addrAt = (oid, slot, t, current) => { const next = (changes.get(oid) || []).find(c => c.slot === slot && c.at > t); return next ? next.from : current; };

  // 1. Оплачені замовлення: підтвердження покупцю, запрошення партнеру, лист про повернення коштів
  const orders = await qa(env, `SELECT o.id AS oid, o.paid_at, o.refunded_at, o.refund_kop, o.name_a, o.name_b, o.email_a, o.email_b, o.payer_email, o.lang AS olang, o.currency,
      c.start_date, c.lang AS clang, ma.id AS ma_id, ma.email AS ma_email, ma.suggested_name AS ma_name, mb.id AS mb_id, mb.email AS mb_email, mb.suggested_name AS mb_name
    FROM orders o JOIN calendars c ON c.order_id = o.id LEFT JOIN members ma ON ma.calendar_id = c.id AND ma.slot = 0 LEFT JOIN members mb ON mb.calendar_id = c.id AND mb.slot = 1
    WHERE o.paid_at IS NOT NULL ORDER BY o.paid_at`);
  const byId = new Map(orders.map(o => [o.oid, o]));
  for (const o of orders) safe(() => {
    if (/@deleted\.invalid$/.test(String(o.email_a))) return;
    const lang = o.olang || 'uk', common = { orderId: o.oid, startDate: o.start_date };
    add('welcome', 'welcome:' + o.oid, o.paid_at, addrAt(o.oid, 0, o.paid_at, o.ma_email || o.email_a), welcomeEmail(env, o.name_a, o.name_b, o.start_date, LINK, lang, CODE), { ...common, memberId: o.ma_id });
    add('partner_invite', 'partner:' + o.oid, o.paid_at, addrAt(o.oid, 1, o.paid_at, o.mb_email || o.email_b), partnerInviteEmail(env, o.name_b, o.name_a, o.start_date, LINK, lang, CODE), { ...common, memberId: o.mb_id });
    if (o.refunded_at && o.refund_kop > 0) add('refund', 'refund:' + o.oid, o.refunded_at, o.payer_email || o.email_a, refundEmail(env, moneyText(o.refund_kop, o.currency || 'UAH'), lang), common);
  });

  // 2. Нагадування (таблиця reminders_sent зберігає точний час кожного)
  for (const r of await qa(env, `SELECT r.member_id AS mid, r.kind, r.day, r.sent_at, m.email, m.slot, m.suggested_name AS name, c.order_id AS oid, c.start_date, c.lang
      FROM reminders_sent r JOIN members m ON m.id = r.member_id JOIN calendars c ON c.id = m.calendar_id`)) safe(() =>
    add('reminder_' + r.kind, `rem:${r.mid}:${r.kind}:${r.day}`, r.sent_at, addrAt(r.oid, r.slot, r.sent_at, r.email), reminderEmail(env, r.kind, { name: r.name, day: r.day, startDate: r.start_date, link: LINK, unsubUrl: `${BASE}/api/unsub?m=${encodeURIComponent(r.mid)}&s=restored`, lang: r.lang || 'uk', beforeStart: r.day <= 0 }), { orderId: r.oid, memberId: r.mid, startDate: r.start_date }));

  // 3. Нагадування про незавершену оплату (стан зберігається в settings.recovery_state)
  const st = await recoveryState(env), ids = Object.keys(st).filter(k => !k.startsWith('@') && st[k] && (st[k].a || st[k].b)).slice(0, 400);
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    for (const o of await qa(env, `SELECT id, name_a, email_a, payer_email, lang FROM orders WHERE id IN (${chunk.map(() => '?').join(',')})`, ...chunk)) safe(() => {
      for (const [stage, at] of [[1, st[o.id].a], [2, st[o.id].b]]) if (at) add('recovery_' + stage, `rec:${o.id}:${stage}`, at, o.payer_email || o.email_a, recoveryEmail(env, { name: o.name_a, link: `${BASE}/api/orders/${encodeURIComponent(o.id)}/resume?s=restored`, lang: o.lang || 'uk', stage }), { orderId: o.id });
    });
  }

  // 4. Відповіді підтримки (листування зберігається повністю)
  const all = await qa(env, 'SELECT o.id, o.email_a, o.email_b, o.payer_email, o.lang, c.start_date FROM orders o LEFT JOIN calendars c ON c.order_id = o.id ORDER BY o.created_at');
  const byEmail = new Map(); for (const o of all) for (const e of [o.email_a, o.email_b, o.payer_email]) if (norm(e)) byEmail.set(norm(e), o);   // пізніше замовлення перекриває раніше
  for (const m of await qa(env, "SELECT id, thread_email, to_email, subject, body_text, created_at FROM messages WHERE direction = 'out' ORDER BY created_at")) safe(() => {
    const to = norm(m.to_email || m.thread_email), o = byEmail.get(to), subject = /^re:/i.test(m.subject) ? m.subject : 'Re: ' + m.subject;
    add('support_reply', 'msg:' + m.id, m.created_at, to, { subject, text: supportReplyEmail(env, m.body_text || '', null, (o && o.lang) || 'uk').text }, { orderId: o && o.id, startDate: o && o.start_date });
  });

  // 5. Доступ, надісланий повторно з адмінки або після зміни пошти (журнал дій)
  for (const a of aud) safe(() => {
    const o = byId.get(a.target); if (!o) return;
    const d = parse(a.detail), lang = o.clang || o.olang || 'uk', common = { orderId: o.oid, startDate: o.start_date };
    const send = (s, key, to) => add('access', key, a.at, to,
      s === 0 ? welcomeEmail(env, o.ma_name, o.mb_name, o.start_date, LINK, lang, CODE) : partnerInviteEmail(env, o.mb_name, o.ma_name, o.start_date, LINK, lang, CODE), { ...common, memberId: s === 0 ? o.ma_id : o.mb_id });
    if (a.action === 'resend_access') for (const s of Array.isArray(d.slots) ? d.slots : []) { if (s === 0 || s === 1) send(s, `acc:${a.at}:${o.oid}:${s}`, addrAt(o.oid, s, a.at, s === 0 ? o.ma_email : o.mb_email)); }
    else for (const [s, k] of [[0, 'email_a'], [1, 'email_b']]) if (d.to && d.to[k] && d.to[k] !== (d.from && d.from[k])) send(s, `upd:${a.at}:${o.oid}:${s}`, d.to[k]);
  });

  // 6. Входи за запитом клієнта (одноразові посилання на 30 хвилин лишаються в базі ще добу)
  for (const l of await qa(env, `SELECT t.created_at, m.id AS mid, m.email, m.slot, m.suggested_name AS name, c.order_id AS oid, c.start_date, c.lang
      FROM login_tokens t JOIN members m ON m.id = t.member_id JOIN calendars c ON c.id = m.calendar_id WHERE t.expires_at - t.created_at BETWEEN ? AND ?`, LOGIN_TTL_MS, LOGIN_TTL_MS + 50)) safe(() =>
    add('login', `login:${l.mid}:${l.created_at}`, l.created_at, addrAt(l.oid, l.slot, l.created_at, l.email), loginEmail(env, l.name, LINK, l.lang || 'uk', CODE), { orderId: l.oid, memberId: l.mid, startDate: l.start_date }));
  return out;
}

/** Додає в журнал листи, яких там ще немає. limit: скільки записів за один виклик (решту добирає наступний виклик); dry: лише порахувати. */
export async function restoreComms(env, { limit = 1500, dry = false } = {}) {
  await ensureLog(env);
  const cands = await collect(env);
  const have = await qa(env, 'SELECT to_email AS t, kind AS k, created_at AS at, status AS s, ext_id AS x FROM email_log LIMIT 50000');
  const keys = new Set(have.filter(r => r.s === 'restored' && r.x).map(r => r.x)), live = new Map();
  for (const r of have) if (r.s !== 'restored') { const k = r.t + '|' + r.k; if (!live.has(k)) live.set(k, []); live.get(k).push(r.at); }
  const fresh = cands.filter(c => !keys.has(c.key) && !(live.get(c.to + '|' + c.kind) || []).some(t => Math.abs(t - c.at) <= WINDOW)).sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));
  const take = dry ? [] : fresh.slice(0, Math.max(1, limit)), counts = {}; for (const c of dry ? fresh : take) counts[c.kind] = (counts[c.kind] || 0) + 1;
  const stmt = c => env.DB.prepare('INSERT INTO email_log (created_at, to_email, subject, kind, phase, order_id, member_id, status, error, ext_id, body) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .bind(c.at, c.to, String(c.subject || '').slice(0, 300), c.kind, phaseFor(c.kind, c.startDate, c.at), c.orderId, c.memberId, 'restored', null, c.key.slice(0, 80), redact(c.text));
  for (let i = 0; i < take.length; i += 50) await env.DB.batch(take.slice(i, i + 50).map(stmt));
  const remaining = fresh.length - take.length;
  if (!dry && !remaining) await env.DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(RESTORED_KEY, String(Date.now()), Date.now()).run();
  return { ok: true, added: take.length, remaining, found: cands.length, counts, done: !remaining && !dry };
}
