-- Фото й відео у відповідях на питання дня та оцінки пунктів календаря. На робочій базі створюються автоматично (src/schema.js).
CREATE TABLE IF NOT EXISTS answer_media (id TEXT PRIMARY KEY, member_id TEXT NOT NULL, day INTEGER NOT NULL, kind TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, store TEXT NOT NULL, data TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_answer_media_member ON answer_media(member_id, day);
CREATE TABLE IF NOT EXISTS item_ratings (member_id TEXT NOT NULL, day INTEGER NOT NULL, kind TEXT NOT NULL, item_id INTEGER NOT NULL, stars INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (member_id, day, kind));
CREATE INDEX IF NOT EXISTS idx_item_ratings_item ON item_ratings(kind, item_id);
