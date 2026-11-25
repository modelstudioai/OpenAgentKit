-- 广场分类/精选 + Credits 用量配额与提额审批（纯增量；用量只存 turn 账本，不存事件正文）。
ALTER TABLE catalog_agents ADD COLUMN category TEXT NOT NULL DEFAULT 'general';
ALTER TABLE catalog_agents ADD COLUMN featured INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS quota_policy (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  monthly_credits INTEGER NOT NULL,
  updated_at TEXT,
  updated_by TEXT
);
INSERT OR IGNORE INTO quota_policy (id, monthly_credits) VALUES (1, 200);
CREATE TABLE IF NOT EXISTS quota_override (
  subject_id TEXT PRIMARY KEY,
  monthly_credits INTEGER NOT NULL,
  reason TEXT,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS quota_pack (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  month TEXT NOT NULL,
  credits INTEGER NOT NULL,
  reason TEXT,
  granted_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_quota_pack_subject ON quota_pack(subject_id, month);
CREATE TABLE IF NOT EXISTS quota_request (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  requested_credits INTEGER NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  mode TEXT,
  granted_credits INTEGER,
  review_note TEXT,
  reviewed_by TEXT,
  created_at TEXT NOT NULL,
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_quota_request_subject ON quota_request(subject_id, created_at);
CREATE TABLE IF NOT EXISTS usage_turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id TEXT NOT NULL,
  agent_slug TEXT NOT NULL,
  session_id TEXT NOT NULL,
  client_message_id TEXT,
  day TEXT NOT NULL,
  month TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_turns_idempotency
  ON usage_turns(session_id, client_message_id) WHERE client_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usage_turns_subject_month ON usage_turns(subject_id, month);
CREATE INDEX IF NOT EXISTS idx_usage_turns_month_agent ON usage_turns(month, agent_slug);
