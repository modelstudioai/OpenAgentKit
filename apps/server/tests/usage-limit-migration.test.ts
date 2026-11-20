import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { openDatabase } from "../src/store/db.ts";
import { program } from "../src/store/schema/generated/sqlite.ts";
import { sqliteHistory } from "../src/store/sqlite-history.ts";

const snapshot034 = readFileSync(
	new URL("../src/store/schema/versions/034_catalog_template_soft_delete.sql", import.meta.url),
	"utf8",
);

/** 034 为止的真实形状（已含 deleted_at，slug/名称仍内联 UNIQUE）：以版本快照建库并登记已应用迁移。
 * 版本链要求迁移记录连续，035/036 必须整段重放，不能单独删除其一。 */
function baseAt034(dataDir: string) {
	const db = new DatabaseSync(join(dataDir, "kit.sqlite"));
	db.exec("CREATE TABLE _kit_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
	db.exec(snapshot034);
	const upgrades = program.upgrades.map((migration) => migration.id);
	const through = upgrades.indexOf("034_catalog_template_soft_delete");
	if (through < 0) throw new Error("缺少 034 版本快照迁移");
	const record = db.prepare("INSERT INTO _kit_migrations VALUES (?, ?)");
	for (const id of [...sqliteHistory.map((migration) => migration.id), ...upgrades.slice(0, through + 1)])
		record.run(id, "2026-11-01");
	return db;
}

/** 035 重建模版两表及全部子表外键父级：存量限额配置、模版本与上架关联必须原样保留。 */
it("035 重建模版表保留存量限额配置", () => {
	const dataDir = mkdtempSync(join(tmpdir(), "kit-limit-migration-"));
	let db = baseAt034(dataDir);
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

/** 036 之前的形状：kit_sessions/kit_session_usage 无 catalog_entry_id，条目账按 slug 记键。 */
it("036 按存活窗口回填会话归属、条目账改按条目 ID 记键", () => {
	const dataDir = mkdtempSync(join(tmpdir(), "kit-entry-migration-"));
	let db = openDatabase(dataDir);
	try {
		// 036 是链尾迁移，可单独删除重放；catalog_agents 保持部分唯一索引形状，slug 可复用。
		db.exec(`
DELETE FROM _kit_migrations WHERE id = '036_usage_entry_identity';
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
