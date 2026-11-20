ALTER TABLE orders ADD COLUMN list_kop INTEGER;
ALTER TABLE orders ADD COLUMN discount_kop INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN promo_code TEXT;
ALTER TABLE orders ADD COLUMN promo_id TEXT;
ALTER TABLE orders ADD COLUMN refunded_at INTEGER;
ALTER TABLE orders ADD COLUMN refund_kop INTEGER;
ALTER TABLE orders ADD COLUMN note TEXT;

CREATE TABLE promo_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  value INTEGER NOT NULL,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  starts_at INTEGER,
  expires_at INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  label TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE admin_tokens (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT
);
CREATE TABLE rate_limits (
  key TEXT NOT NULL,
  win INTEGER NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, win)
);

CREATE TABLE threads (
  email TEXT PRIMARY KEY,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  last_at INTEGER NOT NULL,
  last_subject TEXT,
  unread INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  thread_email TEXT NOT NULL,
  direction TEXT NOT NULL,
  from_email TEXT NOT NULL,
  from_name TEXT,
  to_email TEXT,
  subject TEXT NOT NULL,
  body_text TEXT,
  created_at INTEGER NOT NULL,
  msg_id TEXT
);
CREATE INDEX idx_messages_thread ON messages(thread_email, created_at);
