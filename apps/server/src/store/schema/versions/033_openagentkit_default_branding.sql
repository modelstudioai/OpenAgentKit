-- 三库共享结构，以 SQLite DDL 表达。改表后运行 db:generate。

CREATE TABLE "catalog_agents" (
  "id" TEXT,
  "slug" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "description" TEXT,
  "icon" TEXT,
  "opening_remarks" TEXT,
  "suggested_prompts" TEXT NOT NULL DEFAULT '[]',
  "capabilities" TEXT NOT NULL DEFAULT '{}',
  "theme" TEXT,
  "remote_agent_id" TEXT NOT NULL,
  "remote_agent_version" INTEGER,
  "visibility" TEXT NOT NULL DEFAULT 'public',
  "ordering" INTEGER NOT NULL DEFAULT 100,
  "status" TEXT NOT NULL DEFAULT 'unlisted',
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'general',
  "featured" INTEGER NOT NULL DEFAULT 0,
  "remote_environment_id" TEXT,
  "files_json" TEXT NOT NULL DEFAULT '[]',
  "memory_stores_json" TEXT NOT NULL DEFAULT '[]',
  "vault_ids_json" TEXT NOT NULL DEFAULT '[]',
  "agent_version" INTEGER,
  "listed_at" TEXT,
  PRIMARY KEY ("id"),
  UNIQUE ("slug"),
  CHECK (agent_version > 0)
);

CREATE TABLE "kit_audit" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "at" TEXT NOT NULL,
  "subject" TEXT,
  "action" TEXT NOT NULL,
  "target" TEXT,
  "detail" TEXT
);

CREATE TABLE "kit_branding" (
  "id" INTEGER,
  "product_name" TEXT NOT NULL,
  "logo_url" TEXT,
  "updated_at" TEXT NOT NULL,
  "updated_by" TEXT,
  PRIMARY KEY ("id"),
  CHECK (id = 1)
);

CREATE TABLE "kit_branding_logo" (
  "id" INTEGER,
  "content_type" TEXT NOT NULL,
  "bytes" BLOB NOT NULL,
  "hash" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  PRIMARY KEY ("id"),
  CHECK (id = 1)
);

CREATE TABLE "kit_groups" (
  "group_id" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  PRIMARY KEY ("group_id"),
  UNIQUE ("name")
);

CREATE INDEX "idx_groups_created" ON "kit_groups" ("created_at", "group_id");

CREATE TABLE "kit_member_sessions" (
  "token_hash" TEXT,
  "member_id" TEXT NOT NULL,
  "created_at" TEXT NOT NULL,
  "expires_at" TEXT NOT NULL,
  PRIMARY KEY ("token_hash")
);

CREATE INDEX "idx_member_sessions_expiry" ON "kit_member_sessions" ("expires_at");

CREATE INDEX "idx_member_sessions_member" ON "kit_member_sessions" ("member_id");

CREATE TABLE "kit_members" (
  "member_id" TEXT,
  "username" TEXT COLLATE NOCASE NOT NULL,
  "display_name" TEXT NOT NULL,
  "email" TEXT,
  "auth_type" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  PRIMARY KEY ("member_id"),
  UNIQUE ("username"),
  CHECK (auth_type = 'local'),
  CHECK (status = 'active')
);

CREATE INDEX "idx_members_created" ON "kit_members" ("created_at", "member_id");

CREATE TABLE "kit_group_members" (
  "group_id" TEXT NOT NULL,
  "member_id" TEXT NOT NULL,
  PRIMARY KEY ("group_id", "member_id"),
  FOREIGN KEY ("member_id") REFERENCES "kit_members" ("member_id"),
  FOREIGN KEY ("group_id") REFERENCES "kit_groups" ("group_id")
);

CREATE INDEX "idx_group_members_member" ON "kit_group_members" ("member_id", "group_id");

CREATE TABLE "kit_operations" (
  "operation_id" TEXT,
  "kind" TEXT NOT NULL,
  "subject" TEXT,
  "status" TEXT NOT NULL,
  "phase" TEXT,
  "progress" REAL NOT NULL DEFAULT 0,
  "log" TEXT NOT NULL DEFAULT '[]',
  "result" TEXT,
  "error" TEXT,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "publication_json" TEXT,
  "error_details_json" TEXT,
  PRIMARY KEY ("operation_id")
);

CREATE TABLE "kit_preset_packs" (
  "preset_pack_id" TEXT,
  "config_json" TEXT NOT NULL,
  "created_at" TEXT NOT NULL,
  PRIMARY KEY ("preset_pack_id")
);

CREATE TABLE "kit_resource_drafts" (
  "draft_id" TEXT,
  "owner" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "phase" TEXT NOT NULL,
  "resources_json" TEXT NOT NULL DEFAULT '[]',
  "cleanup_pending" INTEGER NOT NULL DEFAULT 0,
  "operation_id" TEXT,
  "expected_revision" TEXT,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "cleanup_key_hash" TEXT,
  "engine" TEXT NOT NULL DEFAULT 'directory',
  PRIMARY KEY ("draft_id"),
  CHECK (status IN ('draft','publishing','published','failed')),
  CHECK (phase IN ('editable','executing','uncertain','succeeded'))
);

CREATE UNIQUE INDEX "idx_resource_drafts_active_owner" ON "kit_resource_drafts" ("owner") WHERE status != 'published' OR cleanup_pending = 1;

CREATE TABLE "kit_resource_draft_documents" (
  "draft_id" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "yaml" TEXT NOT NULL,
  "assets_json" TEXT NOT NULL DEFAULT '[]',
  "sdk_state_json" TEXT NOT NULL DEFAULT '{"resources":[]}',
  "proof_json" TEXT,
  PRIMARY KEY ("draft_id"),
  FOREIGN KEY ("draft_id") REFERENCES "kit_resource_drafts" ("draft_id") ON DELETE CASCADE
);

CREATE TABLE "kit_retired_directory_drafts" (
  "draft_id" TEXT,
  "record_json" TEXT NOT NULL,
  "document_json" TEXT,
  "retired_at" TEXT NOT NULL,
  PRIMARY KEY ("draft_id")
);

CREATE TABLE "kit_session_deletions" (
  "session_id" TEXT,
  "subject_id" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  PRIMARY KEY ("session_id")
);

CREATE TABLE "kit_session_usage" (
  "session_id" TEXT,
  "member_id" TEXT NOT NULL,
  "agent_slug" TEXT NOT NULL,
  "title" TEXT,
  "status" TEXT,
  "created_at" TEXT NOT NULL,
  "input_tokens" INTEGER,
  "output_tokens" INTEGER,
  "cache_read_input_tokens" INTEGER,
  "cache_creation_input_tokens" INTEGER,
  "active_seconds" REAL,
  "duration_seconds" REAL,
  "collection_status" TEXT NOT NULL DEFAULT 'pending',
  "captured_at" TEXT,
  "attempted_at" TEXT,
  "capture_revision" INTEGER NOT NULL DEFAULT 0,
  "finalized_at" TEXT,
  "deleted_at" TEXT,
  PRIMARY KEY ("session_id")
);

CREATE INDEX "idx_session_usage_member" ON "kit_session_usage" ("member_id", "agent_slug", "created_at", "session_id");

CREATE TABLE "kit_sessions" (
  "session_id" TEXT,
  "subject_id" TEXT NOT NULL,
  "purpose" TEXT NOT NULL DEFAULT 'experience',
  "agent_slug" TEXT,
  "remote_agent_id" TEXT,
  "project_name" TEXT,
  "agent_key" TEXT,
  "project_revision" TEXT,
  "source_dirty" INTEGER,
  "title" TEXT,
  "status" TEXT,
  "created_at" TEXT NOT NULL,
  "last_event_at" TEXT,
  "files_json" TEXT,
  "debug_source" TEXT,
  "remote_environment_id" TEXT,
  "runtime_json" TEXT,
  "message_files_json" TEXT,
  PRIMARY KEY ("session_id"),
  CHECK (purpose IN ('experience', 'admin_debug')),
  CHECK (debug_source IN ('project', 'template')),
  CHECK ((purpose = 'experience' AND agent_slug IS NOT NULL AND debug_source IS NULL)
    OR (purpose = 'admin_debug' AND agent_slug IS NULL AND remote_agent_id IS NOT NULL AND debug_source IS NOT NULL AND
      ((debug_source = 'project' AND project_name IS NOT NULL AND agent_key IS NOT NULL)
        OR (debug_source = 'template' AND project_name IS NULL AND agent_key IS NULL))))
);

CREATE INDEX "idx_debug_sessions_project" ON "kit_sessions" ("purpose", "subject_id", "project_name", "agent_key", "created_at");

CREATE INDEX "idx_sessions_subject" ON "kit_sessions" ("purpose", "subject_id", "created_at");

CREATE TABLE "kit_templates" (
  "template_id" TEXT,
  "name" TEXT NOT NULL,
  "remote_agent_id" TEXT NOT NULL,
  "remote_agent_name" TEXT NOT NULL,
  "config_json" TEXT NOT NULL,
  "created_at" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updated_at" TEXT NOT NULL DEFAULT '',
  PRIMARY KEY ("template_id"),
  UNIQUE ("name"),
  CHECK (version > 0)
);

CREATE INDEX "idx_templates_created" ON "kit_templates" ("created_at", "template_id");

CREATE TABLE "kit_template_listings" (
  "template_id" TEXT,
  "catalog_id" TEXT NOT NULL,
  PRIMARY KEY ("template_id"),
  UNIQUE ("catalog_id"),
  FOREIGN KEY ("catalog_id") REFERENCES "catalog_agents" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("template_id") REFERENCES "kit_templates" ("template_id") ON DELETE CASCADE
);

CREATE TABLE "kit_template_versions" (
  "template_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "config_json" TEXT NOT NULL,
  "created_at" TEXT NOT NULL,
  PRIMARY KEY ("template_id", "version"),
  FOREIGN KEY ("template_id") REFERENCES "kit_templates" ("template_id") ON DELETE CASCADE,
  CHECK (version > 0)
);

CREATE TABLE "kit_uploaded_files" (
  "file_id" TEXT,
  "subject_id" TEXT NOT NULL,
  "created_at" TEXT NOT NULL,
  "purpose" TEXT NOT NULL DEFAULT 'experience',
  PRIMARY KEY ("file_id"),
  CHECK (purpose IN ('experience', 'admin_debug'))
);

CREATE INDEX "idx_uploaded_files_subject" ON "kit_uploaded_files" ("subject_id");

CREATE TABLE "kit_usage_limit_agent_days" (
  "agent_slug" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "tokens" INTEGER NOT NULL DEFAULT 0,
  "active_seconds" REAL NOT NULL DEFAULT 0,
  PRIMARY KEY ("agent_slug", "day")
);

CREATE TABLE "kit_usage_limit_agent_months" (
  "agent_slug" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "tokens" INTEGER NOT NULL DEFAULT 0,
  "active_seconds" REAL NOT NULL DEFAULT 0,
  "tokens_unknown" INTEGER NOT NULL DEFAULT 0,
  "active_seconds_unknown" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("agent_slug", "month")
);

CREATE TABLE "kit_usage_limit_days" (
  "member_id" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "tokens" INTEGER NOT NULL DEFAULT 0,
  "active_seconds" REAL NOT NULL DEFAULT 0,
  PRIMARY KEY ("member_id", "day")
);

CREATE TABLE "kit_usage_limit_members" (
  "member_id" TEXT,
  "accounting_started_at" TEXT NOT NULL,
  PRIMARY KEY ("member_id")
);

CREATE TABLE "kit_usage_limit_months" (
  "member_id" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "tokens" INTEGER NOT NULL DEFAULT 0,
  "active_seconds" REAL NOT NULL DEFAULT 0,
  "tokens_unknown" INTEGER NOT NULL DEFAULT 0,
  "active_seconds_unknown" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("member_id", "month")
);

CREATE TABLE "kit_usage_limit_overrides" (
  "member_id" TEXT,
  "monthly_tokens" INTEGER,
  "monthly_active_seconds" REAL,
  "updated_at" TEXT NOT NULL,
  "updated_by" TEXT NOT NULL,
  "daily_tokens" INTEGER,
  "daily_active_seconds" REAL,
  PRIMARY KEY ("member_id")
);

CREATE TABLE "kit_usage_limit_policy" (
  "id" INTEGER,
  "monthly_tokens" INTEGER,
  "monthly_active_seconds" REAL,
  "updated_at" TEXT,
  "updated_by" TEXT,
  "daily_tokens" INTEGER,
  "daily_active_seconds" REAL,
  PRIMARY KEY ("id"),
  CHECK (id = 1)
);

CREATE TABLE "kit_usage_limit_requests" (
  "session_id" TEXT NOT NULL,
  "request_key" TEXT NOT NULL,
  "member_id" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "event_ids" TEXT,
  "previous_status" TEXT,
  "created_at" TEXT NOT NULL,
  PRIMARY KEY ("session_id", "request_key")
);

CREATE INDEX "idx_usage_limit_requests_member" ON "kit_usage_limit_requests" ("member_id", "status");

CREATE TABLE "kit_usage_limit_sessions" (
  "session_id" TEXT,
  "member_id" TEXT NOT NULL,
  "input_tokens" INTEGER,
  "output_tokens" INTEGER,
  "active_seconds" REAL,
  "admission_month" TEXT,
  "captured_at" TEXT,
  PRIMARY KEY ("session_id")
);

CREATE INDEX "idx_usage_limit_sessions_member" ON "kit_usage_limit_sessions" ("member_id");

CREATE TABLE "kit_usage_limit_templates" (
  "template_id" TEXT,
  "monthly_tokens" INTEGER,
  "monthly_active_seconds" REAL,
  "updated_at" TEXT NOT NULL,
  "updated_by" TEXT NOT NULL,
  "daily_tokens" INTEGER,
  "daily_active_seconds" REAL,
  PRIMARY KEY ("template_id"),
  FOREIGN KEY ("template_id") REFERENCES "kit_templates" ("template_id") ON DELETE CASCADE
);

CREATE TABLE "quota_override" (
  "subject_id" TEXT,
  "monthly_credits" INTEGER NOT NULL,
  "reason" TEXT,
  "updated_by" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  PRIMARY KEY ("subject_id")
);

CREATE TABLE "quota_pack" (
  "id" TEXT,
  "subject_id" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "credits" INTEGER NOT NULL,
  "reason" TEXT,
  "granted_by" TEXT NOT NULL,
  "created_at" TEXT NOT NULL,
  PRIMARY KEY ("id")
);

CREATE INDEX "idx_quota_pack_subject" ON "quota_pack" ("subject_id", "month");

CREATE TABLE "quota_policy" (
  "id" INTEGER,
  "monthly_credits" INTEGER NOT NULL,
  "updated_at" TEXT,
  "updated_by" TEXT,
  PRIMARY KEY ("id"),
  CHECK (id = 1)
);

CREATE TABLE "quota_request" (
  "id" TEXT,
  "subject_id" TEXT NOT NULL,
  "requested_credits" INTEGER NOT NULL,
  "reason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "mode" TEXT,
  "granted_credits" INTEGER,
  "review_note" TEXT,
  "reviewed_by" TEXT,
  "created_at" TEXT NOT NULL,
  "reviewed_at" TEXT,
  PRIMARY KEY ("id")
);

CREATE INDEX "idx_quota_request_subject" ON "quota_request" ("subject_id", "created_at");

CREATE TABLE "usage_turns" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "subject_id" TEXT NOT NULL,
  "agent_slug" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "client_message_id" TEXT,
  "day" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "created_at" TEXT NOT NULL
);

CREATE UNIQUE INDEX "idx_usage_turns_idempotency" ON "usage_turns" ("session_id", "client_message_id") WHERE client_message_id IS NOT NULL;

CREATE INDEX "idx_usage_turns_month_agent" ON "usage_turns" ("month", "agent_slug");

CREATE INDEX "idx_usage_turns_subject_month" ON "usage_turns" ("subject_id", "month");
