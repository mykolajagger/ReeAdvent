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

/** Безпечна перевірка: не вірить тілу вебхука, а питає статус інвойсу у Monobank нашим токеном. */
export async function verifyPaid(env, invoiceId, expectedAmountKop) {
  if (env.PAYMENT_MODE !== 'monobank') return true;
  const res = await fetch(`${MONO}/api/merchant/invoice/status?invoiceId=${encodeURIComponent(invoiceId)}`, { headers: { 'X-Token': env.MONOBANK_TOKEN } });
  if (!res.ok) return false;
  const j = await res.json();
  return j.status === 'success' && Number(j.amount) === expectedAmountKop;
}
