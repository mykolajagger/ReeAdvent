// Оцінки пунктів календаря (подарунок, пригода, активність, питання дня) від 1 до 5 зірок.
// Зведений рейтинг впливає на вибір у нових календарях: улюблене трапляється частіше, слабке рідше. Пара, що замовляє знову, не отримує вже отримане.
import { HttpError, DAYS, todayIndex, nowOf } from './util.js';
import { GIFTS, INTIMATE, ACTIVITIES, QUESTIONS } from './logic.js';

export const KINDS = ['gift', 'intim', 'act', 'q'];
const q1 = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).first();
const qa = async (env, sql, ...a) => (await env.DB.prepare(sql).bind(...a).all()).results;

/** Який пункт стоїть у плані дня для учасника (для подарунка — той, що дарує він). */
export function itemOf(plan, kind, slot) {
  if (!plan) return null;
  if (kind === 'gift') return plan.gift ? plan.gift[slot] ?? null : null;
  return plan[kind] ?? null;
}

/** Оцінка пункту дня. Можна змінювати; лише для відкритого дня (після відповіді на питання). */
export async function rateItem(env, mem, b) {
  const d = Math.round(Number(b.day)), kind = String(b.kind || ''), stars = Math.round(Number(b.stars));
  if (!(d >= 1 && d <= DAYS) || d > todayIndex(mem.start_date, nowOf(env), mem.tz)) throw new HttpError(400, 'bad_day');
  if (!KINDS.includes(kind)) throw new HttpError(400, 'bad_kind');
  if (!(stars >= 1 && stars <= 5)) throw new HttpError(400, 'bad_stars');
  if (!mem.schedule_json) throw new HttpError(409, 'not_ready');
  if (!(await q1(env, 'SELECT 1 AS x FROM answers WHERE member_id = ? AND day = ?', mem.id, d))) throw new HttpError(403, 'answer_first');
  const item = itemOf(JSON.parse(mem.schedule_json).days[d], kind, mem.slot);
  if (item == null) throw new HttpError(400, 'no_item');
  await env.DB.prepare('INSERT INTO item_ratings (member_id, day, kind, item_id, stars, created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(member_id, day, kind) DO UPDATE SET stars = excluded.stars, item_id = excluded.item_id, created_at = excluded.created_at')
    .bind(mem.id, d, kind, item, stars, Date.now()).run();
  return { ok: true, kind, stars };
}

/** Мої оцінки за день: { gift: 4, q: 5 }. */
export async function myRatings(env, memberId, d) {
  try { return Object.fromEntries((await qa(env, 'SELECT kind, stars FROM item_ratings WHERE member_id = ? AND day = ?', memberId, d)).map(r => [r.kind, r.stars])); } catch { return {}; }
}

/** Зведені оцінки всіх користувачів для генерації розкладу: { 'gift:12': { avg, n } }. */
export async function ratingStats(env) {
  try { return Object.fromEntries((await qa(env, 'SELECT kind, item_id, AVG(stars) AS avg, COUNT(*) AS n FROM item_ratings GROUP BY kind, item_id')).map(r => [r.kind + ':' + r.item_id, { avg: Number(r.avg), n: Number(r.n) }])); } catch { return {}; }
}

/** Що ця пара вже отримувала в попередніх календарях (за поштами обох учасників): Set('gift:12', 'act:40', ...). */
export async function seenFor(env, calendarId) {
  const seen = new Set();
  try {
    const rows = await qa(env, `SELECT DISTINCT c.schedule_json FROM calendars c JOIN members m ON m.calendar_id = c.id
      WHERE c.id <> ? AND c.schedule_json IS NOT NULL AND lower(m.email) IN (SELECT lower(email) FROM members WHERE calendar_id = ?)`, calendarId, calendarId);
    for (const r of rows) { const s = JSON.parse(r.schedule_json); for (const p of Object.values(s.days || {})) { for (const g of p.gift || []) if (g != null) seen.add('gift:' + g); for (const k of ['intim', 'act', 'q']) if (p[k] != null) seen.add(k + ':' + p[k]); } }
  } catch {}
  return seen;
}

const TITLE = { gift: id => GIFTS[id] && GIFTS[id].title, intim: id => INTIMATE[id] && INTIMATE[id].title, act: id => ACTIVITIES[id] && ACTIVITIES[id].title, q: id => QUESTIONS[id] && QUESTIONS[id].text };
/** Звіт для адмінки: по кожній категорії — найкращі й найслабші пункти (від 2 оцінок), кількість оцінок. */
export async function ratingsReport(env) {
  let rows = []; try { rows = await qa(env, 'SELECT kind, item_id, AVG(stars) AS avg, COUNT(*) AS n FROM item_ratings GROUP BY kind, item_id'); } catch {}
  const out = {};
  for (const k of KINDS) {
    const list = rows.filter(r => r.kind === k).map(r => ({ id: r.item_id, title: TITLE[k](r.item_id) || '#' + r.item_id, avg: Math.round(Number(r.avg) * 10) / 10, n: Number(r.n) }));
    const ranked = list.filter(r => r.n >= 2).sort((a, b) => b.avg - a.avg || b.n - a.n);
    out[k] = { total: list.reduce((s, r) => s + r.n, 0), items: list.length, best: ranked.slice(0, 8), worst: ranked.slice(-8).reverse().filter(r => r.avg < 4) };
  }
  return out;
}
