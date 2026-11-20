-- 由 db:generate 生成，修改结构请编辑共享定义。

-- 001_init
CREATE TABLE `catalog_agents` (
  `id` VARCHAR(128) NOT NULL,
  `slug` VARCHAR(255) NOT NULL,
  `display_name` TEXT NOT NULL,
  `description` TEXT,
  `icon` TEXT,
  `opening_remarks` LONGTEXT,
  `suggested_prompts` LONGTEXT NOT NULL DEFAULT ('[]'),
  `capabilities` LONGTEXT NOT NULL DEFAULT ('{}'),
  `theme` LONGTEXT,
  `remote_agent_id` TEXT NOT NULL,
  `remote_agent_version` BIGINT,
  `visibility` VARCHAR(20) NOT NULL DEFAULT 'public',
  `ordering` BIGINT NOT NULL DEFAULT 100,
  `status` VARCHAR(20) NOT NULL DEFAULT 'unlisted',
  `created_at` VARCHAR(32) NOT NULL,
  `updated_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE (`slug`)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE `kit_audit` (
  `id` BIGINT AUTO_INCREMENT,
  `at` VARCHAR(32) NOT NULL,
  `subject` TEXT,
  `action` TEXT NOT NULL,
  `target` TEXT,
  `detail` LONGTEXT,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE `kit_operations` (
  `operation_id` VARCHAR(128) NOT NULL,
  `kind` VARCHAR(100) NOT NULL,
  `subject` TEXT,
  `status` VARCHAR(20) NOT NULL,
  `phase` TEXT,
  `progress` DOUBLE NOT NULL DEFAULT 0,
  `log` LONGTEXT NOT NULL DEFAULT ('[]'),
  `result` LONGTEXT,
  `error` TEXT,
  `created_at` VARCHAR(32) NOT NULL,
  `updated_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`operation_id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE `kit_sessions` (
  `session_id` VARCHAR(255) NOT NULL,
  `subject_id` VARCHAR(512) NOT NULL,
  `agent_slug` VARCHAR(255) NOT NULL,
  `remote_agent_id` TEXT,
  `title` TEXT,
  `status` TEXT,
  `created_at` VARCHAR(32) NOT NULL,
  `last_event_at` VARCHAR(32),
  PRIMARY KEY (`session_id`),
  INDEX `idx_sessions_subject` (`subject_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;

-- 002_session_files
ALTER TABLE `kit_sessions` ADD COLUMN `files_json` LONGTEXT;

-- 003_quota_plaza
ALTER TABLE `catalog_agents` ADD COLUMN `category` VARCHAR(24) NOT NULL DEFAULT 'general';
ALTER TABLE `catalog_agents` ADD COLUMN `featured` TINYINT NOT NULL DEFAULT 0;
CREATE TABLE `quota_override` (
  `subject_id` VARCHAR(512) NOT NULL,
  `monthly_credits` BIGINT NOT NULL,
  `reason` TEXT,
  `updated_by` TEXT NOT NULL,
  `updated_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`subject_id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE `quota_pack` (
  `id` VARCHAR(128) NOT NULL,
  `subject_id` VARCHAR(512) NOT NULL,
  `month` VARCHAR(7) NOT NULL,
  `credits` BIGINT NOT NULL,
  `reason` TEXT,
  `granted_by` TEXT NOT NULL,
  `created_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_quota_pack_subject` (`subject_id`, `month`)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE `quota_policy` (
  `id` INT NOT NULL,
  `monthly_credits` BIGINT NOT NULL,
  `updated_at` VARCHAR(32),
  `updated_by` TEXT,
  PRIMARY KEY (`id`),
  CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE `quota_request` (
  `id` VARCHAR(128) NOT NULL,
  `subject_id` VARCHAR(512) NOT NULL,
  `requested_credits` BIGINT NOT NULL,
  `reason` TEXT,
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
  `mode` VARCHAR(20),
  `granted_credits` BIGINT,
  `review_note` TEXT,
  `reviewed_by` TEXT,
  `created_at` VARCHAR(32) NOT NULL,
  `reviewed_at` VARCHAR(32),
  PRIMARY KEY (`id`),
  INDEX `idx_quota_request_subject` (`subject_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE `usage_turns` (
  `id` BIGINT AUTO_INCREMENT,
  `subject_id` VARCHAR(512) NOT NULL,
  `agent_slug` VARCHAR(255) NOT NULL,
  `session_id` VARCHAR(255) NOT NULL,
  `client_message_id` VARCHAR(255),
  `day` VARCHAR(10) NOT NULL,
  `month` VARCHAR(7) NOT NULL,
  `created_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `idx_usage_turns_idempotency` (`session_id`, `client_message_id`),
  INDEX `idx_usage_turns_month_agent` (`month`, `agent_slug`),
  INDEX `idx_usage_turns_subject_month` (`subject_id`, `month`)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
INSERT INTO quota_policy (id, monthly_credits) VALUES (1, 200) ON DUPLICATE KEY UPDATE id = id;

-- 004_members
CREATE TABLE `kit_members` (
  `member_id` VARCHAR(128) NOT NULL,
  `username` VARCHAR(255) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  `display_name` TEXT NOT NULL,
  `email` TEXT,
  `auth_type` VARCHAR(20) NOT NULL,
  `status` VARCHAR(20) NOT NULL,
  `password_hash` TEXT NOT NULL,
  `created_at` VARCHAR(32) NOT NULL,
  `updated_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`member_id`),
  UNIQUE (`username`),
  CHECK (auth_type = 'local'),
  CHECK (status = 'active'),
  INDEX `idx_members_created` (`created_at`, `member_id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;

-- 005_member_auth
CREATE TABLE `kit_member_sessions` (
  `token_hash` VARCHAR(128) NOT NULL,
  `member_id` VARCHAR(128) NOT NULL,
  `created_at` VARCHAR(32) NOT NULL,
  `expires_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`token_hash`),
  INDEX `idx_member_sessions_expiry` (`expires_at`),
  INDEX `idx_member_sessions_member` (`member_id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE `kit_uploaded_files` (
  `file_id` VARCHAR(255) NOT NULL,
  `subject_id` VARCHAR(512) NOT NULL,
  `created_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`file_id`),
  INDEX `idx_uploaded_files_subject` (`subject_id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;

-- 006_legacy_file_ownership
-- 数据转换 legacyFiles 由运行时执行。

-- 007_admin_debug_scope
CREATE TABLE `kit_sessions_migration_next` (
  `session_id` VARCHAR(255) NOT NULL,
  `subject_id` VARCHAR(512) NOT NULL,
  `purpose` VARCHAR(20) NOT NULL DEFAULT 'experience',
  `agent_slug` VARCHAR(255),
  `remote_agent_id` TEXT,
  `project_name` VARCHAR(255),
  `agent_key` VARCHAR(255),
  `project_revision` TEXT,
  `source_dirty` TINYINT,
  `title` TEXT,
  `status` TEXT,
  `created_at` VARCHAR(32) NOT NULL,
  `last_event_at` VARCHAR(32),
  `files_json` LONGTEXT,
  PRIMARY KEY (`session_id`),
  CHECK (purpose IN ('experience', 'admin_debug')),
  CHECK ((purpose = 'experience' AND agent_slug IS NOT NULL)
    OR (purpose = 'admin_debug' AND agent_slug IS NULL AND project_name IS NOT NULL
      AND agent_key IS NOT NULL AND remote_agent_id IS NOT NULL)),
  INDEX `idx_debug_sessions_project` (`purpose`, `subject_id`, `project_name`(64), `agent_key`(64), `created_at`),
  INDEX `idx_sessions_subject` (`purpose`, `subject_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
INSERT INTO `kit_sessions_migration_next`
  (session_id, subject_id, agent_slug, remote_agent_id, title, status, created_at, last_event_at, files_json)
SELECT session_id, subject_id, agent_slug, remote_agent_id, title, status, created_at, last_event_at, files_json
FROM kit_sessions;
RENAME TABLE `kit_sessions` TO `kit_sessions_migration_old`, `kit_sessions_migration_next` TO `kit_sessions`;
DROP TABLE `kit_sessions_migration_old`;
ALTER TABLE `kit_uploaded_files` ADD COLUMN `purpose` VARCHAR(20) NOT NULL DEFAULT 'experience';
ALTER TABLE `kit_uploaded_files` ADD CHECK (purpose IN ('experience', 'admin_debug'));

-- 008_member_session_usage
CREATE TABLE `kit_session_deletions` (
  `session_id` VARCHAR(255) NOT NULL,
  `subject_id` VARCHAR(512) NOT NULL,
  `stage` VARCHAR(20) NOT NULL,
  `updated_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`session_id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE `kit_session_usage` (
  `session_id` VARCHAR(255) NOT NULL,
  `member_id` VARCHAR(128) NOT NULL,
  `agent_slug` VARCHAR(255) NOT NULL,
  `title` TEXT,
  `status` TEXT,
  `created_at` VARCHAR(32) NOT NULL,
  `input_tokens` BIGINT,
  `output_tokens` BIGINT,
  `cache_read_input_tokens` BIGINT,
  `cache_creation_input_tokens` BIGINT,
  `active_seconds` DOUBLE,
  `duration_seconds` DOUBLE,
  `collection_status` VARCHAR(20) NOT NULL DEFAULT 'pending',
  `captured_at` VARCHAR(32),
  `attempted_at` VARCHAR(32),
  `capture_revision` BIGINT NOT NULL DEFAULT 0,
  `finalized_at` VARCHAR(32),
  `deleted_at` VARCHAR(32),
  PRIMARY KEY (`session_id`),
  INDEX `idx_session_usage_member` (`member_id`, `agent_slug`, `created_at`, `session_id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;

-- 009_member_usage_limits
CREATE TABLE `kit_usage_limit_members` (
  `member_id` VARCHAR(128) NOT NULL,
  `accounting_started_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`member_id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE `kit_usage_limit_months` (
  `member_id` VARCHAR(128) NOT NULL,
  `month` VARCHAR(7) NOT NULL,
  `tokens` BIGINT NOT NULL DEFAULT 0,
  `active_seconds` DOUBLE NOT NULL DEFAULT 0,
  `tokens_unknown` TINYINT NOT NULL DEFAULT 0,
  `active_seconds_unknown` TINYINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`member_id`, `month`)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE `kit_usage_limit_overrides` (
  `member_id` VARCHAR(128) NOT NULL,
  `monthly_tokens` BIGINT,
  `monthly_active_seconds` DOUBLE,
  `updated_at` VARCHAR(32) NOT NULL,
  `updated_by` TEXT NOT NULL,
  PRIMARY KEY (`member_id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE `kit_usage_limit_policy` (
  `id` INT NOT NULL,
  `monthly_tokens` BIGINT,
  `monthly_active_seconds` DOUBLE,
  `updated_at` VARCHAR(32),
  `updated_by` TEXT,
  PRIMARY KEY (`id`),
  CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE `kit_usage_limit_requests` (
  `session_id` VARCHAR(255) NOT NULL,
  `request_key` VARCHAR(255) NOT NULL,
  `member_id` VARCHAR(128) NOT NULL,
  `request_hash` VARCHAR(128) NOT NULL,
  `status` VARCHAR(20) NOT NULL,
  `event_ids` LONGTEXT,
  `previous_status` TEXT,
  `created_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`session_id`, `request_key`),
  INDEX `idx_usage_limit_requests_member` (`member_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE `kit_usage_limit_sessions` (
  `session_id` VARCHAR(255) NOT NULL,
  `member_id` VARCHAR(128) NOT NULL,
  `input_tokens` BIGINT,
  `output_tokens` BIGINT,
  `active_seconds` DOUBLE,
  `admission_month` VARCHAR(7),
  `captured_at` VARCHAR(32),
  PRIMARY KEY (`session_id`),
  INDEX `idx_usage_limit_sessions_member` (`member_id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
INSERT INTO kit_usage_limit_policy (id) VALUES (1);

-- 010_catalog_environment
ALTER TABLE `catalog_agents` ADD COLUMN `remote_environment_id` TEXT;

-- 011_catalog_files
ALTER TABLE `catalog_agents` ADD COLUMN `files_json` LONGTEXT NOT NULL DEFAULT ('[]');

-- 012_catalog_memory_stores
ALTER TABLE `catalog_agents` ADD COLUMN `memory_stores_json` LONGTEXT NOT NULL DEFAULT ('[]');

-- 013_catalog_vaults
ALTER TABLE `catalog_agents` ADD COLUMN `vault_ids_json` LONGTEXT NOT NULL DEFAULT ('[]');

-- 014_member_groups
CREATE TABLE `kit_groups` (
  `group_id` VARCHAR(128) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `description` TEXT,
  `revision` BIGINT NOT NULL DEFAULT 1,
  `created_at` VARCHAR(32) NOT NULL,
  `updated_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`group_id`),
  UNIQUE (`name`),
  INDEX `idx_groups_created` (`created_at`, `group_id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE `kit_group_members` (
  `group_id` VARCHAR(128) NOT NULL,
  `member_id` VARCHAR(128) NOT NULL,
  PRIMARY KEY (`group_id`, `member_id`),
  FOREIGN KEY (`member_id`) REFERENCES `kit_members` (`member_id`),
  FOREIGN KEY (`group_id`) REFERENCES `kit_groups` (`group_id`),
  INDEX `idx_group_members_member` (`member_id`, `group_id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;

-- 015_template_debug_sessions
CREATE TABLE `kit_sessions_migration_next` (
  `session_id` VARCHAR(255) NOT NULL,
  `subject_id` VARCHAR(512) NOT NULL,
  `purpose` VARCHAR(20) NOT NULL DEFAULT 'experience',
  `agent_slug` VARCHAR(255),
  `remote_agent_id` TEXT,
  `project_name` VARCHAR(255),
  `agent_key` VARCHAR(255),
  `project_revision` TEXT,
  `source_dirty` TINYINT,
  `title` TEXT,
  `status` TEXT,
  `created_at` VARCHAR(32) NOT NULL,
  `last_event_at` VARCHAR(32),
  `files_json` LONGTEXT,
  `debug_source` VARCHAR(20),
  `remote_environment_id` TEXT,
  `runtime_json` LONGTEXT,
  PRIMARY KEY (`session_id`),
  CHECK (purpose IN ('experience', 'admin_debug')),
  CHECK (debug_source IN ('project', 'template')),
  CHECK ((purpose = 'experience' AND agent_slug IS NOT NULL AND debug_source IS NULL)
    OR (purpose = 'admin_debug' AND agent_slug IS NULL AND remote_agent_id IS NOT NULL AND debug_source IS NOT NULL AND
      ((debug_source = 'project' AND project_name IS NOT NULL AND agent_key IS NOT NULL)
        OR (debug_source = 'template' AND project_name IS NULL AND agent_key IS NULL
          AND remote_environment_id IS NOT NULL)))),
  INDEX `idx_debug_sessions_project` (`purpose`, `subject_id`, `project_name`(64), `agent_key`(64), `created_at`),
  INDEX `idx_sessions_subject` (`purpose`, `subject_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
INSERT INTO `kit_sessions_migration_next`
  (session_id, subject_id, purpose, agent_slug, remote_agent_id, project_name, agent_key,
   project_revision, source_dirty, title, status, created_at, last_event_at, files_json, debug_source)
SELECT session_id, subject_id, purpose, agent_slug, remote_agent_id, project_name, agent_key,
  project_revision, source_dirty, title, status, created_at, last_event_at, files_json,
  CASE WHEN purpose = 'admin_debug' THEN 'project' ELSE NULL END
FROM kit_sessions;
RENAME TABLE `kit_sessions` TO `kit_sessions_migration_old`, `kit_sessions_migration_next` TO `kit_sessions`;
DROP TABLE `kit_sessions_migration_old`;

-- 016_saved_templates
CREATE TABLE `kit_templates` (
  `template_id` VARCHAR(128) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `remote_agent_id` TEXT NOT NULL,
  `remote_agent_name` TEXT NOT NULL,
  `config_json` LONGTEXT NOT NULL,
  `created_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`template_id`),
  UNIQUE (`name`),
  INDEX `idx_templates_created` (`created_at`, `template_id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;

-- 017_template_listings
CREATE TABLE `kit_template_listings` (
  `template_id` VARCHAR(128) NOT NULL,
  `catalog_id` VARCHAR(128) NOT NULL,
  PRIMARY KEY (`template_id`),
  UNIQUE (`catalog_id`),
  FOREIGN KEY (`catalog_id`) REFERENCES `catalog_agents` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`template_id`) REFERENCES `kit_templates` (`template_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;

-- 018_template_versions
ALTER TABLE `kit_templates` ADD COLUMN `version` BIGINT NOT NULL DEFAULT 1;
ALTER TABLE `kit_templates` ADD COLUMN `updated_at` VARCHAR(32) NOT NULL DEFAULT '';
ALTER TABLE `kit_templates` ADD CHECK (version > 0);
CREATE TABLE `kit_template_versions` (
  `template_id` VARCHAR(128) NOT NULL,
  `version` BIGINT NOT NULL,
  `config_json` LONGTEXT NOT NULL,
  `created_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`template_id`, `version`),
  FOREIGN KEY (`template_id`) REFERENCES `kit_templates` (`template_id`) ON DELETE CASCADE,
  CHECK (version > 0)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
UPDATE kit_templates SET updated_at=created_at;
INSERT INTO kit_template_versions (template_id,version,config_json,created_at)
SELECT template_id,version,config_json,created_at FROM kit_templates;
ALTER TABLE `kit_templates` ALTER COLUMN `updated_at` DROP DEFAULT;

-- 019_template_usage_limits
CREATE TABLE `kit_usage_limit_agent_months` (
  `agent_slug` VARCHAR(255) NOT NULL,
  `month` VARCHAR(7) NOT NULL,
  `tokens` BIGINT NOT NULL DEFAULT 0,
  `active_seconds` DOUBLE NOT NULL DEFAULT 0,
  `tokens_unknown` TINYINT NOT NULL DEFAULT 0,
  `active_seconds_unknown` TINYINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`agent_slug`, `month`)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE `kit_usage_limit_templates` (
  `template_id` VARCHAR(128) NOT NULL,
  `monthly_tokens` BIGINT,
  `monthly_active_seconds` DOUBLE,
  `updated_at` VARCHAR(32) NOT NULL,
  `updated_by` TEXT NOT NULL,
  PRIMARY KEY (`template_id`),
  FOREIGN KEY (`template_id`) REFERENCES `kit_templates` (`template_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;

-- 020_usage_limit_days
CREATE TABLE `kit_usage_limit_days` (
  `member_id` VARCHAR(128) NOT NULL,
  `day` VARCHAR(10) NOT NULL,
  `tokens` BIGINT NOT NULL DEFAULT 0,
  `active_seconds` DOUBLE NOT NULL DEFAULT 0,
  PRIMARY KEY (`member_id`, `day`)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;

-- 021_usage_limit_days_backfill
INSERT INTO kit_usage_limit_days (member_id, day, tokens, active_seconds)
SELECT d.member_id, d.day, d.tokens, d.active_seconds FROM (
SELECT member_id, substr(captured_at, 1, 10) AS day,
       CAST(SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)) AS SIGNED) AS tokens,
       SUM(COALESCE(active_seconds, 0)) AS active_seconds
FROM kit_usage_limit_sessions
WHERE captured_at IS NOT NULL AND admission_month IS NOT NULL
GROUP BY member_id, substr(captured_at, 1, 10)
) AS d
ON DUPLICATE KEY UPDATE tokens = d.tokens, active_seconds = d.active_seconds;

-- 022_usage_limit_days_rebuild
-- 数据转换 rebuildDailyUsage 由运行时执行。

-- 023_catalog_agent_version_binding
ALTER TABLE `catalog_agents` ADD COLUMN `agent_version` BIGINT;
ALTER TABLE `catalog_agents` ADD CHECK (agent_version > 0);

-- 024_template_default_environment
CREATE TABLE `kit_sessions_migration_next` (
  `session_id` VARCHAR(255) NOT NULL,
  `subject_id` VARCHAR(512) NOT NULL,
  `purpose` VARCHAR(20) NOT NULL DEFAULT 'experience',
  `agent_slug` VARCHAR(255),
  `remote_agent_id` TEXT,
  `project_name` VARCHAR(255),
  `agent_key` VARCHAR(255),
  `project_revision` TEXT,
  `source_dirty` TINYINT,
  `title` TEXT,
  `status` TEXT,
  `created_at` VARCHAR(32) NOT NULL,
  `last_event_at` VARCHAR(32),
  `files_json` LONGTEXT,
  `debug_source` VARCHAR(20),
  `remote_environment_id` TEXT,
  `runtime_json` LONGTEXT,
  PRIMARY KEY (`session_id`),
  CHECK (purpose IN ('experience', 'admin_debug')),
  CHECK (debug_source IN ('project', 'template')),
  CHECK ((purpose = 'experience' AND agent_slug IS NOT NULL AND debug_source IS NULL)
    OR (purpose = 'admin_debug' AND agent_slug IS NULL AND remote_agent_id IS NOT NULL AND debug_source IS NOT NULL AND
      ((debug_source = 'project' AND project_name IS NOT NULL AND agent_key IS NOT NULL)
        OR (debug_source = 'template' AND project_name IS NULL AND agent_key IS NULL)))),
  INDEX `idx_debug_sessions_project` (`purpose`, `subject_id`, `project_name`(64), `agent_key`(64), `created_at`),
  INDEX `idx_sessions_subject` (`purpose`, `subject_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
INSERT INTO `kit_sessions_migration_next`
  (session_id, subject_id, purpose, agent_slug, remote_agent_id, project_name, agent_key,
   project_revision, source_dirty, title, status, created_at, last_event_at, files_json,
   debug_source, remote_environment_id, runtime_json)
SELECT session_id, subject_id, purpose, agent_slug, remote_agent_id, project_name, agent_key,
  project_revision, source_dirty, title, status, created_at, last_event_at, files_json,
  debug_source, remote_environment_id, runtime_json
FROM kit_sessions;
RENAME TABLE `kit_sessions` TO `kit_sessions_migration_old`, `kit_sessions_migration_next` TO `kit_sessions`;
DROP TABLE `kit_sessions_migration_old`;

-- 025_resource_draft_batches
CREATE TABLE `kit_resource_drafts` (
  `draft_id` VARCHAR(128) NOT NULL,
  `owner` VARCHAR(255) NOT NULL,
  `status` VARCHAR(20) NOT NULL,
  `phase` VARCHAR(20) NOT NULL,
  `resources_json` LONGTEXT NOT NULL DEFAULT ('[]'),
  `cleanup_pending` TINYINT NOT NULL DEFAULT 0,
  `operation_id` VARCHAR(128),
  `expected_revision` TEXT,
  `created_at` VARCHAR(32) NOT NULL,
  `updated_at` VARCHAR(32) NOT NULL,
  `active_owner` VARCHAR(255) GENERATED ALWAYS AS (CASE WHEN status != 'published' OR cleanup_pending = 1 THEN owner END) STORED,
  PRIMARY KEY (`draft_id`),
  CHECK (status IN ('draft','publishing','published','failed')),
  CHECK (phase IN ('editable','executing','uncertain','succeeded')),
  UNIQUE INDEX `idx_resource_drafts_active_owner` (`active_owner`)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;

-- 026_resource_draft_cleanup_ownership
ALTER TABLE `kit_resource_drafts` ADD COLUMN `cleanup_key_hash` VARCHAR(128);

-- 027_usage_limit_daily
ALTER TABLE `kit_usage_limit_overrides` ADD COLUMN `daily_tokens` BIGINT;
ALTER TABLE `kit_usage_limit_overrides` ADD COLUMN `daily_active_seconds` DOUBLE;
ALTER TABLE `kit_usage_limit_policy` ADD COLUMN `daily_tokens` BIGINT;
ALTER TABLE `kit_usage_limit_policy` ADD COLUMN `daily_active_seconds` DOUBLE;
ALTER TABLE `kit_usage_limit_templates` ADD COLUMN `daily_tokens` BIGINT;
ALTER TABLE `kit_usage_limit_templates` ADD COLUMN `daily_active_seconds` DOUBLE;
CREATE TABLE `kit_usage_limit_agent_days` (
  `agent_slug` VARCHAR(255) NOT NULL,
  `day` VARCHAR(10) NOT NULL,
  `tokens` BIGINT NOT NULL DEFAULT 0,
  `active_seconds` DOUBLE NOT NULL DEFAULT 0,
  PRIMARY KEY (`agent_slug`, `day`)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;

-- 023_catalog_listed_at
ALTER TABLE `catalog_agents` ADD COLUMN `listed_at` VARCHAR(32);

-- 023_session_message_files
ALTER TABLE `kit_sessions` ADD COLUMN `message_files_json` LONGTEXT;

-- 028_preset_packs
CREATE TABLE `kit_preset_packs` (
  `preset_pack_id` VARCHAR(128) NOT NULL,
  `config_json` LONGTEXT NOT NULL,
  `created_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`preset_pack_id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;

-- 029_yaml_resource_drafts
ALTER TABLE `kit_resource_drafts` ADD COLUMN `engine` VARCHAR(20) NOT NULL DEFAULT 'directory';
CREATE TABLE `kit_resource_draft_documents` (
  `draft_id` VARCHAR(128) NOT NULL,
  `revision` BIGINT NOT NULL DEFAULT 1,
  `yaml` LONGTEXT NOT NULL,
  `assets_json` LONGTEXT NOT NULL DEFAULT ('[]'),
  `sdk_state_json` LONGTEXT NOT NULL DEFAULT ('{"resources":[]}'),
  `proof_json` LONGTEXT,
  PRIMARY KEY (`draft_id`),
  FOREIGN KEY (`draft_id`) REFERENCES `kit_resource_drafts` (`draft_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;

-- 030_resource_draft_assets

-- 031_retire_directory_drafts
CREATE TABLE `kit_retired_directory_drafts` (
  `draft_id` VARCHAR(128) NOT NULL,
  `record_json` LONGTEXT NOT NULL,
  `document_json` LONGTEXT,
  `retired_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`draft_id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
-- 数据转换 retireDrafts 由运行时执行。
ALTER TABLE `kit_resource_drafts` ALTER COLUMN `engine` SET DEFAULT 'yaml';

-- 032_publication_result_contract
ALTER TABLE `kit_operations` ADD COLUMN `publication_json` LONGTEXT;
ALTER TABLE `kit_operations` ADD COLUMN `error_details_json` LONGTEXT;

-- 029_branding
CREATE TABLE `kit_branding` (
  `id` INT NOT NULL,
  `product_name` TEXT NOT NULL,
  `logo_url` TEXT,
  `updated_at` VARCHAR(32) NOT NULL,
  `updated_by` TEXT,
  PRIMARY KEY (`id`),
  CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
INSERT INTO kit_branding (id, product_name, updated_at) VALUES (1, 'OpenAgentPack Kit', '2026-11-13T00:00:00.000Z') ON DUPLICATE KEY UPDATE id = id;

-- 030_branding_logo
CREATE TABLE `kit_branding_logo` (
  `id` INT NOT NULL,
  `content_type` VARCHAR(100) NOT NULL,
  `bytes` LONGBLOB NOT NULL,
  `hash` VARCHAR(128) NOT NULL,
  `updated_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`id`),
  CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;

-- 033_openagentkit_default_branding
UPDATE kit_branding SET product_name = 'OpenAgentKit'
WHERE id = 1 AND product_name = 'OpenAgentPack Kit' AND updated_by IS NULL;

-- 034_java_operation_recovery
CREATE TABLE `kit_confirmation_consumptions` (
  `token_hash` VARCHAR(128) NOT NULL,
  `expires_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`token_hash`)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE `kit_resource_publish_plans` (
  `draft_id` VARCHAR(128) NOT NULL,
  `plan_id` TEXT NOT NULL,
  `plan_json` LONGTEXT NOT NULL,
  `expires_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`draft_id`),
  FOREIGN KEY (`draft_id`) REFERENCES `kit_resource_drafts` (`draft_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE `kit_sdk_operation_claims` (
  `operation_id` VARCHAR(128) NOT NULL,
  `draft_id` VARCHAR(128) NOT NULL,
  `node_instance` TEXT,
  `plan_json` LONGTEXT NOT NULL,
  `mutation_granted` BIGINT NOT NULL DEFAULT 0,
  `updated_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`operation_id`),
  FOREIGN KEY (`operation_id`) REFERENCES `kit_operations` (`operation_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE `kit_sdk_checkpoints` (
  `operation_id` VARCHAR(128) NOT NULL,
  `sequence` BIGINT NOT NULL,
  `payload_hash` TEXT NOT NULL,
  PRIMARY KEY (`operation_id`, `sequence`),
  FOREIGN KEY (`operation_id`) REFERENCES `kit_sdk_operation_claims` (`operation_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
CREATE TABLE `kit_session_send_receipts` (
  `session_id` VARCHAR(255) NOT NULL,
  `client_message_id` VARCHAR(255) NOT NULL,
  `request_hash` VARCHAR(128) NOT NULL,
  `event_ids` LONGTEXT,
  `created_at` VARCHAR(32) NOT NULL,
  PRIMARY KEY (`session_id`, `client_message_id`),
  FOREIGN KEY (`session_id`) REFERENCES `kit_sessions` (`session_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin;
