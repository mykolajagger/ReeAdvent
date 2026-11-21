// Налаштування, які власник змінює в адмінці: ціна календаря й відсотки для дашборда.
// fee_percent: комісія Monobank з українських карток (1,3%), fee_foreign_percent: з іноземних (2%).
export const DEFAULTS = { fee_percent: 1.3, fee_foreign_percent: 2, tax_percent: 5, military_percent: 1 };
const PERCENT_KEYS = Object.keys(DEFAULTS), KEYS = [...PERCENT_KEYS, 'price_uah', 'usd_rate'];
export { KEYS };

const bad = code => { const e = new Error(code); e.status = 400; e.code = code; return e; };

export async function getSettings(env) {
  const rows = (await env.DB.prepare('SELECT key, value FROM settings').all()).results;
  const out = { ...DEFAULTS, ...(env.ACQUIRING_FEE_PERCENT !== undefined ? { fee_percent: Number(env.ACQUIRING_FEE_PERCENT) || 0 } : {}), price_uah: Number(env.PRICE_UAH) || 0, usd_rate: Number(env.USD_RATE) || 41 };
  for (const r of rows) if (KEYS.includes(r.key) && isFinite(Number(r.value))) out[r.key] = Number(r.value);
  return out;
}

/** Поточна ціна (грн): значення з адмінки, інакше змінна PRICE_UAH. */
export async function getPriceUah(env) { return (await getSettings(env)).price_uah; }

/** Зберігає лише передані ключі. Відсотки: 0..100; ціна: від 1 до 100000 грн (до двох знаків). */
export async function saveSettings(env, input) {
  const stmts = [], saved = {};
  for (const k of KEYS) {
    if (input[k] === undefined) continue;
    const v = Number(String(input[k]).replace(',', '.'));
    if (k === 'price_uah') { if (!isFinite(v) || v < 1 || v > 100000) throw bad('bad_price'); }
    else if (k === 'usd_rate') { if (!isFinite(v) || v < 1 || v > 1000) throw bad('bad_rate'); }
    else if (!isFinite(v) || v < 0 || v > 100) throw bad('bad_percent');
    const r = Math.round(v * 100) / 100; saved[k] = r;
    stmts.push(env.DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(k, String(r), Date.now()));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return saved;
}
