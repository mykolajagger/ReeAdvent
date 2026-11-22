// Реклама: ID трекінгу (піксель, GA4, Google Ads), UTM-мітки замовлень, облік витрат і звіт за джерелами.
import { getSettings } from './settings.js';
const getSetting = async (env, k) => { const r = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(k).first(); return r ? r.value : null; };
const setSetting = (env, k, v) => env.DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(k, v, Date.now()).run();
export const CHANNELS = ['meta', 'google', 'influencer', 'tiktok', 'telegram', 'pinterest', 'other'];
const RULES = { meta: /^\d{8,20}$/, ga4: /^G-[A-Z0-9]{6,14}$/, gads: /^AW-\d{6,14}$/, gads_label: /^[A-Za-z0-9_-]{6,40}$/ };

export async function trackConfig(env) {
  const out = {}; for (const k of Object.keys(RULES)) out[k] = (await getSetting(env, 'track_' + k)) || '';
  out.budget = Number(await getSetting(env, 'ads_budget_usd')) || 500; return out;
}
/** Публічна частина: лише ID, що й так видно в коді сторінки. */
export async function publicTrackConfig(env) { const c = await trackConfig(env); return { meta: c.meta, ga4: c.ga4, gads: c.gads, gadsLabel: c.gads_label }; }
export async function saveTrackConfig(env, b = {}) {
  for (const [k, re] of Object.entries(RULES)) {
    if (b[k] === undefined) continue; const v = String(b[k]).trim();
    if (v && !re.test(v)) return { ok: false, error: { meta: 'ID піксела Meta: 8–20 цифр', ga4: 'GA4: формат G-XXXXXXXXXX', gads: 'Google Ads: формат AW-1234567890', gads_label: 'Мітка конверсії: літери, цифри, - і _' }[k] };
    await setSetting(env, 'track_' + k, v);
  }
  if (b.budget !== undefined) { const n = Number(b.budget); if (!(n >= 0 && n <= 1e6)) return { ok: false, error: 'Бюджет: число від 0' }; await setSetting(env, 'ads_budget_usd', String(Math.round(n))); }
  return { ok: true };
}
/** UTM з тіла замовлення: лише безпечні короткі значення. */
export function cleanUtm(u) {
  const o = {}; if (!u || typeof u !== 'object') return o;
  for (const k of ['source', 'medium', 'campaign', 'content', 'term']) { const v = String(u[k] ?? '').trim().toLowerCase().slice(0, 80); if (v && /^[\p{L}\p{N}_.\-+ %~:/]+$/u.test(v)) o['utm_' + k] = v; }
  return o;
}
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export async function addSpend(env, { day, channel, campaign, amount, note }) {
  const cents = Math.round(Number(amount) * 100);
  if (!DAY_RE.test(String(day))) return { ok: false, error: 'Некоректна дата' };
  if (!CHANNELS.includes(channel)) return { ok: false, error: 'Невідомий канал' };
  if (!(cents > 0 && cents < 1e8)) return { ok: false, error: 'Сума: більше нуля' };
  await env.DB.prepare('INSERT INTO ad_spend (day, channel, campaign, amount_cents, note, created_at) VALUES (?,?,?,?,?,?)').bind(day, channel, String(campaign || '').trim().toLowerCase().slice(0, 80) || null, cents, String(note || '').slice(0, 120) || null, Date.now()).run();
  return { ok: true };
}
export const deleteSpend = (env, id) => env.DB.prepare('DELETE FROM ad_spend WHERE id = ?').bind(Number(id)).run();
export async function listSpend(env, limit = 80) { return (await env.DB.prepare('SELECT id, day, channel, campaign, amount_cents, note FROM ad_spend ORDER BY day DESC, id DESC LIMIT ?').bind(limit).all()).results; }

/** Звіт за період (ms): замовлення й виручка за джерелами/кампаніями + витрати (USD) → CPA, ROAS у гривнях за курсом із налаштувань. */
export async function adsReport(env, fromMs, toMs) {
  const st = await getSettings(env), rate = Number(st.usd_rate) || 40;
  const fromDay = new Date(fromMs).toISOString().slice(0, 10), toDay = new Date(toMs).toISOString().slice(0, 10);
  const src = `COALESCE(NULLIF(utm_source, ''), '(пряме)')`;
  const orders = (await env.DB.prepare(`SELECT ${src} AS source, COALESCE(utm_campaign, '') AS campaign, COALESCE(utm_content, '') AS content, COUNT(*) AS started, SUM(CASE WHEN status = 'paid' AND refunded_at IS NULL THEN 1 ELSE 0 END) AS paid, COALESCE(SUM(CASE WHEN status = 'paid' AND refunded_at IS NULL THEN amount_kop ELSE 0 END), 0) AS revenue_kop FROM orders WHERE created_at BETWEEN ? AND ? GROUP BY 1, 2, 3 ORDER BY revenue_kop DESC, started DESC`).bind(fromMs, toMs).all()).results;
  const spend = (await env.DB.prepare('SELECT channel, COALESCE(SUM(amount_cents), 0) AS cents FROM ad_spend WHERE day BETWEEN ? AND ? GROUP BY channel').bind(fromDay, toDay).all()).results;
  const bySource = {}; for (const o of orders) { const s = bySource[o.source] = bySource[o.source] || { source: o.source, started: 0, paid: 0, revenue_kop: 0, spend_cents: 0 }; s.started += o.started; s.paid += o.paid; s.revenue_kop += o.revenue_kop; }
  for (const sp of spend) { const s = bySource[sp.channel] = bySource[sp.channel] || { source: sp.channel, started: 0, paid: 0, revenue_kop: 0, spend_cents: 0 }; s.spend_cents += sp.cents; }
  const rows = Object.values(bySource).map(s => { const spendUah = s.spend_cents / 100 * rate; return { ...s, cpa_usd: s.paid && s.spend_cents ? Math.round(s.spend_cents / s.paid) / 100 : null, roas: spendUah > 0 ? Math.round(s.revenue_kop / 100 / spendUah * 100) / 100 : null }; }).sort((a, b) => b.revenue_kop - a.revenue_kop || b.spend_cents - a.spend_cents);
  const tot = rows.reduce((t, r) => ({ started: t.started + r.started, paid: t.paid + r.paid, revenue_kop: t.revenue_kop + r.revenue_kop, spend_cents: t.spend_cents + r.spend_cents }), { started: 0, paid: 0, revenue_kop: 0, spend_cents: 0 });
  const allSpend = (await env.DB.prepare('SELECT COALESCE(SUM(amount_cents), 0) AS c FROM ad_spend').first()).c;
  return { rate, rows, campaigns: orders.filter(o => o.source !== '(пряме)'), totals: { ...tot, cpa_usd: tot.paid && tot.spend_cents ? Math.round(tot.spend_cents / tot.paid) / 100 : null, roas: tot.spend_cents ? Math.round(tot.revenue_kop / 100 / (tot.spend_cents / 100 * rate) * 100) / 100 : null }, spentAllCents: allSpend };
}
