// Налаштування, які власник змінює в адмінці (відсотки для дашборда).
export const DEFAULTS = { fee_percent: 0, tax_percent: 5, military_percent: 1 };
export const KEYS = Object.keys(DEFAULTS);

export async function getSettings(env) {
  const rows = (await env.DB.prepare('SELECT key, value FROM settings').all()).results;
  const out = { ...DEFAULTS, fee_percent: Number(env.ACQUIRING_FEE_PERCENT ?? DEFAULTS.fee_percent) || 0 };
  for (const r of rows) if (KEYS.includes(r.key) && isFinite(Number(r.value))) out[r.key] = Number(r.value);
  return out;
}

/** Зберігає лише передані ключі; кожне значення 0..100 з точністю до двох знаків. */
export async function saveSettings(env, input) {
  const stmts = [], saved = {};
  for (const k of KEYS) {
    if (input[k] === undefined) continue;
    const v = Number(String(input[k]).replace(',', '.'));
    if (!isFinite(v) || v < 0 || v > 100) { const e = new Error('bad_percent'); e.status = 400; e.code = 'bad_percent'; throw e; }
    const r = Math.round(v * 100) / 100; saved[k] = r;
    stmts.push(env.DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(k, String(r), Date.now()));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return saved;
}
