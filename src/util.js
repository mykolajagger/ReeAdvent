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
export function tomorrowStr(now) { const p = localParts(now); return toDateStr(dayNum(p.y, p.m, p.d) + 1); }

/** Який день календаря доступний зараз: 0 — ще не почався, 1..24 */
export function todayIndex(startDate, now) {
  const p = localParts(now);
  const idx = dayNum(p.y, p.m, p.d) - fromDateStr(startDate) + 1 - (p.h < UNLOCK_HOUR ? 1 : 0);
  return Math.max(0, Math.min(DAYS, idx));
}
/** Реальні дати вікон: [{month, day, weekday}] для днів 1..24 */
export function windowDates(startDate) {
  const s = fromDateStr(startDate);
  return Array.from({ length: DAYS }, (_, i) => { const dt = new Date((s + i) * 86400000); return { month: dt.getUTCMonth() + 1, day: dt.getUTCDate(), weekday: dt.getUTCDay() }; });
}
