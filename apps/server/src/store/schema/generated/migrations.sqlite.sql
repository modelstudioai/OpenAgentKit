-- 由 db:generate 生成，修改结构请编辑共享定义。

-- 001_init
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

-- 002_session_files
ALTER TABLE kit_sessions ADD COLUMN files_json TEXT;

-- 003_quota_plaza
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

-- 004_members
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

-- 005_member_auth
CREATE TABLE kit_member_sessions (
  token_hash TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_member_sessions_member ON kit_member_sessions(member_id);
CREATE INDEX idx_member_sessions_expiry ON kit_member_sessions(expires_at);
CREATE TABLE kit_uploaded_files (
  file_id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_uploaded_files_subject ON kit_uploaded_files(subject_id);

-- 006_legacy_file_ownership
WITH legacy_attachments AS (
  SELECT s.subject_id, s.created_at,
    CASE WHEN f.type = 'object' THEN json_extract(f.value, '$.file_id') END AS file_id,
    CASE WHEN f.type = 'object' THEN json_type(f.value, '$.file_id') END AS file_id_type
  FROM kit_sessions AS s, json_each(
    CASE WHEN json_valid(s.files_json)
      THEN CASE WHEN json_type(s.files_json) = 'array' THEN s.files_json ELSE '[]' END
      ELSE '[]' END
  ) AS f
)
INSERT OR IGNORE INTO kit_uploaded_files (file_id, subject_id, created_at)
SELECT file_id, MIN(subject_id), MIN(created_at)
FROM legacy_attachments
WHERE file_id_type = 'text' AND length(trim(file_id)) > 0
GROUP BY file_id
HAVING COUNT(DISTINCT subject_id) = 1;

-- 007_admin_debug_scope
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

-- 008_member_session_usage
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

-- 009_member_usage_limits
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

-- 010_catalog_environment
ALTER TABLE catalog_agents ADD COLUMN remote_environment_id TEXT;

-- 011_catalog_files
ALTER TABLE catalog_agents ADD COLUMN files_json TEXT NOT NULL DEFAULT '[]';

-- 012_catalog_memory_stores
ALTER TABLE catalog_agents ADD COLUMN memory_stores_json TEXT NOT NULL DEFAULT '[]';

-- 013_catalog_vaults
ALTER TABLE catalog_agents ADD COLUMN vault_ids_json TEXT NOT NULL DEFAULT '[]';

-- 014_member_groups
CREATE TABLE kit_groups (
  group_id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT,
  revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX idx_groups_created ON kit_groups(created_at, group_id);
CREATE TABLE kit_group_members (
  group_id TEXT NOT NULL REFERENCES kit_groups(group_id),
  member_id TEXT NOT NULL REFERENCES kit_members(member_id),
  PRIMARY KEY (group_id, member_id)
);
CREATE INDEX idx_group_members_member ON kit_group_members(member_id, group_id);

-- 015_template_debug_sessions
CREATE TABLE kit_sessions_targets (
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
        OR (debug_source = 'template' AND project_name IS NULL AND agent_key IS NULL
          AND remote_environment_id IS NOT NULL))))
);
INSERT INTO kit_sessions_targets
  (session_id, subject_id, purpose, agent_slug, remote_agent_id, project_name, agent_key,
   project_revision, source_dirty, title, status, created_at, last_event_at, files_json, debug_source)
SELECT session_id, subject_id, purpose, agent_slug, remote_agent_id, project_name, agent_key,
  project_revision, source_dirty, title, status, created_at, last_event_at, files_json,
  CASE WHEN purpose = 'admin_debug' THEN 'project' ELSE NULL END
FROM kit_sessions;
DROP TABLE kit_sessions;
ALTER TABLE kit_sessions_targets RENAME TO kit_sessions;
CREATE INDEX idx_sessions_subject ON kit_sessions(purpose, subject_id, created_at);
CREATE INDEX idx_debug_sessions_project ON kit_sessions(purpose, subject_id, project_name, agent_key, created_at);

-- 016_saved_templates
CREATE TABLE kit_templates (
  template_id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE,
  remote_agent_id TEXT NOT NULL, remote_agent_name TEXT NOT NULL,
  config_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX idx_templates_created ON kit_templates(created_at, template_id);

-- 017_template_listings
CREATE TABLE kit_template_listings (
  template_id TEXT PRIMARY KEY REFERENCES kit_templates(template_id) ON DELETE CASCADE,
  catalog_id TEXT NOT NULL UNIQUE REFERENCES catalog_agents(id) ON DELETE CASCADE
);

-- 018_template_versions
ALTER TABLE kit_templates ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE kit_templates ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
UPDATE kit_templates SET updated_at=created_at;
CREATE TABLE kit_template_versions (
  template_id TEXT NOT NULL REFERENCES kit_templates(template_id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0), config_json TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (template_id, version)
);
INSERT INTO kit_template_versions (template_id,version,config_json,created_at)
SELECT template_id,version,config_json,created_at FROM kit_templates;

-- 019_template_usage_limits
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

-- 020_usage_limit_days
CREATE TABLE kit_usage_limit_days (
  member_id TEXT NOT NULL, day TEXT NOT NULL, tokens INTEGER NOT NULL DEFAULT 0,
  active_seconds REAL NOT NULL DEFAULT 0, PRIMARY KEY (member_id, day)
);

-- 021_usage_limit_days_backfill
INSERT INTO kit_usage_limit_days (member_id, day, tokens, active_seconds)
SELECT member_id, substr(captured_at, 1, 10) AS day,
       CAST(SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)) AS INTEGER) AS tokens,
       SUM(COALESCE(active_seconds, 0)) AS active_seconds
FROM kit_usage_limit_sessions
WHERE captured_at IS NOT NULL AND admission_month IS NOT NULL
GROUP BY member_id, substr(captured_at, 1, 10)
ON CONFLICT(member_id, day) DO UPDATE SET tokens = excluded.tokens, active_seconds = excluded.active_seconds;

-- 022_usage_limit_days_rebuild
-- 由 sqlite-history.ts 中的 TypeScript 步骤执行。

-- 023_catalog_agent_version_binding
-- 由 sqlite-history.ts 中的 TypeScript 步骤执行。

-- 024_template_default_environment
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

-- 025_resource_draft_batches
CREATE TABLE IF NOT EXISTS kit_resource_drafts (
  draft_id TEXT PRIMARY KEY, owner TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','publishing','published','failed')),
  phase TEXT NOT NULL CHECK (phase IN ('editable','executing','uncertain','succeeded')),
  resources_json TEXT NOT NULL DEFAULT '[]', cleanup_pending INTEGER NOT NULL DEFAULT 0,
  operation_id TEXT, expected_revision TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_resource_drafts_active_owner ON kit_resource_drafts(owner)
  WHERE status != 'published' OR cleanup_pending = 1;

-- 026_resource_draft_cleanup_ownership
-- 由 sqlite-history.ts 中的 TypeScript 步骤执行。

-- 027_usage_limit_daily
-- 由 sqlite-history.ts 中的 TypeScript 步骤执行。

-- 023_catalog_listed_at
ALTER TABLE catalog_agents ADD COLUMN listed_at TEXT;

-- 023_session_message_files
ALTER TABLE kit_sessions ADD COLUMN message_files_json TEXT;

-- 028_preset_packs
CREATE TABLE kit_preset_packs (
  preset_pack_id TEXT PRIMARY KEY,
  config_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 029_yaml_resource_drafts
ALTER TABLE kit_resource_drafts ADD COLUMN engine TEXT NOT NULL DEFAULT 'directory';
CREATE TABLE kit_resource_draft_documents (
  draft_id TEXT PRIMARY KEY REFERENCES kit_resource_drafts(draft_id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 1,
  yaml TEXT NOT NULL,
  assets_json TEXT NOT NULL DEFAULT '[]',
  sdk_state_json TEXT NOT NULL DEFAULT '{"resources":[]}',
  proof_json TEXT
);

-- 030_resource_draft_assets
-- 由 sqlite-history.ts 中的 TypeScript 步骤执行。

-- 031_retire_directory_drafts
-- 由 sqlite-history.ts 中的 TypeScript 步骤执行。

-- 032_publication_result_contract
ALTER TABLE kit_operations ADD COLUMN publication_json TEXT;
ALTER TABLE kit_operations ADD COLUMN error_details_json TEXT;

-- 029_branding
CREATE TABLE IF NOT EXISTS kit_branding (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  product_name TEXT NOT NULL,
  logo_url TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
INSERT OR IGNORE INTO kit_branding (id, product_name, updated_at) VALUES (1, 'OpenAgentPack Kit', '2026-11-13T00:00:00.000Z');

-- 030_branding_logo
CREATE TABLE IF NOT EXISTS kit_branding_logo (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  content_type TEXT NOT NULL,
  bytes BLOB NOT NULL,
  hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 033_openagentkit_default_branding
UPDATE kit_branding SET product_name = 'OpenAgentKit'
WHERE id = 1 AND product_name = 'OpenAgentPack Kit' AND updated_by IS NULL;

-- 034_java_operation_recovery
CREATE TABLE "kit_confirmation_consumptions" (
  "token_hash" TEXT NOT NULL,
  "expires_at" TEXT NOT NULL,
  PRIMARY KEY ("token_hash")
);
CREATE TABLE "kit_resource_publish_plans" (
  "draft_id" TEXT NOT NULL,
  "plan_id" TEXT NOT NULL,
  "plan_json" TEXT NOT NULL,
  "expires_at" TEXT NOT NULL,
  PRIMARY KEY ("draft_id"),
  FOREIGN KEY ("draft_id") REFERENCES "kit_resource_drafts" ("draft_id") ON DELETE CASCADE
);
CREATE TABLE "kit_sdk_operation_claims" (
  "operation_id" TEXT NOT NULL,
  "draft_id" TEXT NOT NULL,
  "node_instance" TEXT,
  "plan_json" TEXT NOT NULL,
  "mutation_granted" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TEXT NOT NULL,
  PRIMARY KEY ("operation_id"),
  FOREIGN KEY ("operation_id") REFERENCES "kit_operations" ("operation_id") ON DELETE CASCADE
);
CREATE TABLE "kit_sdk_checkpoints" (
  "operation_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "payload_hash" TEXT NOT NULL,
  PRIMARY KEY ("operation_id", "sequence"),
  FOREIGN KEY ("operation_id") REFERENCES "kit_sdk_operation_claims" ("operation_id") ON DELETE CASCADE
);
CREATE TABLE "kit_session_send_receipts" (
  "session_id" TEXT NOT NULL,
  "client_message_id" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "event_ids" TEXT,
  "created_at" TEXT NOT NULL,
  PRIMARY KEY ("session_id", "client_message_id"),
  FOREIGN KEY ("session_id") REFERENCES "kit_sessions" ("session_id") ON DELETE CASCADE
);
