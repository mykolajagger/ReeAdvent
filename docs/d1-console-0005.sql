CREATE TABLE login_codes (member_id TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
ALTER TABLE calendars ADD COLUMN country TEXT;
