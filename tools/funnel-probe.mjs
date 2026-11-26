// Лише читання: воронка лендингу за 3 дні (перегляди → заповнення форми → перехід до оплати → оплачені) і замовлення. Без персональних даних.
import { makeRestDb } from './d1-rest.mjs';
const db = makeRestDb({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID, databaseId: process.env.D1_DATABASE_ID, token: process.env.CLOUDFLARE_API_TOKEN });
const from = new Date(Date.now() - 4 * 864e5).toISOString().slice(0, 10);
const v = (await db.prepare("SELECT day, source, campaign, ev, SUM(n) n FROM visit_daily WHERE day >= ? AND page = 'landing' GROUP BY day, source, campaign, ev ORDER BY day, source, campaign").bind(from).all()).results || [];
const rows = {}; for (const r of v) { const k = `${r.day} ${r.source || '(прямі)'} ${r.campaign || ''}`; (rows[k] = rows[k] || { view: 0, form: 0, checkout: 0 })[r.ev] = r.n; }
console.log('Воронка лендингу (день, джерело, кампанія: перегляди / почали форму / перейшли до оплати):');
for (const [k, x] of Object.entries(rows)) console.log(`  ${k}: ${x.view} / ${x.form} / ${x.checkout}`);
const since = Date.parse(from);
const o = (await db.prepare("SELECT status, COUNT(*) n, SUM(CASE WHEN utm_source IS NOT NULL THEN 1 ELSE 0 END) utm FROM orders WHERE created_at >= ? GROUP BY status").bind(since).all()).results || [];
console.log('Замовлення за 3 дні за статусом: ' + (o.map(x => `${x.status}: ${x.n} (з рекламних посилань ${x.utm})`).join('; ') || 'немає'));
const cols = (await db.prepare("PRAGMA table_info(orders)").all()).results.map(c => c.name);
console.log('Колонки orders (для діагностики): ' + cols.filter(c => /status|paid|test|utm|amount|created/.test(c)).join(', '));

const byAd = (await db.prepare("SELECT campaign, ev, SUM(n) n FROM visit_daily WHERE day >= ? AND page = 'landing' AND source = 'meta' GROUP BY campaign, ev").bind(from).all()).results || [];
console.log('Meta (з міткою utm) за період: ' + byAd.map(x => `${x.campaign} ${x.ev}=${x.n}`).join(', '));
const oc = (await db.prepare("SELECT utm_campaign, utm_content, status, COUNT(*) n FROM orders WHERE created_at >= ? AND utm_source IS NOT NULL GROUP BY utm_campaign, utm_content, status").bind(since).all()).results || [];
console.log('Замовлення з рекламних посилань: ' + (oc.map(x => `${x.utm_campaign}/${x.utm_content} ${x.status}: ${x.n}`).join('; ') || 'немає'));
const od = (await db.prepare("SELECT date(created_at/1000,'unixepoch') d, status, COUNT(*) n FROM orders WHERE created_at >= ? GROUP BY d, status ORDER BY d").bind(since).all()).results || [];
console.log('Замовлення по днях: ' + (od.map(x => `${x.d} ${x.status}: ${x.n}`).join('; ') || 'немає'));
