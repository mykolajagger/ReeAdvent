// Анонімна воронка лендингу без cookies: скільки сесій прийшло з кожного джерела, скільки почали заповнювати форму,
// скільки перейшли до оплати й скільки оплатили. Зберігаються лише денні лічильники (день, сторінка, джерело, кампанія, подія):
// жодних IP, cookies, ідентифікаторів чи адрес. Тому згода на cookies для цього не потрібна, і видно всіх відвідувачів.
const EVENTS = ['view', 'form', 'checkout'];
const PAGES = { '/': 'landing', '/index.html': 'landing', '/thanks.html': 'thanks' };
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pingdom|monitor/i;
const tag = (v, d) => { const s = String(v || '').toLowerCase().trim().replace(/[^a-z0-9_.-]+/g, '_').slice(0, 40); return s || d; };

export async function recordVisit(env, request, b = {}) {
  if (BOT.test(request.headers.get('user-agent') || '')) return { ok: true, skipped: 'bot' };
  const ev = EVENTS.includes(b.e) ? b.e : null; if (!ev) return { ok: false };
  const page = PAGES[String(b.p || '/')] || 'other', src = tag(b.s, 'direct'), camp = tag(b.c, '-');
  const day = new Date(Date.now() + 2 * 36e5).toISOString().slice(0, 10);   // день за Києвом (приблизно, без літнього часу)
  await env.DB.prepare('INSERT INTO visit_daily (day, page, source, campaign, ev, n) VALUES (?,?,?,?,?,1) ON CONFLICT(day, page, source, campaign, ev) DO UPDATE SET n = n + 1').bind(day, page, src, camp, ev).run();
  return { ok: true };
}

/** Воронка за N днів по джерелах і кампаніях: сесії на лендингу → почали форму → перейшли до оплати → оплатили. */
export async function funnel(env, days = 7, now = Date.now()) {
  const from = new Date(now + 2 * 36e5 - (days - 1) * 864e5).toISOString().slice(0, 10), fromMs = now - days * 864e5;
  let rows = []; try { rows = (await env.DB.prepare("SELECT source, campaign, ev, SUM(n) n FROM visit_daily WHERE day >= ? AND page = 'landing' GROUP BY source, campaign, ev").bind(from).all()).results || []; } catch {}
  let paid = []; try { paid = (await env.DB.prepare("SELECT COALESCE(utm_source, 'direct') source, COALESCE(utm_campaign, '-') campaign, COUNT(*) n, SUM(amount_kop) kop FROM orders WHERE status = 'paid' AND paid_at > ? AND archived_at IS NULL GROUP BY 1, 2").bind(fromMs).all()).results || []; } catch {}
  const map = new Map(), key = (s, c) => s + '|' + c, get = (s, c) => { const k = key(s, c); if (!map.has(k)) map.set(k, { source: s, campaign: c, view: 0, form: 0, checkout: 0, paid: 0, revenue: 0 }); return map.get(k); };
  for (const r of rows) get(r.source, r.campaign)[r.ev] += Number(r.n) || 0;
  for (const r of paid) { const x = get(tag(r.source, 'direct'), tag(r.campaign, '-')); x.paid += Number(r.n) || 0; x.revenue += Math.round((Number(r.kop) || 0) / 100); }
  const list = [...map.values()].sort((a, b) => b.view - a.view || b.paid - a.paid);
  const total = list.reduce((t, x) => { for (const k of ['view', 'form', 'checkout', 'paid', 'revenue']) t[k] += x[k]; return t; }, { source: 'Усього', campaign: '', view: 0, form: 0, checkout: 0, paid: 0, revenue: 0 });
  let daily = []; try { daily = (await env.DB.prepare("SELECT day, SUM(CASE WHEN ev = 'view' THEN n ELSE 0 END) view, SUM(CASE WHEN ev = 'checkout' THEN n ELSE 0 END) checkout FROM visit_daily WHERE day >= ? AND page = 'landing' GROUP BY day ORDER BY day").bind(from).all()).results || []; } catch {}
  return { days, rows: list, total, daily };
}
