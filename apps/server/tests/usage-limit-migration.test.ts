import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { openDatabase } from "../src/store/db.ts";

/** 033 为止的真实形状：slug/名称仍内联 UNIQUE、已含 deleted_at 列；034 重建两表及全部子表。 */
it("034 重建模版表保留存量限额配置", () => {
	const dataDir = mkdtempSync(join(tmpdir(), "kit-limit-migration-"));
	let db = openDatabase(dataDir);
	try {
		db.exec(`
DELETE FROM _kit_migrations WHERE id = '034_soft_delete_identity_reuse';
DROP TABLE kit_usage_limit_templates;
DROP TABLE kit_template_listings;
DROP TABLE kit_template_versions;
DROP TABLE kit_templates;
DROP TABLE catalog_agents;
CREATE TABLE catalog_agents (
  id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
  description TEXT, icon TEXT, opening_remarks TEXT, suggested_prompts TEXT NOT NULL DEFAULT '[]',
  capabilities TEXT NOT NULL DEFAULT '{}', theme TEXT, remote_agent_id TEXT NOT NULL,
  remote_agent_version INTEGER, visibility TEXT NOT NULL DEFAULT 'public', ordering INTEGER NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'unlisted', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general', featured INTEGER NOT NULL DEFAULT 0,
  remote_environment_id TEXT, files_json TEXT NOT NULL DEFAULT '[]', memory_stores_json TEXT NOT NULL DEFAULT '[]',
  vault_ids_json TEXT NOT NULL DEFAULT '[]', agent_version INTEGER CHECK (agent_version > 0),
  listed_at TEXT, deleted_at TEXT
);
CREATE TABLE kit_templates (
  template_id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE,
  remote_agent_id TEXT NOT NULL, remote_agent_name TEXT NOT NULL,
  config_json TEXT NOT NULL, created_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0), updated_at TEXT NOT NULL DEFAULT '', deleted_at TEXT
);
CREATE TABLE kit_template_versions (
  template_id TEXT NOT NULL REFERENCES kit_templates(template_id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0), config_json TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (template_id, version)
);
CREATE TABLE kit_template_listings (
  template_id TEXT PRIMARY KEY REFERENCES kit_templates(template_id) ON DELETE CASCADE,
  catalog_id TEXT NOT NULL UNIQUE REFERENCES catalog_agents(id) ON DELETE CASCADE
);
CREATE TABLE kit_usage_limit_templates (
  template_id TEXT PRIMARY KEY REFERENCES kit_templates(template_id) ON DELETE CASCADE,
  monthly_tokens INTEGER, monthly_active_seconds REAL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL,
  daily_tokens INTEGER, daily_active_seconds REAL
);
INSERT INTO catalog_agents (id, slug, display_name, remote_agent_id, created_at, updated_at)
  VALUES ('entry_1', 'assistant', '员工助手', 'agent_remote', '2026-11-01', '2026-11-01');
INSERT INTO kit_templates (template_id, name, remote_agent_id, remote_agent_name, config_json, created_at, updated_at)
  VALUES ('tpl_1', '员工助手模版', 'agent_remote', '远端助手', '{}', '2026-11-01', '2026-11-01');
INSERT INTO kit_template_versions (template_id, version, config_json, created_at)
  VALUES ('tpl_1', 1, '{}', '2026-11-01');
INSERT INTO kit_template_listings (template_id, catalog_id) VALUES ('tpl_1', 'entry_1');
INSERT INTO kit_usage_limit_templates
  (template_id, monthly_tokens, monthly_active_seconds, updated_at, updated_by, daily_tokens, daily_active_seconds)
  VALUES ('tpl_1', 10000, 3600, '2026-11-01', 'admin', 1000, 600);
`);
		db.close();
		db = openDatabase(dataDir);
		expect(db.prepare("SELECT * FROM kit_usage_limit_templates").all()).toEqual([
			{
				template_id: "tpl_1",
				monthly_tokens: 10000,
				monthly_active_seconds: 3600,
				updated_at: "2026-11-01",
				updated_by: "admin",
				daily_tokens: 1000,
				daily_active_seconds: 600,
			},
		]);
		expect(db.prepare("SELECT template_id, name, version, deleted_at FROM kit_templates").get()).toMatchObject({
			template_id: "tpl_1",
			name: "员工助手模版",
		});
		expect(db.prepare("SELECT template_id, catalog_id FROM kit_template_listings").get()).toEqual({
			template_id: "tpl_1",
			catalog_id: "entry_1",
		});
	} finally {
		if (db.isOpen) db.close();
		rmSync(dataDir, { recursive: true, force: true });
	}
});

/** 035 之前的形状：kit_sessions/kit_session_usage 无 catalog_entry_id，条目账按 slug 记键。 */
it("035 按存活窗口回填会话归属、条目账改按条目 ID 记键", () => {
	const dataDir = mkdtempSync(join(tmpdir(), "kit-entry-migration-"));
	let db = openDatabase(dataDir);
	try {
		db.exec(`
DELETE FROM _kit_migrations WHERE id = '035_usage_entry_identity';
DROP INDEX idx_sessions_entry;
DROP INDEX idx_session_usage_entry;
ALTER TABLE kit_sessions DROP COLUMN catalog_entry_id;
ALTER TABLE kit_session_usage DROP COLUMN catalog_entry_id;
DROP TABLE kit_usage_limit_agent_months;
DROP TABLE kit_usage_limit_agent_days;
CREATE TABLE kit_usage_limit_agent_months (
  agent_slug TEXT NOT NULL, month TEXT NOT NULL, tokens INTEGER NOT NULL DEFAULT 0,
  active_seconds REAL NOT NULL DEFAULT 0, tokens_unknown INTEGER NOT NULL DEFAULT 0,
  active_seconds_unknown INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (agent_slug, month)
);
CREATE TABLE kit_usage_limit_agent_days (
  agent_slug TEXT NOT NULL, day TEXT NOT NULL, tokens INTEGER NOT NULL DEFAULT 0,
  active_seconds REAL NOT NULL DEFAULT 0, PRIMARY KEY (agent_slug, day)
);
INSERT INTO catalog_agents (id, slug, display_name, remote_agent_id, created_at, updated_at, deleted_at)
  VALUES ('entry_old', 'assistant', '旧助手', 'agent_remote', '2026-11-01T00:00:00Z', '2026-11-05T00:00:00Z', '2026-11-05T00:00:00Z'),
         ('entry_new', 'assistant', '新助手', 'agent_remote', '2026-11-06T00:00:00Z', '2026-11-06T00:00:00Z', NULL),
         ('entry_solo', 'solo', '独立助手', 'agent_remote', '2026-11-02T00:00:00Z', '2026-11-02T00:00:00Z', NULL);
INSERT INTO kit_sessions (session_id, subject_id, agent_slug, created_at) VALUES
  ('sess_old', 'member_1', 'assistant', '2026-11-03T10:00:00Z'),
  ('sess_new', 'member_1', 'assistant', '2026-11-07T10:00:00Z'),
  ('sess_solo', 'member_1', 'solo', '2026-11-03T10:00:00Z'),
  ('sess_pre_entry', 'member_1', 'assistant', '2026-10-30T10:00:00Z'),
  ('sess_orphan', 'member_1', 'ghost', '2026-11-03T10:00:00Z');
INSERT INTO kit_session_usage (session_id, member_id, agent_slug, created_at) VALUES
  ('sess_new', 'member_1', 'assistant', '2026-11-07T10:00:00Z'),
  ('sess_orphan', 'member_1', 'ghost', '2026-11-03T10:00:00Z');
INSERT INTO kit_usage_limit_agent_months (agent_slug, month, tokens, active_seconds, tokens_unknown, active_seconds_unknown)
  VALUES ('assistant', '2026-11', 500, 60, 1, 0), ('ghost', '2026-11', 100, 10, 0, 0);
INSERT INTO kit_usage_limit_agent_days (agent_slug, day, tokens, active_seconds)
  VALUES ('assistant', '2026-11-07', 300, 30), ('ghost', '2026-11-07', 50, 5);
`);
		db.close();
		db = openDatabase(dataDir);
		expect(db.prepare("SELECT session_id, catalog_entry_id FROM kit_sessions ORDER BY session_id").all()).toEqual([
			{ session_id: "sess_new", catalog_entry_id: "entry_new" },
			{ session_id: "sess_old", catalog_entry_id: "entry_old" },
			{ session_id: "sess_orphan", catalog_entry_id: null },
			{ session_id: "sess_pre_entry", catalog_entry_id: null },
			{ session_id: "sess_solo", catalog_entry_id: "entry_solo" },
		]);
		expect(db.prepare("SELECT session_id, catalog_entry_id FROM kit_session_usage").all()).toEqual([
			{ session_id: "sess_new", catalog_entry_id: "entry_new" },
			{ session_id: "sess_orphan", catalog_entry_id: null },
		]);
		// 账本行无时间戳，按「优先活动条目」解析；孤儿 slug 的行不可达，随重建丢弃。
		expect(db.prepare("SELECT * FROM kit_usage_limit_agent_months").all()).toEqual([
			{
				catalog_entry_id: "entry_new",
				month: "2026-11",
				tokens: 500,
				active_seconds: 60,
				tokens_unknown: 1,
				active_seconds_unknown: 0,
			},
		]);
		expect(db.prepare("SELECT * FROM kit_usage_limit_agent_days").all()).toEqual([
			{ catalog_entry_id: "entry_new", day: "2026-11-07", tokens: 300, active_seconds: 30 },
		]);
	} finally {
		if (db.isOpen) db.close();
		rmSync(dataDir, { recursive: true, force: true });
	}
});
