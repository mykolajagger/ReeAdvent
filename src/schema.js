// Схема бази, яку код доводить до потрібного стану сам: відсутні колонки й таблиці додаються при першому зверненні, тож D1 Console не потрібен.
// Для нових баз ті самі зміни лежать у migrations/ (0010, 0012); тут вони повторюються безпечно: додається лише те, чого бракує.
export const ORDER_COLUMNS = [
  ['utm_source', 'TEXT'], ['utm_medium', 'TEXT'], ['utm_campaign', 'TEXT'], ['utm_content', 'TEXT'], ['utm_term', 'TEXT'],   // 0010: джерела реклами
  ['archived_at', 'INTEGER'],                                                                                              // 0012: архів (тестові й непотрібні замовлення)
  ['currency', 'TEXT'], ['uah_rate', 'REAL'],                                                                              // 0012: валюта ціни (UAH або EUR) і курс гривні на момент замовлення
  ['inv_ccy', 'INTEGER'], ['inv_amount', 'INTEGER']                                                                        // 0012: валюта й сума виставленого рахунку Monobank
];
export const CAL_COLUMNS = [['test_mode', 'INTEGER']];
export const VENUE_COLUMNS = [['first_seen', 'INTEGER']];   // 0016: коли заклад уперше з'явився в базі («нещодавно відкрились»)   // 0015: тестовий режим (вікна по черзі без очікування дат)
const TABLES = [
  'CREATE TABLE IF NOT EXISTS ad_spend (id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL, channel TEXT NOT NULL, campaign TEXT, amount_cents INTEGER NOT NULL, note TEXT, created_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS idx_ad_spend_day ON ad_spend(day)',
  // 0013: фото й відео у відповідях, оцінки пунктів календаря
  'CREATE TABLE IF NOT EXISTS answer_media (id TEXT PRIMARY KEY, member_id TEXT NOT NULL, day INTEGER NOT NULL, kind TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, store TEXT NOT NULL, data TEXT, created_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS idx_answer_media_member ON answer_media(member_id, day)',
  'CREATE TABLE IF NOT EXISTS item_ratings (member_id TEXT NOT NULL, day INTEGER NOT NULL, kind TEXT NOT NULL, item_id INTEGER NOT NULL, stars INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (member_id, day, kind))',
  'CREATE INDEX IF NOT EXISTS idx_item_ratings_item ON item_ratings(kind, item_id)',
  // 0017: кеш подій з сайтів квитків (список міста 12 год, деталі події 7 днів)
  'CREATE TABLE IF NOT EXISTS ev_cache (k TEXT PRIMARY KEY, v TEXT NOT NULL, at INTEGER NOT NULL)',
  // 0014: анонімна воронка лендингу (денні лічильники без cookies й ідентифікаторів)
  'CREATE TABLE IF NOT EXISTS visit_daily (day TEXT NOT NULL, page TEXT NOT NULL, source TEXT NOT NULL, campaign TEXT NOT NULL, ev TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, page, source, campaign, ev))'
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
    const calHave = new Set(((await db.prepare('PRAGMA table_info(calendars)').all()).results || []).map(c => c.name));
    for (const [col, type] of CAL_COLUMNS) if (calHave.size && !calHave.has(col)) {
      try { await db.prepare(`ALTER TABLE calendars ADD COLUMN ${col} ${type}`).run(); } catch (e) { if (!/duplicate column/i.test(String(e && e.message))) throw e; }
    }
    const vHave = new Set(((await db.prepare('PRAGMA table_info(venues)').all()).results || []).map(c => c.name));
    for (const [col, type] of VENUE_COLUMNS) if (vHave.size && !vHave.has(col)) {
      try { await db.prepare(`ALTER TABLE venues ADD COLUMN ${col} ${type}`).run(); } catch (e) { if (!/duplicate column/i.test(String(e && e.message))) throw e; }
    }
    for (const sql of TABLES) await db.prepare(sql).run();
    done.add(db);
  } catch (e) { console.error('ensureSchema', e && e.message); }
}
