// Збірки Cloudflare Pages (проєкт reeadvent): status — показати останні; retry — перезапустити останню збірку main, якщо вона зависла (>15 хв) або впала.
const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: acc } = process.env, mode = process.argv[2] || 'status';
const base = `https://api.cloudflare.com/client/v4/accounts/${acc}/pages/projects/reeadvent/deployments`;
const call = async (method, url) => { const r = await fetch(url, { method, headers: { authorization: `Bearer ${token}` } }); const j = await r.json(); if (!j.success) throw new Error(JSON.stringify(j.errors)); return j.result; };
const list = await call('GET', base + '?per_page=8');
const fmt = d => `${d.id.slice(0, 8)} ${d.environment} ${d.deployment_trigger?.metadata?.branch || ''} ${(d.deployment_trigger?.metadata?.commit_hash || '').slice(0, 7)} ${d.latest_stage?.name}:${d.latest_stage?.status} створено ${d.created_on}`;
list.forEach(d => console.log(fmt(d)));
if (mode === 'retry') {
  const d = list.find(x => x.environment === 'production'); const age = (Date.now() - Date.parse(d.created_on)) / 6e4, st = d.latest_stage?.status;
  if (st === 'success') { console.log('Остання збірка main успішна — нічого не роблю'); process.exit(0); }
  if (st !== 'failure' && st !== 'canceled' && age < 15) { console.log(`Збірка йде ${age.toFixed(0)} хв — ще не зависла`); process.exit(0); }
  if (st !== 'failure' && st !== 'canceled') { try { await call('POST', `${base}/${d.id}/cancel`); console.log('Скасовано завислу ' + d.id.slice(0, 8)); } catch (e) { console.log('Скасування: ' + e.message); } }
  const r = await call('POST', `${base}/${d.id}/retry`); console.log('Перезапущено: ' + fmt(r));
}
