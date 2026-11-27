-- 调试会话没有 Catalog slug；用途域与主体共同决定访问权限，历史数据保持 experience。
CREATE TABLE kit_sessions_scoped (
  session_id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'experience' CHECK (purpose IN ('experience', 'admin_debug')),
  agent_slug TEXT,
  remote_agent_id TEXT,
  project_name TEXT,
  agent_key TEXT,
  project_revision TEXT,
  source_dirty INTEGER,
  title TEXT,
  status TEXT,
  created_at TEXT NOT NULL,
  last_event_at TEXT,
  files_json TEXT,
  CHECK ((purpose = 'experience' AND agent_slug IS NOT NULL)
    OR (purpose = 'admin_debug' AND agent_slug IS NULL AND project_name IS NOT NULL
      AND agent_key IS NOT NULL AND remote_agent_id IS NOT NULL))
);
INSERT INTO kit_sessions_scoped
  (session_id, subject_id, agent_slug, remote_agent_id, title, status, created_at, last_event_at, files_json)
SELECT session_id, subject_id, agent_slug, remote_agent_id, title, status, created_at, last_event_at, files_json
FROM kit_sessions;
DROP TABLE kit_sessions;
ALTER TABLE kit_sessions_scoped RENAME TO kit_sessions;
CREATE INDEX idx_sessions_subject ON kit_sessions(purpose, subject_id, created_at);
CREATE INDEX idx_debug_sessions_project ON kit_sessions(purpose, subject_id, project_name, agent_key, created_at);
ALTER TABLE kit_uploaded_files ADD COLUMN purpose TEXT NOT NULL DEFAULT 'experience'
  CHECK (purpose IN ('experience', 'admin_debug'));
