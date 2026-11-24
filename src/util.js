export const enc = new TextEncoder();

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
}
export class HttpError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }

export function b64url(bytes) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
export function randomToken(n = 32) { return b64url(crypto.getRandomValues(new Uint8Array(n))); }
export function uid() { return randomToken(12); }
export async function sha256(s) { return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))); }

export function parseCookies(req) {
  const out = {};
  for (const p of (req.headers.get('cookie') || '').split(';')) { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); }
  return out;
}
export function sessionCookie(value, maxAgeSec, secure = true) {
  return `rs=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
}

export const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;
export const normEmail = e => String(e || '').trim().toLowerCase();
export const cleanText = (s, max) => String(s || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

export const TZ = 'Europe/Kyiv';
export const UNLOCK_HOUR = 7;
export const DAYS = 24;

/** Поточний час: у dev можна підмінити через env.NOW_OVERRIDE (лише коли env.DEV === '1'). */
export function nowOf(env) { return env.DEV === '1' && env.NOW_OVERRIDE ? new Date(env.NOW_OVERRIDE) : new Date(); }

export function localParts(date, tz = TZ) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', hourCycle: 'h23' }).formatToParts(date).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour };
}
const dayNum = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / 86400000);
export function toDateStr(num) { const dt = new Date(num * 86400000); return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`; }
export function fromDateStr(s) { const [y, m, d] = s.split('-').map(Number); return dayNum(y, m, d); }

/** Завтрашня дата за Києвом (YYYY-MM-DD) */
export function tomorrowStr(now, tz = TZ) { const p = localParts(now, tz); return toDateStr(dayNum(p.y, p.m, p.d) + 1); }

/** Який день календаря доступний зараз: 0 — ще не почався, 1..24 */
/** Скільки вікон уже відкрито для учасника. У тестовому режимі (адмінка → замовлення) відкриті всі 24. */
export const dayFor = (mem, env) => (mem && mem.test_mode ? DAYS : todayIndex(mem.start_date, nowOf(env), mem.tz));
export function todayIndex(startDate, now, tz = TZ) {
  const p = localParts(now, tz);
  const idx = dayNum(p.y, p.m, p.d) - fromDateStr(startDate) + 1 - (p.h < UNLOCK_HOUR ? 1 : 0);
  return Math.max(0, Math.min(DAYS, idx));
}
/** Реальні дати вікон: [{month, day, weekday}] для днів 1..24 */
export function windowDates(startDate) {
  const s = fromDateStr(startDate);
  return Array.from({ length: DAYS }, (_, i) => { const dt = new Date((s + i) * 86400000); return { month: dt.getUTCMonth() + 1, day: dt.getUTCDate(), weekday: dt.getUTCDay() }; });
}

/** Момент UTC (мс), коли в часовому поясі tz настає локальний час y-m-d h:00. */
export function zonedToUtc(y, m, d, h, tz) {
  const want = Date.UTC(y, m - 1, d, h); let t = want;
  for (let i = 0; i < 3; i++) { const p = localParts(new Date(t), tz); const diff = Date.UTC(p.y, p.m - 1, p.d, p.h) - want; if (!diff) break; t -= diff; }
  return t;
}
/** Точні моменти відкриття 24 вікон (мс UTC) за часом календаря. */
export function unlockTimes(startDate, tz = TZ) {
  const s = fromDateStr(startDate);
  return Array.from({ length: DAYS }, (_, i) => { const dt = new Date((s + i) * 86400000); return zonedToUtc(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), UNLOCK_HOUR, tz); });
}

/** Номер дня календаря за ЛОКАЛЬНОЮ датою (без урахування години відкриття): 0 — день до старту, 1..24, >24 — після завершення. */
export function localDayNumber(startDate, now, tz = TZ) { const p = localParts(now, tz); return dayNum(p.y, p.m, p.d) - fromDateStr(startDate) + 1; }
/** Перевірка IANA-часового поясу. */
export function validTz(tz) { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return typeof tz === 'string' && tz.length < 64; } catch { return false; } }
/** HMAC-SHA256 (base64url) для підписаних посилань (відписка тощо). */
export async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg))));
}
