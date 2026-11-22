ALTER TABLE orders ADD COLUMN utm_source TEXT;
ALTER TABLE orders ADD COLUMN utm_medium TEXT;
ALTER TABLE orders ADD COLUMN utm_campaign TEXT;
ALTER TABLE orders ADD COLUMN utm_content TEXT;
ALTER TABLE orders ADD COLUMN utm_term TEXT;
CREATE TABLE IF NOT EXISTS ad_spend (id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL, channel TEXT NOT NULL, campaign TEXT, amount_cents INTEGER NOT NULL, note TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_ad_spend_day ON ad_spend(day);
