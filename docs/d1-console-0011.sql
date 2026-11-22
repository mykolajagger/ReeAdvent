CREATE TABLE IF NOT EXISTS email_log (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at INTEGER NOT NULL, to_email TEXT NOT NULL, subject TEXT NOT NULL, kind TEXT NOT NULL, phase TEXT NOT NULL, order_id TEXT, member_id TEXT, status TEXT NOT NULL DEFAULT 'sent', error TEXT, ext_id TEXT, body TEXT);
CREATE INDEX IF NOT EXISTS idx_email_log_time ON email_log(created_at);
CREATE INDEX IF NOT EXISTS idx_email_log_order ON email_log(order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_email_log_to ON email_log(to_email);
