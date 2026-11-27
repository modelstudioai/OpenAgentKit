CREATE TABLE kit_members (
  member_id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL,
  email TEXT,
  auth_type TEXT NOT NULL CHECK (auth_type = 'local'),
  status TEXT NOT NULL CHECK (status = 'active'),
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_members_created ON kit_members(created_at, member_id);
