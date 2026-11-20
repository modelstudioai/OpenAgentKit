-- 模版调试可沿用 Agent 默认环境；保持原来的用途、来源和归属约束。
-- 对已按旧 id 应用过的 main 线库会重复重建一次：INSERT SELECT 原样搬行，无副作用。
CREATE TABLE kit_sessions_optional_environment (
  session_id TEXT PRIMARY KEY, subject_id TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'experience' CHECK (purpose IN ('experience', 'admin_debug')),
  agent_slug TEXT, remote_agent_id TEXT, project_name TEXT, agent_key TEXT,
  project_revision TEXT, source_dirty INTEGER, title TEXT, status TEXT,
  created_at TEXT NOT NULL, last_event_at TEXT, files_json TEXT,
  debug_source TEXT CHECK (debug_source IN ('project', 'template')),
  remote_environment_id TEXT, runtime_json TEXT,
  CHECK ((purpose = 'experience' AND agent_slug IS NOT NULL AND debug_source IS NULL)
    OR (purpose = 'admin_debug' AND agent_slug IS NULL AND remote_agent_id IS NOT NULL AND debug_source IS NOT NULL AND
      ((debug_source = 'project' AND project_name IS NOT NULL AND agent_key IS NOT NULL)
        OR (debug_source = 'template' AND project_name IS NULL AND agent_key IS NULL))))
);
INSERT INTO kit_sessions_optional_environment
  (session_id, subject_id, purpose, agent_slug, remote_agent_id, project_name, agent_key,
   project_revision, source_dirty, title, status, created_at, last_event_at, files_json,
   debug_source, remote_environment_id, runtime_json)
SELECT session_id, subject_id, purpose, agent_slug, remote_agent_id, project_name, agent_key,
  project_revision, source_dirty, title, status, created_at, last_event_at, files_json,
  debug_source, remote_environment_id, runtime_json
FROM kit_sessions;
DROP TABLE kit_sessions;
ALTER TABLE kit_sessions_optional_environment RENAME TO kit_sessions;
CREATE INDEX idx_sessions_subject ON kit_sessions(purpose, subject_id, created_at);
CREATE INDEX idx_debug_sessions_project ON kit_sessions(purpose, subject_id, project_name, agent_key, created_at);
