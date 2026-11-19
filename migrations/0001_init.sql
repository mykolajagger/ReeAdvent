CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',      -- pending | paid
  amount_kop INTEGER NOT NULL,
  name_a TEXT NOT NULL, email_a TEXT NOT NULL,
  name_b TEXT NOT NULL, email_b TEXT NOT NULL,
  city TEXT NOT NULL, region TEXT NOT NULL,
  start_date TEXT NOT NULL,                    -- обрана дата першого вікна (YYYY-MM-DD)
  payer_email TEXT,
  invoice_id TEXT,
  paid_at INTEGER,
  consent_at INTEGER NOT NULL
);
CREATE INDEX idx_orders_invoice ON orders(invoice_id);

CREATE TABLE calendars (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  created_at INTEGER NOT NULL,
  city TEXT NOT NULL, region TEXT NOT NULL,
  start_date TEXT NOT NULL,                    -- YYYY-MM-DD (перше вікно, за Києвом)
  schedule_json TEXT
);

CREATE TABLE members (
  id TEXT PRIMARY KEY,
  calendar_id TEXT NOT NULL REFERENCES calendars(id),
  email TEXT NOT NULL,
  slot INTEGER NOT NULL,                       -- 0 або 1
  suggested_name TEXT NOT NULL,
  survey_json TEXT
);
CREATE INDEX idx_members_email ON members(email);

CREATE TABLE login_tokens (
  token_hash TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX idx_login_member ON login_tokens(member_id, created_at);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE progress (
  member_id TEXT NOT NULL,
  day INTEGER NOT NULL,
  opened INTEGER NOT NULL DEFAULT 0,
  done_gift INTEGER NOT NULL DEFAULT 0,
  done_intim INTEGER NOT NULL DEFAULT 0,
  done_act INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (member_id, day)
);

CREATE TABLE outbox (                          -- лише для EMAIL_MODE=stub (розробка)
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  to_email TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL
);
