// Оплата. PAYMENT_MODE=stub — локальна заглушка; PAYMENT_MODE=monobank — Monobank acquiring.
// Документація Monobank: https://monobank.ua/api-docs/acquiring
// Валюта рахунку: для України гривня (ccy 980), для інших країн євро (ccy 978). Якщо Monobank не приймає рахунок у євро (валюту не ввімкнено для мерчанта),
// виставляється рахунок у гривнях за курсом, а система запам'ятовує це й надалі одразу виставляє гривні; адмінка показує попередження й дає спробувати знову.
import { HttpError } from './util.js';
const MONO = 'https://api.monobank.ua';
const providerError = () => new HttpError(502, 'payment_provider_error');
const EUR_OFF = 'pay_eur_off';

export async function eurInvoiceOff(env) {
  const r = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(EUR_OFF).first();
  if (!r || !r.value) return null;
  try { return JSON.parse(r.value); } catch { return { at: 0, error: String(r.value) }; }
}
export async function setEurInvoiceOff(env, v) {
  if (!v) { await env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(EUR_OFF).run(); return; }
  await env.DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(EUR_OFF, JSON.stringify(v), Date.now()).run();
}

async function monoCreate(env, order, amount, ccy) {
  try {
    const res = await fetch(`${MONO}/api/merchant/invoice/create`, {
      method: 'POST',
      headers: { 'X-Token': env.MONOBANK_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount, ccy,
        merchantPaymInfo: { reference: order.id, destination: 'ReeAdvent: адвент-календар для двох', basketOrder: [{ name: 'ReeAdvent — адвент-календар для двох', qty: 1, sum: amount, unit: 'шт.' }] },
        redirectUrl: `${env.BASE_URL}/thanks.html?order=${order.id}`,
        webHookUrl: `${env.BASE_URL}/api/payments/monobank/webhook`,
        validity: 3600
      })
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.invoiceId) return { ok: false, status: res.status, error: String(j.errText || j.errCode || 'http_' + res.status).slice(0, 200) };
    return { ok: true, invoiceId: j.invoiceId, pageUrl: j.pageUrl };
  } catch (e) { return { ok: false, status: 0, error: 'network' }; }
}

/** Рахунок на оплату замовлення. Повертає { invoiceId, pageUrl, ccy, amount }: валюту й суму, які справді виставлено (їх перевіряємо при оплаті й поверненні).
 * uahPerEur: курс для рахунку в гривнях за замовлення в євро (коли банк не приймає євро). */
export async function createInvoice(env, order, uahPerEur = 0) {
  const eur = order.currency === 'EUR';
  const uahAmount = () => { if (!eur) return order.amount_kop; if (!(uahPerEur > 0)) throw providerError(); return Math.max(100, Math.round(order.amount_kop / 100 * uahPerEur) * 100); };
  const off = eur && await eurInvoiceOff(env);
  if (env.PAYMENT_MODE !== 'monobank') return { invoiceId: 'stub_' + order.id, pageUrl: `${env.BASE_URL}/api/dev/pay/${order.id}`, ccy: eur && !off ? 978 : 980, amount: eur && !off ? order.amount_kop : uahAmount() };
  if (eur && !off) {
    const r = await monoCreate(env, order, order.amount_kop, 978);
    if (r.ok) return { invoiceId: r.invoiceId, pageUrl: r.pageUrl, ccy: 978, amount: order.amount_kop };
    if (!(r.status >= 400 && r.status < 500)) throw providerError();      // збій банку чи мережі: валюта тут ні до чого
    const u = await monoCreate(env, order, uahAmount(), 980);
    if (!u.ok) throw providerError();
    await setEurInvoiceOff(env, { at: Date.now(), error: r.error });                          // гривневий рахунок пройшов, а в євро ні: банк не приймає саме євро
    return { invoiceId: u.invoiceId, pageUrl: u.pageUrl, ccy: 980, amount: uahAmount() };
  }
  const u = await monoCreate(env, order, uahAmount(), 980);
  if (!u.ok) throw providerError();
  return { invoiceId: u.invoiceId, pageUrl: u.pageUrl, ccy: 980, amount: uahAmount() };
}

/** Валюта й сума виставленого рахунку замовлення (старі замовлення: гривня й сума замовлення). */
export const invoiceOf = o => ({ ccy: Number(o.inv_ccy) || (o.currency === 'EUR' ? 978 : 980), amount: o.inv_amount != null ? Number(o.inv_amount) : Number(o.amount_kop) });
/** Сума повернення у валюті рахунку: якщо замовлення в євро оплачено гривневим рахунком, переводимо пропорційно. */
export const toInvoiceUnits = (o, kop) => { const inv = invoiceOf(o); return inv.amount === Number(o.amount_kop) || !(o.amount_kop > 0) ? kop : Math.round(inv.amount * kop / o.amount_kop); };

/** Статус інвойсу з Monobank (нашим токеном; тілу вебхука не віримо). */
export async function invoiceStatus(env, invoiceId) {
  const res = await fetch(`${MONO}/api/merchant/invoice/status?invoiceId=${encodeURIComponent(invoiceId)}`, { headers: { 'X-Token': env.MONOBANK_TOKEN } });
  if (!res.ok) return null;
  return res.json();
}
/** Оплату підтверджено: статус success, сума й валюта збігаються з виставленим рахунком. */
export async function verifyPaid(env, invoiceId, expectedAmount, expectedCcy = 980) {
  if (env.PAYMENT_MODE !== 'monobank') return true;
  const j = await invoiceStatus(env, invoiceId);
  return !!j && j.status === 'success' && Number(j.amount) === expectedAmount && (j.ccy == null || Number(j.ccy) === Number(expectedCcy));
}

/** Скасування/повернення оплати через Monobank (повне або часткове; сума у валюті рахунку). Повертає { ok, status } або { ok:false, error }. */
export async function cancelInvoice(env, invoiceId, amountKop, extRef) {
  try {
    const res = await fetch(`${MONO}/api/merchant/invoice/cancel`, {
      method: 'POST', headers: { 'X-Token': env.MONOBANK_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceId, extRef, amount: amountKop })
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: j.errText || j.errCode || ('http_' + res.status) };
    return { ok: true, status: j.status || 'processing' };
  } catch (e) { return { ok: false, error: 'network' }; }
}
