import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { openDatabase } from "../src/store/db.ts";
import { program } from "../src/store/schema/generated/sqlite.ts";
import { createSqliteDatabase } from "../src/store/sqlite.ts";
import { sqliteHistory } from "../src/store/sqlite-history.ts";
import { createUsageLimitStore } from "../src/store/usage-limits.ts";

/** 用已登记版本的结构快照建立存量库，后续由实际启动入口继续迁移。 */
function openAtVersion(dataDir: string, version: string) {
	const upgrades = program.upgrades.map((migration) => migration.id);
	const through = upgrades.indexOf(version);
	if (through < 0) throw new Error(`缺少迁移快照 ${version}`);
	const db = new DatabaseSync(join(dataDir, "kit.sqlite"));
	db.exec("CREATE TABLE _kit_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
	db.exec(readFileSync(new URL(`../src/store/schema/versions/${version}.sql`, import.meta.url), "utf8"));
	const record = db.prepare("INSERT INTO _kit_migrations VALUES (?, ?)");
	for (const id of [...sqliteHistory.map((migration) => migration.id), ...upgrades.slice(0, through + 1)])
		record.run(id, "2026-11-01");
	return db;
}

/** 035 重建模版两表及全部子表外键父级：存量限额配置、模版本与上架关联必须原样保留。 */
it("035 重建模版表保留存量限额配置", () => {
	const dataDir = mkdtempSync(join(tmpdir(), "kit-limit-migration-"));
	let db = openAtVersion(dataDir, "034_catalog_template_soft_delete");
	try {
		db.exec(`
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

it("036 按会话存活窗口回填归属，仅将归属明确的月账与日账计入条目", () => {
	const dataDir = mkdtempSync(join(tmpdir(), "kit-entry-migration-"));
	let db = openAtVersion(dataDir, "035_soft_delete_identity_reuse");
	try {
		db.exec(`
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
  ('sess_solo', 'member_1', 'solo', '2026-11-03T10:00:00Z'),
  ('sess_orphan', 'member_1', 'ghost', '2026-11-03T10:00:00Z');
INSERT INTO kit_usage_limit_agent_months (agent_slug, month, tokens, active_seconds, tokens_unknown, active_seconds_unknown)
  VALUES ('assistant', '2026-11', 500, 60, 1, 0), ('ghost', '2026-11', 100, 10, 0, 0),
         ('solo', '2026-11', 25, 15, 0, 1);
INSERT INTO kit_usage_limit_agent_days (agent_slug, day, tokens, active_seconds)
  VALUES ('assistant', '2026-11-07', 300, 30), ('ghost', '2026-11-07', 50, 5), ('solo', '2026-11-08', 24, 14);
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
		expect(db.prepare("SELECT session_id, catalog_entry_id FROM kit_session_usage ORDER BY session_id").all()).toEqual([
			{ session_id: "sess_new", catalog_entry_id: "entry_new" },
			{ session_id: "sess_orphan", catalog_entry_id: null },
			{ session_id: "sess_solo", catalog_entry_id: "entry_solo" },
		]);
		expect(db.prepare("SELECT * FROM kit_usage_limit_agent_months").all()).toEqual([
			{
				catalog_entry_id: "entry_solo",
				month: "2026-11",
				tokens: 25,
				active_seconds: 15,
				tokens_unknown: 0,
				active_seconds_unknown: 1,
			},
		]);
		expect(db.prepare("SELECT * FROM kit_usage_limit_agent_days").all()).toEqual([
			{ catalog_entry_id: "entry_solo", day: "2026-11-08", tokens: 24, active_seconds: 14 },
		]);
		expect(db.prepare("SELECT * FROM kit_usage_limit_agent_days_legacy ORDER BY agent_slug").all()).toEqual([
			{ agent_slug: "assistant", day: "2026-11-07", tokens: 300, active_seconds: 30 },
			{ agent_slug: "ghost", day: "2026-11-07", tokens: 50, active_seconds: 5 },
			{ agent_slug: "solo", day: "2026-11-08", tokens: 24, active_seconds: 14 },
		]);
	} finally {
		if (db.isOpen) db.close();
		rmSync(dataDir, { recursive: true, force: true });
	}
});

it("从主干历史库升级时保留硬删条目的旧账，同 slug 新条目只从自己的用量开始", async () => {
	const dataDir = mkdtempSync(join(tmpdir(), "kit-reused-entry-migration-"));
	let db = openAtVersion(dataDir, "033_openagentkit_default_branding");
	try {
		db.exec(`
INSERT INTO catalog_agents (id, slug, display_name, remote_agent_id, created_at, updated_at)
  VALUES ('entry_old', 'reused', '旧助手', 'agent_old', '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z');
INSERT INTO kit_session_usage (session_id, member_id, agent_slug, created_at, deleted_at)
  VALUES ('sess_old', 'member_1', 'reused', '2026-11-02T00:00:00Z', '2026-11-03T00:00:00Z');
INSERT INTO kit_usage_limit_agent_months (agent_slug, month, tokens, active_seconds, tokens_unknown)
  VALUES ('reused', '2026-11', 500, 60, 1), ('older-day', '2026-11', 120, 25, 0), ('no-session', '2026-11', 45, 6, 0);
INSERT INTO kit_usage_limit_agent_days (agent_slug, day, tokens, active_seconds)
  VALUES ('reused', '2026-11-18', 500, 60), ('older-day', '2026-11-02', 120, 25), ('no-session', '2026-11-20', 45, 6);
INSERT INTO kit_usage_limit_months (member_id, month, tokens, active_seconds)
  VALUES ('member_1', '2026-11', 500, 60);
DELETE FROM catalog_agents WHERE id = 'entry_old';
INSERT INTO catalog_agents (id, slug, display_name, remote_agent_id, created_at, updated_at)
  VALUES ('entry_new', 'reused', '新助手', 'agent_new', '2026-11-18T00:00:00Z', '2026-11-18T00:00:00Z'),
         ('entry_later', 'older-day', '近期助手', 'agent_later', '2026-11-18T00:00:00Z', '2026-11-18T00:00:00Z'),
         ('entry_unverified', 'no-session', '无会话助手', 'agent_unverified', '2026-11-18T00:00:00Z', '2026-11-18T00:00:00Z');
INSERT INTO kit_sessions (session_id, subject_id, agent_slug, created_at) VALUES
  ('sess_new', 'member_1', 'reused', '2026-11-18T10:00:00Z'),
  ('sess_later', 'member_1', 'older-day', '2026-11-18T10:00:00Z');
`);
		db.close();
		db = openDatabase(dataDir);
		const limits = createUsageLimitStore(createSqliteDatabase(db));
		expect(await limits.agentTotals("entry_new", "2026-11")).toEqual({
			tokens: 0,
			active_seconds: 0,
			tokens_unknown: 0,
			active_seconds_unknown: 0,
		});
		expect(await limits.agentDayTotals("entry_new", "2026-11-18")).toEqual({ tokens: 0, active_seconds: 0 });
		expect(db.prepare("SELECT * FROM kit_usage_limit_agent_months").all()).toEqual([]);
		expect(db.prepare("SELECT * FROM kit_usage_limit_agent_days").all()).toEqual([]);
		expect(db.prepare("SELECT * FROM kit_usage_limit_agent_months_legacy ORDER BY agent_slug").all()).toMatchObject([
			{ agent_slug: "no-session", month: "2026-11", tokens: 45, active_seconds: 6, tokens_unknown: 0 },
			{ agent_slug: "older-day", month: "2026-11", tokens: 120, active_seconds: 25, tokens_unknown: 0 },
			{ agent_slug: "reused", month: "2026-11", tokens: 500, active_seconds: 60, tokens_unknown: 1 },
		]);
		expect(db.prepare("SELECT * FROM kit_usage_limit_agent_days_legacy ORDER BY agent_slug").all()).toEqual([
			{ agent_slug: "no-session", day: "2026-11-20", tokens: 45, active_seconds: 6 },
			{ agent_slug: "older-day", day: "2026-11-02", tokens: 120, active_seconds: 25 },
			{ agent_slug: "reused", day: "2026-11-18", tokens: 500, active_seconds: 60 },
		]);
		expect(await limits.totals("member_1", "2026-11")).toMatchObject({ tokens: 500, active_seconds: 60 });
		expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
	} finally {
		if (db.isOpen) db.close();
		rmSync(dataDir, { recursive: true, force: true });
	}
});
