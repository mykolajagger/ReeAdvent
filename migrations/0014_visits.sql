-- Анонімна воронка лендингу: денні лічильники (без cookies, IP та ідентифікаторів). Код також створює таблицю сам (src/schema.js).
CREATE TABLE IF NOT EXISTS visit_daily (day TEXT NOT NULL, page TEXT NOT NULL, source TEXT NOT NULL, campaign TEXT NOT NULL, ev TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, page, source, campaign, ev));
