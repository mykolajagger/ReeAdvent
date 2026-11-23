// Схема бази, яку код доводить до потрібного стану сам: відсутні колонки й таблиці додаються при першому зверненні, тож D1 Console не потрібен.
// Для нових баз ті самі зміни лежать у migrations/ (0010, 0012); тут вони повторюються безпечно: додається лише те, чого бракує.
export const ORDER_COLUMNS = [
  ['utm_source', 'TEXT'], ['utm_medium', 'TEXT'], ['utm_campaign', 'TEXT'], ['utm_content', 'TEXT'], ['utm_term', 'TEXT'],   // 0010: джерела реклами
  ['archived_at', 'INTEGER'],                                                                                              // 0012: архів (тестові й непотрібні замовлення)
  ['currency', 'TEXT'], ['uah_rate', 'REAL'],                                                                              // 0012: валюта ціни (UAH або EUR) і курс гривні на момент замовлення
  ['inv_ccy', 'INTEGER'], ['inv_amount', 'INTEGER']                                                                        // 0012: валюта й сума виставленого рахунку Monobank
];
const TABLES = [
  'CREATE TABLE IF NOT EXISTS ad_spend (id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL, channel TEXT NOT NULL, campaign TEXT, amount_cents INTEGER NOT NULL, note TEXT, created_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS idx_ad_spend_day ON ad_spend(day)'
];
const done = new WeakSet();

/** Один раз на базу (на ізолят): додає відсутні колонки замовлень і таблиці. Помилки не зупиняють запит: спроба повториться наступного разу. */
export async function ensureSchema(env) {
  const db = env && env.DB; if (!db || done.has(db)) return;
  try {
    const have = new Set(((await db.prepare('PRAGMA table_info(orders)').all()).results || []).map(c => c.name));
    if (!have.size) return;                                                       // таблиці замовлень ще немає (порожня база): нічого не чіпаємо
    for (const [col, type] of ORDER_COLUMNS) if (!have.has(col)) {
      try { await db.prepare(`ALTER TABLE orders ADD COLUMN ${col} ${type}`).run(); } catch (e) { if (!/duplicate column/i.test(String(e && e.message))) throw e; }
    }
    for (const sql of TABLES) await db.prepare(sql).run();
    done.add(db);
  } catch (e) { console.error('ensureSchema', e && e.message); }
}
