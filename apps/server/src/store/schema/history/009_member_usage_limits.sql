CREATE TABLE kit_usage_limit_policy (
  id INTEGER PRIMARY KEY CHECK (id = 1), monthly_tokens INTEGER, monthly_active_seconds REAL,
  updated_at TEXT, updated_by TEXT
);
INSERT INTO kit_usage_limit_policy (id) VALUES (1);
CREATE TABLE kit_usage_limit_overrides (
  member_id TEXT PRIMARY KEY, monthly_tokens INTEGER, monthly_active_seconds REAL,
  updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
);
CREATE TABLE kit_usage_limit_members (
  member_id TEXT PRIMARY KEY, accounting_started_at TEXT NOT NULL
);
CREATE TABLE kit_usage_limit_sessions (
  session_id TEXT PRIMARY KEY, member_id TEXT NOT NULL,
  input_tokens INTEGER, output_tokens INTEGER, active_seconds REAL,
  admission_month TEXT, captured_at TEXT
);
CREATE INDEX idx_usage_limit_sessions_member ON kit_usage_limit_sessions(member_id);
CREATE TABLE kit_usage_limit_months (
  member_id TEXT NOT NULL, month TEXT NOT NULL, tokens INTEGER NOT NULL DEFAULT 0,
  active_seconds REAL NOT NULL DEFAULT 0, tokens_unknown INTEGER NOT NULL DEFAULT 0,
  active_seconds_unknown INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (member_id, month)
);
CREATE TABLE kit_usage_limit_requests (
  session_id TEXT NOT NULL, request_key TEXT NOT NULL, member_id TEXT NOT NULL,
  request_hash TEXT NOT NULL, status TEXT NOT NULL, event_ids TEXT,
  previous_status TEXT, created_at TEXT NOT NULL, PRIMARY KEY (session_id, request_key)
);
CREATE INDEX idx_usage_limit_requests_member ON kit_usage_limit_requests(member_id, status);
