CREATE TABLE kit_usage_limit_templates (
  template_id TEXT PRIMARY KEY REFERENCES kit_templates(template_id) ON DELETE CASCADE,
  monthly_tokens INTEGER, monthly_active_seconds REAL,
  updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
);
CREATE TABLE kit_usage_limit_agent_months (
  agent_slug TEXT NOT NULL, month TEXT NOT NULL, tokens INTEGER NOT NULL DEFAULT 0,
  active_seconds REAL NOT NULL DEFAULT 0, tokens_unknown INTEGER NOT NULL DEFAULT 0,
  active_seconds_unknown INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (agent_slug, month)
);
