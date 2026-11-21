// Оплата. PAYMENT_MODE=stub — локальна заглушка; PAYMENT_MODE=monobank — Monobank acquiring.
// Документація Monobank: https://monobank.ua/api-docs/acquiring
const MONO = 'https://api.monobank.ua';

export async function createInvoice(env, order) {
  if (env.PAYMENT_MODE !== 'monobank') return { invoiceId: 'stub_' + order.id, pageUrl: `${env.BASE_URL}/api/dev/pay/${order.id}` };
  const res = await fetch(`${MONO}/api/merchant/invoice/create`, {
    method: 'POST',
    headers: { 'X-Token': env.MONOBANK_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: order.amount_kop, ccy: 980,
      merchantPaymInfo: { reference: order.id, destination: 'ReeAdvent: адвент-календар для двох', basketOrder: [{ name: 'ReeAdvent — адвент-календар для двох', qty: 1, sum: order.amount_kop, unit: 'шт.' }] },
      redirectUrl: `${env.BASE_URL}/thanks.html?order=${order.id}`,
      webHookUrl: `${env.BASE_URL}/api/payments/monobank/webhook`,
      validity: 3600
    })
  });
  if (!res.ok) throw new Error('payment_provider_error');
  const j = await res.json();
  return { invoiceId: j.invoiceId, pageUrl: j.pageUrl };
}

/** Статус інвойсу з Monobank (нашим токеном; тілу вебхука не віримо). */
export async function invoiceStatus(env, invoiceId) {
  const res = await fetch(`${MONO}/api/merchant/invoice/status?invoiceId=${encodeURIComponent(invoiceId)}`, { headers: { 'X-Token': env.MONOBANK_TOKEN } });
  if (!res.ok) return null;
  return res.json();
}
export async function verifyPaid(env, invoiceId, expectedAmountKop) {
  if (env.PAYMENT_MODE !== 'monobank') return true;
  const j = await invoiceStatus(env, invoiceId);
  return !!j && j.status === 'success' && Number(j.amount) === expectedAmountKop;
}

/** Скасування/повернення оплати через Monobank (повне або часткове). Повертає { ok, status } або { ok:false, error }. */
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
