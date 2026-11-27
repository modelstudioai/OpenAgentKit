CREATE TABLE kit_session_usage (
  session_id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  agent_slug TEXT NOT NULL,
  title TEXT,
  status TEXT,
  created_at TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cache_read_input_tokens INTEGER,
  cache_creation_input_tokens INTEGER,
  active_seconds REAL,
  duration_seconds REAL,
  collection_status TEXT NOT NULL DEFAULT 'pending',
  captured_at TEXT,
  attempted_at TEXT,
  capture_revision INTEGER NOT NULL DEFAULT 0,
  finalized_at TEXT,
  deleted_at TEXT
);
CREATE INDEX idx_session_usage_member ON kit_session_usage(member_id, agent_slug, created_at, session_id);
CREATE TABLE kit_session_deletions (
  session_id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
