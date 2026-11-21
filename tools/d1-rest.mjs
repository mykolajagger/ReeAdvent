// Адаптер D1 через REST API Cloudflare з тим самим інтерфейсом, що й binding у Worker (prepare/bind/first/all/run/batch).
// Потрібен, щоб наповнення бази закладів могло працювати поза Cloudflare (GitHub Actions), де Overpass відповідає.
// Документація: POST /accounts/{account}/d1/database/{db}/query — тіло {sql, params} або {batch: [{sql, params}]}.
export function makeRestDb({ accountId, databaseId, token, fetchImpl = fetch }) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
  const clean = p => (p || []).map(v => (v === undefined ? null : v));
  async function call(body, attempt = 0) {
    let res;
    try { res = await fetchImpl(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
    catch (e) { if (attempt < 3) { await new Promise(r => setTimeout(r, 1500 * (attempt + 1))); return call(body, attempt + 1); } throw e; }
    if ((res.status === 429 || res.status >= 500) && attempt < 3) { await new Promise(r => setTimeout(r, 2000 * (attempt + 1))); return call(body, attempt + 1); }
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.success === false) { const e = new Error('D1 REST ' + res.status + ': ' + JSON.stringify(j.errors || j).slice(0, 200)); e.status = res.status; throw e; }
    return j.result;
  }
  const one = async (sql, params) => (await call({ sql, params: clean(params) }))[0];
  const stmt = (sql, params = []) => ({
    _sql: sql, _params: params,
    bind: (...a) => stmt(sql, a),
    first: async () => { const r = await one(sql, params); return (r.results && r.results[0]) ?? null; },
    all: async () => { const r = await one(sql, params); return { results: r.results || [] }; },
    run: async () => { const r = await one(sql, params); return { meta: { changes: (r.meta && r.meta.changes) || 0 } }; }
  });
  return {
    prepare: sql => stmt(sql),
    batch: async list => {
      if (!list.length) return [];
      try { return (await call({ batch: list.map(s => ({ sql: s._sql, params: clean(s._params) })) })).map(r => ({ meta: { changes: (r.meta && r.meta.changes) || 0 }, results: r.results || [] })); }
      catch (e) { if (e.status !== 400) throw e; const out = []; for (const s of list) out.push(await s.run()); return out; } // запасний варіант: по одному
    }
  };
}
