CREATE TABLE IF NOT EXISTS catalog_agents (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  opening_remarks TEXT,
  suggested_prompts TEXT NOT NULL DEFAULT '[]',
  capabilities TEXT NOT NULL DEFAULT '{}',
  theme TEXT,
  remote_agent_id TEXT NOT NULL,
  remote_agent_version INTEGER,
  visibility TEXT NOT NULL DEFAULT 'public',
  ordering INTEGER NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'unlisted',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS kit_sessions (
  session_id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  agent_slug TEXT NOT NULL,
  remote_agent_id TEXT,
  title TEXT,
  status TEXT,
  created_at TEXT NOT NULL,
  last_event_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_subject ON kit_sessions(subject_id, created_at);
CREATE TABLE IF NOT EXISTS kit_operations (
  operation_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  subject TEXT,
  status TEXT NOT NULL,
  phase TEXT,
  progress REAL NOT NULL DEFAULT 0,
  log TEXT NOT NULL DEFAULT '[]',
  result TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS kit_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  subject TEXT,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT
);
