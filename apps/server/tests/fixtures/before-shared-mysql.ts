// MySQL 新库从现行结构起步。SQLite 的历史数据修复仍由原迁移负责。
export const mysqlSchema = [
	`CREATE TABLE IF NOT EXISTS catalog_agents (
		id VARCHAR(128) PRIMARY KEY,
		slug VARCHAR(255) NOT NULL UNIQUE,
		display_name TEXT NOT NULL,
		description TEXT, icon TEXT, opening_remarks LONGTEXT,
		suggested_prompts LONGTEXT NOT NULL DEFAULT ('[]'),
		capabilities LONGTEXT NOT NULL DEFAULT ('{}'),
		theme LONGTEXT,
		remote_agent_id TEXT NOT NULL,
		remote_agent_version BIGINT,
		visibility VARCHAR(20) NOT NULL DEFAULT 'public',
		ordering BIGINT NOT NULL DEFAULT 100,
		status VARCHAR(20) NOT NULL DEFAULT 'unlisted',
		created_at VARCHAR(32) NOT NULL, updated_at VARCHAR(32) NOT NULL,
		category VARCHAR(24) NOT NULL DEFAULT 'general',
		featured TINYINT NOT NULL DEFAULT 0,
		remote_environment_id TEXT,
		files_json LONGTEXT NOT NULL DEFAULT ('[]'),
		memory_stores_json LONGTEXT NOT NULL DEFAULT ('[]'),
		vault_ids_json LONGTEXT NOT NULL DEFAULT ('[]'),
		agent_version BIGINT CHECK (agent_version > 0),
		listed_at VARCHAR(32)
	)`,
	`CREATE TABLE IF NOT EXISTS kit_audit (
		id BIGINT PRIMARY KEY AUTO_INCREMENT,
		at VARCHAR(32) NOT NULL,
		subject TEXT, action TEXT NOT NULL, target TEXT, detail LONGTEXT
	)`,
	`CREATE TABLE IF NOT EXISTS kit_branding (
		id INT PRIMARY KEY CHECK (id = 1),
		product_name TEXT NOT NULL, logo_url TEXT,
		updated_at VARCHAR(32) NOT NULL, updated_by TEXT
	)`,
	`CREATE TABLE IF NOT EXISTS kit_branding_logo (
		id INT PRIMARY KEY CHECK (id = 1),
		content_type VARCHAR(100) NOT NULL, bytes LONGBLOB NOT NULL,
		hash VARCHAR(128) NOT NULL, updated_at VARCHAR(32) NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS kit_members (
		member_id VARCHAR(128) PRIMARY KEY,
		username VARCHAR(255) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL UNIQUE,
		display_name TEXT NOT NULL, email TEXT,
		auth_type VARCHAR(20) NOT NULL CHECK (auth_type = 'local'),
		status VARCHAR(20) NOT NULL CHECK (status = 'active'),
		password_hash TEXT NOT NULL,
		created_at VARCHAR(32) NOT NULL, updated_at VARCHAR(32) NOT NULL,
		INDEX idx_members_created (created_at, member_id)
	)`,
	`CREATE TABLE IF NOT EXISTS kit_groups (
		group_id VARCHAR(128) PRIMARY KEY,
		name VARCHAR(255) NOT NULL UNIQUE, description TEXT,
		revision BIGINT NOT NULL DEFAULT 1,
		created_at VARCHAR(32) NOT NULL, updated_at VARCHAR(32) NOT NULL,
		INDEX idx_groups_created (created_at, group_id)
	)`,
	`CREATE TABLE IF NOT EXISTS kit_group_members (
		group_id VARCHAR(128) NOT NULL, member_id VARCHAR(128) NOT NULL,
		PRIMARY KEY (group_id, member_id),
		INDEX idx_group_members_member (member_id, group_id),
		FOREIGN KEY (group_id) REFERENCES kit_groups(group_id),
		FOREIGN KEY (member_id) REFERENCES kit_members(member_id)
	)`,
	`CREATE TABLE IF NOT EXISTS kit_member_sessions (
		token_hash VARCHAR(128) PRIMARY KEY, member_id VARCHAR(128) NOT NULL,
		created_at VARCHAR(32) NOT NULL, expires_at VARCHAR(32) NOT NULL,
		INDEX idx_member_sessions_expiry (expires_at),
		INDEX idx_member_sessions_member (member_id)
	)`,
	`CREATE TABLE IF NOT EXISTS kit_operations (
		operation_id VARCHAR(128) PRIMARY KEY,
		kind VARCHAR(100) NOT NULL, subject TEXT, status VARCHAR(20) NOT NULL, phase TEXT,
		progress DOUBLE NOT NULL DEFAULT 0, log LONGTEXT NOT NULL DEFAULT ('[]'),
		result LONGTEXT, error TEXT,
		created_at VARCHAR(32) NOT NULL, updated_at VARCHAR(32) NOT NULL,
		publication_json LONGTEXT, error_details_json LONGTEXT
	)`,
	`CREATE TABLE IF NOT EXISTS kit_preset_packs (
		preset_pack_id VARCHAR(128) PRIMARY KEY, config_json LONGTEXT NOT NULL, created_at VARCHAR(32) NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS kit_resource_drafts (
		draft_id VARCHAR(128) PRIMARY KEY, owner VARCHAR(255) NOT NULL,
		status VARCHAR(20) NOT NULL CHECK (status IN ('draft','publishing','published','failed')),
		phase VARCHAR(20) NOT NULL CHECK (phase IN ('editable','executing','uncertain','succeeded')),
		resources_json LONGTEXT NOT NULL DEFAULT ('[]'), cleanup_pending TINYINT NOT NULL DEFAULT 0,
		operation_id VARCHAR(128), expected_revision TEXT,
		created_at VARCHAR(32) NOT NULL, updated_at VARCHAR(32) NOT NULL,
		cleanup_key_hash VARCHAR(128), engine VARCHAR(20) NOT NULL DEFAULT 'yaml',
		active_owner VARCHAR(255) GENERATED ALWAYS AS (
			CASE WHEN status <> 'published' OR cleanup_pending = 1 THEN owner END
		) STORED,
		UNIQUE INDEX idx_resource_drafts_active_owner (active_owner)
	)`,
	`CREATE TABLE IF NOT EXISTS kit_resource_draft_documents (
		draft_id VARCHAR(128) PRIMARY KEY, revision BIGINT NOT NULL DEFAULT 1,
		yaml LONGTEXT NOT NULL, assets_json LONGTEXT NOT NULL DEFAULT ('[]'),
		sdk_state_json LONGTEXT NOT NULL DEFAULT ('{"resources":[]}'), proof_json LONGTEXT,
		FOREIGN KEY (draft_id) REFERENCES kit_resource_drafts(draft_id) ON DELETE CASCADE
	)`,
	`CREATE TABLE IF NOT EXISTS kit_session_deletions (
		session_id VARCHAR(255) PRIMARY KEY, subject_id VARCHAR(512) NOT NULL,
		stage VARCHAR(20) NOT NULL, updated_at VARCHAR(32) NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS kit_session_usage (
		session_id VARCHAR(255) PRIMARY KEY, member_id VARCHAR(128) NOT NULL, agent_slug VARCHAR(255) NOT NULL,
		title TEXT, status TEXT, created_at VARCHAR(32) NOT NULL,
		input_tokens BIGINT, output_tokens BIGINT, cache_read_input_tokens BIGINT, cache_creation_input_tokens BIGINT,
		active_seconds DOUBLE, duration_seconds DOUBLE,
		collection_status VARCHAR(20) NOT NULL DEFAULT 'pending',
		captured_at VARCHAR(32), attempted_at VARCHAR(32), capture_revision BIGINT NOT NULL DEFAULT 0,
		finalized_at VARCHAR(32), deleted_at VARCHAR(32),
		INDEX idx_session_usage_member (member_id, agent_slug, created_at, session_id)
	)`,
	`CREATE TABLE IF NOT EXISTS kit_sessions (
		session_id VARCHAR(255) PRIMARY KEY, subject_id VARCHAR(512) NOT NULL,
		purpose VARCHAR(20) NOT NULL DEFAULT 'experience' CHECK (purpose IN ('experience','admin_debug')),
		agent_slug VARCHAR(255), remote_agent_id TEXT, project_name VARCHAR(255), agent_key VARCHAR(255),
		project_revision TEXT, source_dirty TINYINT, title TEXT, status TEXT,
		created_at VARCHAR(32) NOT NULL, last_event_at VARCHAR(32), files_json LONGTEXT,
		debug_source VARCHAR(20) CHECK (debug_source IN ('project', 'template')),
		remote_environment_id TEXT, runtime_json LONGTEXT, message_files_json LONGTEXT,
		CHECK ((purpose = 'experience' AND agent_slug IS NOT NULL AND debug_source IS NULL)
			OR (purpose = 'admin_debug' AND agent_slug IS NULL AND remote_agent_id IS NOT NULL AND debug_source IS NOT NULL
				AND ((debug_source = 'project' AND project_name IS NOT NULL AND agent_key IS NOT NULL)
					OR (debug_source = 'template' AND project_name IS NULL AND agent_key IS NULL)))),
		INDEX idx_sessions_subject (purpose, subject_id, created_at),
		INDEX idx_debug_sessions_project (purpose, subject_id, project_name(64), agent_key(64), created_at)
	)`,
	`CREATE TABLE IF NOT EXISTS kit_templates (
		template_id VARCHAR(128) PRIMARY KEY, name VARCHAR(255) NOT NULL UNIQUE,
		remote_agent_id TEXT NOT NULL, remote_agent_name TEXT NOT NULL, config_json LONGTEXT NOT NULL,
		created_at VARCHAR(32) NOT NULL, updated_at VARCHAR(32) NOT NULL,
		version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
		INDEX idx_templates_created (created_at, template_id)
	)`,
	`CREATE TABLE IF NOT EXISTS kit_template_listings (
		template_id VARCHAR(128) PRIMARY KEY, catalog_id VARCHAR(128) NOT NULL UNIQUE,
		FOREIGN KEY (template_id) REFERENCES kit_templates(template_id) ON DELETE CASCADE,
		FOREIGN KEY (catalog_id) REFERENCES catalog_agents(id) ON DELETE CASCADE
	)`,
	`CREATE TABLE IF NOT EXISTS kit_template_versions (
		template_id VARCHAR(128) NOT NULL, version BIGINT NOT NULL CHECK (version > 0),
		config_json LONGTEXT NOT NULL, created_at VARCHAR(32) NOT NULL,
		PRIMARY KEY (template_id, version),
		FOREIGN KEY (template_id) REFERENCES kit_templates(template_id) ON DELETE CASCADE
	)`,
	`CREATE TABLE IF NOT EXISTS kit_uploaded_files (
		file_id VARCHAR(255) PRIMARY KEY, subject_id VARCHAR(512) NOT NULL, created_at VARCHAR(32) NOT NULL,
		purpose VARCHAR(20) NOT NULL DEFAULT 'experience' CHECK (purpose IN ('experience','admin_debug')),
		INDEX idx_uploaded_files_subject (subject_id)
	)`,
	`CREATE TABLE IF NOT EXISTS kit_usage_limit_agent_days (
		agent_slug VARCHAR(255) NOT NULL, day VARCHAR(10) NOT NULL, tokens BIGINT NOT NULL DEFAULT 0,
		active_seconds DOUBLE NOT NULL DEFAULT 0, PRIMARY KEY (agent_slug, day)
	)`,
	`CREATE TABLE IF NOT EXISTS kit_usage_limit_agent_months (
		agent_slug VARCHAR(255) NOT NULL, month VARCHAR(7) NOT NULL, tokens BIGINT NOT NULL DEFAULT 0,
		active_seconds DOUBLE NOT NULL DEFAULT 0, tokens_unknown TINYINT NOT NULL DEFAULT 0,
		active_seconds_unknown TINYINT NOT NULL DEFAULT 0, PRIMARY KEY (agent_slug, month)
	)`,
	`CREATE TABLE IF NOT EXISTS kit_usage_limit_days (
		member_id VARCHAR(128) NOT NULL, day VARCHAR(10) NOT NULL, tokens BIGINT NOT NULL DEFAULT 0,
		active_seconds DOUBLE NOT NULL DEFAULT 0, PRIMARY KEY (member_id, day)
	)`,
	`CREATE TABLE IF NOT EXISTS kit_usage_limit_members (
		member_id VARCHAR(128) PRIMARY KEY, accounting_started_at VARCHAR(32) NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS kit_usage_limit_months (
		member_id VARCHAR(128) NOT NULL, month VARCHAR(7) NOT NULL, tokens BIGINT NOT NULL DEFAULT 0,
		active_seconds DOUBLE NOT NULL DEFAULT 0, tokens_unknown TINYINT NOT NULL DEFAULT 0,
		active_seconds_unknown TINYINT NOT NULL DEFAULT 0, PRIMARY KEY (member_id, month)
	)`,
	`CREATE TABLE IF NOT EXISTS kit_usage_limit_overrides (
		member_id VARCHAR(128) PRIMARY KEY, monthly_tokens BIGINT, monthly_active_seconds DOUBLE,
		updated_at VARCHAR(32) NOT NULL, updated_by TEXT NOT NULL, daily_tokens BIGINT, daily_active_seconds DOUBLE
	)`,
	`CREATE TABLE IF NOT EXISTS kit_usage_limit_policy (
		id INT PRIMARY KEY CHECK (id = 1), monthly_tokens BIGINT, monthly_active_seconds DOUBLE,
		updated_at VARCHAR(32), updated_by TEXT, daily_tokens BIGINT, daily_active_seconds DOUBLE
	)`,
	`CREATE TABLE IF NOT EXISTS kit_usage_limit_requests (
		session_id VARCHAR(255) NOT NULL, request_key VARCHAR(255) NOT NULL, member_id VARCHAR(128) NOT NULL,
		request_hash VARCHAR(128) NOT NULL, status VARCHAR(20) NOT NULL, event_ids LONGTEXT,
		previous_status TEXT, created_at VARCHAR(32) NOT NULL,
		PRIMARY KEY (session_id, request_key), INDEX idx_usage_limit_requests_member (member_id, status)
	)`,
	`CREATE TABLE IF NOT EXISTS kit_usage_limit_sessions (
		session_id VARCHAR(255) PRIMARY KEY, member_id VARCHAR(128) NOT NULL,
		input_tokens BIGINT, output_tokens BIGINT, active_seconds DOUBLE,
		admission_month VARCHAR(7), captured_at VARCHAR(32),
		INDEX idx_usage_limit_sessions_member (member_id)
	)`,
	`CREATE TABLE IF NOT EXISTS kit_usage_limit_templates (
		template_id VARCHAR(128) PRIMARY KEY, monthly_tokens BIGINT, monthly_active_seconds DOUBLE,
		updated_at VARCHAR(32) NOT NULL, updated_by TEXT NOT NULL, daily_tokens BIGINT, daily_active_seconds DOUBLE,
		FOREIGN KEY (template_id) REFERENCES kit_templates(template_id) ON DELETE CASCADE
	)`,
	`CREATE TABLE IF NOT EXISTS quota_override (
		subject_id VARCHAR(512) PRIMARY KEY, monthly_credits BIGINT NOT NULL, reason TEXT,
		updated_by TEXT NOT NULL, updated_at VARCHAR(32) NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS quota_pack (
		id VARCHAR(128) PRIMARY KEY, subject_id VARCHAR(512) NOT NULL, month VARCHAR(7) NOT NULL, credits BIGINT NOT NULL,
		reason TEXT, granted_by TEXT NOT NULL, created_at VARCHAR(32) NOT NULL,
		INDEX idx_quota_pack_subject (subject_id, month)
	)`,
	`CREATE TABLE IF NOT EXISTS quota_policy (
		id INT PRIMARY KEY CHECK (id = 1), monthly_credits BIGINT NOT NULL, updated_at VARCHAR(32), updated_by TEXT
	)`,
	`CREATE TABLE IF NOT EXISTS quota_request (
		id VARCHAR(128) PRIMARY KEY, subject_id VARCHAR(512) NOT NULL,
		requested_credits BIGINT NOT NULL, reason TEXT, status VARCHAR(20) NOT NULL DEFAULT 'pending',
		mode VARCHAR(20), granted_credits BIGINT, review_note TEXT, reviewed_by TEXT,
		created_at VARCHAR(32) NOT NULL, reviewed_at VARCHAR(32),
		INDEX idx_quota_request_subject (subject_id, created_at)
	)`,
	`CREATE TABLE IF NOT EXISTS usage_turns (
		id BIGINT PRIMARY KEY AUTO_INCREMENT, subject_id VARCHAR(512) NOT NULL, agent_slug VARCHAR(255) NOT NULL,
		session_id VARCHAR(255) NOT NULL, client_message_id VARCHAR(255), day VARCHAR(10) NOT NULL,
		month VARCHAR(7) NOT NULL, created_at VARCHAR(32) NOT NULL,
		UNIQUE INDEX idx_usage_turns_idempotency (session_id, client_message_id),
		INDEX idx_usage_turns_month_agent (month, agent_slug),
		INDEX idx_usage_turns_subject_month (subject_id, month)
	)`,
];
