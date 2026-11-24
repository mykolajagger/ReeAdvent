-- Кеш подій з сайтів квитків (Ticketsbox): список міста 12 год, деталі події 7 днів. Код створює таблицю й сам (src/schema.js).
CREATE TABLE IF NOT EXISTS ev_cache (k TEXT PRIMARY KEY, v TEXT NOT NULL, at INTEGER NOT NULL);
