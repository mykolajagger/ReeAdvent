// Промокоди та ціноутворення. Усі суми — в копійках.
export const normCode = c => String(c || '').trim().toUpperCase().replace(/\s+/g, '');
export const CODE_RE = /^[A-Z0-9_-]{3,32}$/;

export const listPriceKop = env => Math.round(Number(env.PRICE_UAH) * 100);

/** Рахує ціну зі знижкою. Мінімальна ненульова сума — 1 грн (обмеження еквайрингу). */
export function priceWith(env, promo) {
  const list = listPriceKop(env);
  let discount = 0;
  if (promo) {
    discount = promo.type === 'percent' ? Math.round(list * Math.min(100, promo.value) / 100) : Math.min(list, promo.value);
    discount = Math.max(0, Math.min(list, discount));
    if (list - discount > 0 && list - discount < 100) discount = list - 100;
  }
  return { list, discount, final: list - discount };
}

/** Знаходить і перевіряє код. Повертає { promo } або { error } (not_found | inactive | not_started | expired | exhausted). */
export async function findPromo(env, rawCode, now = Date.now()) {
  const code = normCode(rawCode);
  if (!CODE_RE.test(code)) return { error: 'not_found' };
  const p = await env.DB.prepare('SELECT * FROM promo_codes WHERE code = ?').bind(code).first();
  if (!p) return { error: 'not_found' };
  if (!p.active) return { error: 'inactive' };
  if (p.starts_at && now < p.starts_at) return { error: 'not_started' };
  if (p.expires_at && now > p.expires_at) return { error: 'expired' };
  if (p.max_uses != null && p.used_count >= p.max_uses) return { error: 'exhausted' };
  return { promo: p };
}

/** Простий лічильник запитів у D1: true, якщо ліміт не перевищено. */
export async function rateLimit(env, key, max, windowSec, now = Date.now()) {
  const win = Math.floor(now / (windowSec * 1000));
  await env.DB.prepare('INSERT INTO rate_limits (key, win, n) VALUES (?, ?, 1) ON CONFLICT(key, win) DO UPDATE SET n = n + 1').bind(key, win).run();
  const r = await env.DB.prepare('SELECT n FROM rate_limits WHERE key = ? AND win = ?').bind(key, win).first();
  if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM rate_limits WHERE win < ?').bind(win - 2).run();
  return r.n <= max;
}
