// Нагадування (щоденно о 09:01 за часом календаря) і очищення застарілих даних.
// Викликається щогодини з Cloudflare Cron (Worker reeadvent-inbox) через POST /api/cron/daily.
import { sendEmail, reminderEmail } from './email.js';
import { issueLoginLink } from './api.js';
import { refreshFx } from './currency.js';
import { refreshToken as refreshInstagramToken } from './instagram.js';
import { runAutoPublish } from './igpublish.js';
import { nowOf, localParts, localDayNumber, hmac, toDateStr, fromDateStr, DAYS } from './util.js';

const q = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).all().then(r => r.results);
const MAX_SENDS_PER_RUN = 150;       // обмеження Resend: решта піде в наступний запуск
const REMIND_FROM_HOUR = 9, REMIND_TO_HOUR = 21; // нагадування з 09:01 до 21:00 за часом календаря

export async function unsubUrl(env, memberId) {
  const sig = await hmac(String(env.CRON_SECRET || 'dev-secret'), 'unsub:' + memberId);
  return `${env.BASE_URL}/api/unsub?m=${encodeURIComponent(memberId)}&s=${sig}`;
}
export async function checkUnsub(env, memberId, sig) { return (await hmac(String(env.CRON_SECRET || 'dev-secret'), 'unsub:' + memberId)) === sig; }

export async function runReminders(env) {
  const now = nowOf(env), nowMs = now.getTime();
  const rows = await q(env, `SELECT m.id AS mid, m.email, m.suggested_name, m.survey_json, c.start_date, c.schedule_json, c.lang, c.tz
    FROM members m JOIN calendars c ON c.id = m.calendar_id JOIN orders o ON o.id = c.order_id
    WHERE o.refunded_at IS NULL AND m.remind_off = 0 AND c.start_date >= ?`, toDateStr(Math.floor(nowMs / 864e5) - DAYS - 3));
  let sent = 0; const out = { eve: 0, survey: 0, window: 0, skipped: 0 };
  for (const r of rows) {
    if (sent >= MAX_SENDS_PER_RUN) break;
    const tz = r.tz || 'Europe/Kyiv', h = localParts(now, tz).h;
    if (h < REMIND_FROM_HOUR || h >= REMIND_TO_HOUR) continue;
    const d = localDayNumber(r.start_date, now, tz);
    if (d < 0 || d > DAYS) continue;
    const ready = !!r.schedule_json, name = r.survey_json ? JSON.parse(r.survey_json).name : r.suggested_name;
    let kind = null;
    if (!r.survey_json && d <= 3) kind = 'survey';                       // анкета: напередодні й перші дні
    else if (ready && d === 0) kind = 'eve';                             // завтра перше вікно
    else if (ready && d >= 1) {                                          // нагадати, якщо сьогоднішнє вікно ще не відкрито
      const op = await env.DB.prepare('SELECT 1 AS x FROM progress WHERE member_id = ? AND day = ? AND opened = 1').bind(r.mid, d).first();
      if (!op) kind = 'window';
    }
    if (!kind) { out.skipped++; continue; }
    // «захоплюємо» запис до відправки: повторний запуск не надішле дубль; при збої відправки — звільняємо
    const claim = await env.DB.prepare('INSERT OR IGNORE INTO reminders_sent (member_id, kind, day, sent_at) VALUES (?,?,?,?)').bind(r.mid, kind, d, nowMs).run();
    if (!claim.meta?.changes) continue;
    try {
      const link = await issueLoginLink(env, r.mid, 3 * 24 * 3600e3);
      const mail = reminderEmail(env, kind, { name, day: d, startDate: r.start_date, link, unsubUrl: await unsubUrl(env, r.mid), lang: r.lang, beforeStart: d <= 0 });
      await sendEmail(env, r.email, mail.subject, mail.html, mail.text);
      sent++; out[kind]++;
    } catch (e) {
      console.error('reminder failed', e);
      await env.DB.prepare('DELETE FROM reminders_sent WHERE member_id = ? AND kind = ? AND day = ?').bind(r.mid, kind, d).run();
    }
  }
  out.sent = sent;
  return out;
}

/** Видаляє персональні дані календарів через 12 місяців після завершення; замовлення знеособлюються (облік лишається). */
export async function purgeOld(env) {
  const now = nowOf(env).getTime(), today = Math.floor(now / 864e5);
  const cutoff = toDateStr(today - 365 - DAYS);                  // календар завершився понад рік тому
  const cals = await q(env, 'SELECT c.id, c.order_id FROM calendars c WHERE c.start_date < ? LIMIT 50', cutoff);
  for (const c of cals) {
    const mem = await q(env, 'SELECT id FROM members WHERE calendar_id = ?', c.id);
    const stmts = [];
    for (const m of mem) for (const t of ['answers', 'progress', 'sessions', 'login_tokens', 'login_codes', 'reminders_sent', 'venue_ratings', 'venue_reports']) stmts.push(env.DB.prepare(`DELETE FROM ${t} WHERE member_id = ?`).bind(m.id));
    stmts.push(env.DB.prepare('DELETE FROM members WHERE calendar_id = ?').bind(c.id), env.DB.prepare('DELETE FROM calendars WHERE id = ?').bind(c.id),
      env.DB.prepare("UPDATE orders SET name_a = '—', name_b = '—', email_a = ?, email_b = ?, payer_email = NULL, note = NULL WHERE id = ?").bind(`deleted-a-${c.order_id}@deleted.invalid`, `deleted-b-${c.order_id}@deleted.invalid`, c.order_id));
    await env.DB.batch(stmts);
  }
  // листування підтримки: 24 місяці
  const msgCut = now - 730 * 864e5;
  await env.DB.prepare('DELETE FROM messages WHERE created_at < ?').bind(msgCut).run();
  await env.DB.prepare('DELETE FROM threads WHERE last_at < ?').bind(msgCut).run();
  await env.DB.prepare('DELETE FROM admin_tokens WHERE expires_at < ?').bind(now - 864e5).run();
  await env.DB.prepare('DELETE FROM login_tokens WHERE expires_at < ?').bind(now - 864e5).run();
  return { calendars: cals.length };
}

export async function runDaily(env) {
  const fx = await refreshFx(env); // курси валют оновлюються раз на добу
  try { await refreshInstagramToken(env); } catch (e) { console.error('instagram refresh', e); }
  try { await runAutoPublish(env); } catch (e) { console.error('instagram publish', e); }
  const reminders = await runReminders(env);
  let purge = null;
  if (nowOf(env).getUTCHours() === 1) purge = await purgeOld(env);
  return { reminders, purge, fx };
}
