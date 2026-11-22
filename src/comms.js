// Журнал листів клієнтам (розділ «Комунікації» в адмінці).
// Кожен лист, який система надсилає клієнту, записується: кому, коли, який саме, чим закінчилась відправка і на якому етапі замовлення він пішов:
//   before: до замовлення: клієнт почав оформлення, але не оплатив (нагадування про незавершену оплату);
//   during: під час замовлення: від оплати до завершення календаря (24 дні): підтвердження, запрошення, доступ, нагадування, відповіді підтримки;
//   after: після замовлення: календар завершився або кошти повернено.
// У текст листа в журнал потрапляє без посилань для входу й одноразових кодів (їх замінено на «…»), щоб журнал не містив чинних ключів доступу.
// Журнал не повинен ламати відправку: якщо таблиці ще немає (міграція 0011) або запис не вдався, лист усе одно йде.
import { DAYS, fromDateStr, nowOf, HttpError } from './util.js';

export const PHASES = { before: 'До замовлення', during: 'Під час замовлення', after: 'Після замовлення' };
export const KINDS = {
  recovery_1: 'Незавершена оплата: перше нагадування', recovery_2: 'Незавершена оплата: друге нагадування',
  welcome: 'Підтвердження покупцю й доступ', partner_invite: 'Запрошення партнеру', access: 'Доступ надіслано повторно', login: 'Посилання для входу',
  reminder_survey: 'Нагадування: заповніть анкету', reminder_eve: 'Нагадування: завтра старт', reminder_window: 'Нагадування: відкрийте сьогоднішнє вікно',
  refund: 'Повернення коштів', support_reply: 'Відповідь підтримки'
};
const BEFORE = new Set(['recovery_1', 'recovery_2']);
// Та сама схема, що в migrations/0011_email_log.sql: якщо міграцію ще не виконано, таблиця створюється сама при першому зверненні (IF NOT EXISTS: повторно безпечно)
export const DDL = [
  "CREATE TABLE IF NOT EXISTS email_log (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at INTEGER NOT NULL, to_email TEXT NOT NULL, subject TEXT NOT NULL, kind TEXT NOT NULL, phase TEXT NOT NULL, order_id TEXT, member_id TEXT, status TEXT NOT NULL DEFAULT 'sent', error TEXT, ext_id TEXT, body TEXT)",
  'CREATE INDEX IF NOT EXISTS idx_email_log_time ON email_log(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_email_log_order ON email_log(order_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_email_log_to ON email_log(to_email)'
];
let ensured = false;
export async function ensureLog(env) { if (ensured) return; for (const sql of DDL) await env.DB.prepare(sql).run(); ensured = true; }
const noTable = e => /no such table|no such column/i.test(String((e && e.message) || e));
const q1 = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).first();
export const RESTORED_KEY = 'comms_restored';   // settings: коли завершилось відновлення раніше надісланих листів
const qa = async (env, sql, ...a) => (await env.DB.prepare(sql).bind(...a).all()).results;

/** Прибирає з тексту листа секрети: у посиланнях лишає лише адресу сторінки, а шестизначні коди входу ховає. */
export function redact(text) {
  return String(text || '')
    .replace(/https?:\/\/[^\s<>"')]+/g, u => { const i = u.search(/[?#]/); return i < 0 ? u : u.slice(0, i + 1) + '…'; })
    .replace(/\b\d{6}\b(?=\s*\((?:діє|valid))/g, '••••••')
    .slice(0, 8000);
}

/** Етап замовлення, на якому надіслано лист. startDate: дата старту календаря (РРРР-ММ-ДД), якщо відома. */
export function phaseFor(kind, startDate, nowMs) {
  if (BEFORE.has(kind)) return 'before';
  if (kind === 'refund') return 'after';
  if (startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && Math.floor(nowMs / 864e5) >= fromDateStr(startDate) + DAYS) return 'after';
  return 'during';
}

/** Записує лист у журнал. Ніколи не кидає помилок. m: { kind, to, subject, text, status, error, extId, orderId, memberId, startDate }. */
export async function logEmail(env, m) {
  try {
    let orderId = m.orderId || null, startDate = m.startDate || null;
    const memberId = m.memberId || null;
    if (!orderId && memberId) { const r = await q1(env, 'SELECT c.order_id AS oid, c.start_date AS sd FROM members m JOIN calendars c ON c.id = m.calendar_id WHERE m.id = ?', memberId); if (r) { orderId = r.oid; startDate = startDate || r.sd; } }
    else if (orderId && !startDate) { const r = await q1(env, 'SELECT start_date AS sd FROM calendars WHERE order_id = ?', orderId); if (r) startDate = r.sd; }
    const to = String(m.to || '').trim().toLowerCase();
    if (!orderId && m.kind === 'support_reply' && to) { // відповідь підтримки: прив'язуємо до найновішого замовлення цієї пошти
      const r = await q1(env, 'SELECT o.id AS oid, c.start_date AS sd FROM orders o LEFT JOIN calendars c ON c.order_id = o.id WHERE lower(o.email_a) = ? OR lower(o.email_b) = ? OR lower(o.payer_email) = ? ORDER BY o.created_at DESC LIMIT 1', to, to, to);
      if (r) { orderId = r.oid; startDate = startDate || r.sd; }
    }
    const phase = m.phase || phaseFor(m.kind, startDate, nowOf(env).getTime());
    const ins = () => env.DB.prepare('INSERT INTO email_log (created_at, to_email, subject, kind, phase, order_id, member_id, status, error, ext_id, body) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .bind(Date.now(), to, String(m.subject || '').slice(0, 300), String(m.kind || 'other'), phase, orderId, memberId, m.status === 'failed' ? 'failed' : 'sent', m.error ? String(m.error).slice(0, 300) : null, m.extId ? String(m.extId).slice(0, 80) : null, redact(m.text)).run();
    try { await ins(); } catch (e) { if (!noTable(e)) throw e; await ensureLog(env); await ins(); }
  } catch (e) { /* збій запису в журнал: лист уже надіслано, нічого не ламаємо */ }
}

/** Виконує запит до журналу; якщо таблиці ще немає, створює її й повторює. Якщо створити не вдалося, повертає fallback. */
async function withLog(env, fn, fallback) {
  try { return await fn(); }
  catch (e) { if (!noTable(e)) throw e; try { await ensureLog(env); return await fn(); } catch (e2) { return fallback; } }
}
const like = s => '%' + String(s).replace(/[\\%_]/g, '\\$&') + '%';

/** Список листів для розділу «Комунікації»: фільтри phase, kind, status, order, q (пошта, тема, ім'я клієнта, номер замовлення), курсор before (id). */
export async function commsList(env, sp) {
  const phase = ['before', 'during', 'after'].includes(sp.get('phase')) ? sp.get('phase') : null;
  const status = ['sent', 'failed', 'restored'].includes(sp.get('status')) ? sp.get('status') : null;
  const kind = /^[a-z0-9_]{3,30}$/.test(sp.get('kind') || '') ? sp.get('kind') : null;
  const order = /^[\w-]{3,64}$/.test(sp.get('order') || '') ? sp.get('order') : null;
  const qtxt = String(sp.get('q') || '').trim().slice(0, 80), cur = /^(\d{1,15}):(\d{1,12})$/.exec(sp.get('before') || ''), cursor = !!cur, limit = Math.min(100, Math.max(1, Number(sp.get('limit')) || 50));
  const where = [], args = [];
  if (phase) { where.push('l.phase = ?'); args.push(phase); }
  if (status) { where.push('l.status = ?'); args.push(status); }
  if (kind) { where.push('l.kind = ?'); args.push(kind); }
  if (order) { where.push('l.order_id = ?'); args.push(order); }
  if (qtxt) { const lk = like(qtxt); where.push("(l.to_email LIKE ? ESCAPE '\\' OR l.subject LIKE ? ESCAPE '\\' OR l.order_id = ? OR l.order_id IN (SELECT id FROM orders WHERE name_a LIKE ? ESCAPE '\\' OR name_b LIKE ? ESCAPE '\\'))"); args.push(lk, lk, qtxt, lk, lk); }
  if (cur) { where.push('(l.created_at < ? OR (l.created_at = ? AND l.id < ?))'); args.push(+cur[1], +cur[1], +cur[2]); }   // курсор «час:id»: листи впорядковано за часом, а не за номером запису
  return withLog(env, async () => {
    const rows = await qa(env, `SELECT l.id, l.created_at, l.to_email, l.subject, l.kind, l.phase, l.order_id, l.status, l.error, o.name_a, o.name_b FROM email_log l LEFT JOIN orders o ON o.id = l.order_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY l.created_at DESC, l.id DESC LIMIT ?`, ...args, limit + 1);
    const more = rows.length > limit; if (more) rows.pop();
    const out = { ok: true, labels: KINDS, phases: PHASES, rows: rows.map(r => ({ id: r.id, at: r.created_at, to: r.to_email, subject: r.subject, kind: r.kind, phase: r.phase, orderId: r.order_id, names: r.name_a ? `${r.name_a} і ${r.name_b}` : null, status: r.status, error: r.error })), more };
    if (more) { const last = rows.at(-1); out.next = `${last.created_at}:${last.id}`; }
    if (!cursor) {
      const s = await q1(env, 'SELECT COUNT(*) AS total, SUM(phase = ?) AS b, SUM(phase = ?) AS d, SUM(phase = ?) AS a, SUM(status = ?) AS f, SUM(created_at > ?) AS w, MIN(created_at) AS first, SUM(status = ?) AS r, MIN(CASE WHEN status <> ? THEN created_at END) AS live FROM email_log', 'before', 'during', 'after', 'failed', Date.now() - 7 * 864e5, 'restored', 'restored');
      out.stats = { total: s.total || 0, before: s.b || 0, during: s.d || 0, after: s.a || 0, failed: s.f || 0, week: s.w || 0, first: s.first || null, restored: s.r || 0, liveFirst: s.live || null };
      const flag = await q1(env, 'SELECT value FROM settings WHERE key = ?', RESTORED_KEY); out.restore = { at: flag ? Number(flag.value) || 1 : null };
      out.kinds = (await qa(env, 'SELECT kind, COUNT(*) AS n FROM email_log GROUP BY kind ORDER BY n DESC')).map(k => ({ kind: k.kind, label: KINDS[k.kind] || k.kind, n: k.n }));
    }
    return out;
  }, { ok: true, migrate: true, rows: [], more: false });
}

/** Один лист із текстом (без посилань для входу й кодів). */
export async function commsGet(env, id) {
  const r = await withLog(env, () => q1(env, 'SELECT l.*, o.name_a, o.name_b FROM email_log l LEFT JOIN orders o ON o.id = l.order_id WHERE l.id = ?', id), null);
  if (!r) throw new HttpError(404, 'not_found');
  return { ok: true, mail: { id: r.id, at: r.created_at, to: r.to_email, subject: r.subject, kind: r.kind, label: KINDS[r.kind] || r.kind, phase: r.phase, phaseLabel: PHASES[r.phase] || r.phase, orderId: r.order_id, names: r.name_a ? `${r.name_a} і ${r.name_b}` : null, status: r.status, error: r.error, extId: r.ext_id, body: r.body || '' } };
}

/** Хронологія замовлення: віхи (оформлення, оплата, старт, завершення, повернення) разом із листами, що йому пішли. */
export async function commsOrder(env, orderId, order) {
  if (!order) throw new HttpError(404, 'not_found');
  const cal = await q1(env, 'SELECT start_date FROM calendars WHERE order_id = ?', orderId);
  const mails = await withLog(env, () => qa(env, 'SELECT id, created_at, to_email, subject, kind, phase, status, error FROM email_log WHERE order_id = ? ORDER BY created_at ASC, id ASC LIMIT 300', orderId), null);
  if (!mails) return { ok: true, migrate: true, order, milestones: [], mails: [] };
  const ms = [{ at: order.created_at, key: 'created', label: 'Оформлення розпочато' }];
  if (order.paid_at) ms.push({ at: order.paid_at, key: 'paid', label: 'Оплачено' });
  if (cal && cal.start_date) { const s = fromDateStr(cal.start_date) * 864e5; ms.push({ at: s, key: 'start', label: 'Старт календаря', day: cal.start_date }, { at: s + DAYS * 864e5, key: 'end', label: 'Календар завершено', day: cal.start_date }); }
  if (order.refunded_at) ms.push({ at: order.refunded_at, key: 'refunded', label: 'Кошти повернено' });
  return { ok: true, order, labels: KINDS, phases: PHASES, milestones: ms, mails: mails.map(r => ({ id: r.id, at: r.created_at, to: r.to_email, subject: r.subject, kind: r.kind, label: KINDS[r.kind] || r.kind, phase: r.phase, status: r.status, error: r.error })) };
}

/** Чистка: листи старші за 24 місяці й листи замовлень, чиї персональні дані вже видалено. Ніколи не кидає помилок. */
export async function purgeComms(env, nowMs, orderIds = []) {
  try {
    for (const id of orderIds) await env.DB.prepare('DELETE FROM email_log WHERE order_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM email_log WHERE created_at < ?').bind(nowMs - 730 * 864e5).run();
  } catch (e) { /* таблиці ще немає */ }
}
