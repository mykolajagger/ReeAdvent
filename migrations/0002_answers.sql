CREATE TABLE answers (
  member_id TEXT NOT NULL,
  day INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (member_id, day)
);
