CREATE TABLE kit_templates (
  template_id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE,
  remote_agent_id TEXT NOT NULL, remote_agent_name TEXT NOT NULL,
  config_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX idx_templates_created ON kit_templates(created_at, template_id);
