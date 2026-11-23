// Оплата. PAYMENT_MODE=stub — локальна заглушка; PAYMENT_MODE=monobank — Monobank acquiring.
// Документація Monobank: https://monobank.ua/api-docs/acquiring
// Рахунок завжди в гривнях (ccy 980). Для інших країн ціна задана в євро: сума рахунку = ціна в євро × курс євро (Monobank) на момент оформлення, округлено до гривні.
import { HttpError } from './util.js';
const MONO = 'https://api.monobank.ua';
const providerError = () => new HttpError(502, 'payment_provider_error');
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

/** Рахунок на оплату замовлення (завжди в гривнях). Повертає { invoiceId, pageUrl, ccy, amount }: валюту й суму, які справді виставлено.
 * uahPerEur: курс для замовлення з ціною в євро. */
export function invoiceAmountUah(order, uahPerEur) {
  if (order.currency !== 'EUR') return order.amount_kop;
  if (!(uahPerEur > 0)) throw providerError();
  return Math.max(100, Math.round(order.amount_kop / 100 * uahPerEur) * 100);
}
export async function createInvoice(env, order, uahPerEur = 0) {
  const amount = invoiceAmountUah(order, uahPerEur);
  if (env.PAYMENT_MODE !== 'monobank') return { invoiceId: 'stub_' + order.id, pageUrl: `${env.BASE_URL}/api/dev/pay/${order.id}`, ccy: 980, amount };
  const u = await monoCreate(env, order, amount, 980);
  if (!u.ok) throw providerError();
  return { invoiceId: u.invoiceId, pageUrl: u.pageUrl, ccy: 980, amount };
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
