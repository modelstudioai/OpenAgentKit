import type { DatabaseSync } from "node:sqlite";

// 限额体系增加「日」周期：三张配置表补 daily_* 列（历史行视为不限量），
// 条目日账与成员逐日账（020）同构，observe 双写，供日限额准入与面板展示。
export function run(db: DatabaseSync) {
	const addColumn = (table: string, column: string, type: string) => {
		const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
		if (!columns.some((entry) => entry.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type};`);
	};
	for (const table of ["kit_usage_limit_policy", "kit_usage_limit_overrides", "kit_usage_limit_templates"]) {
		addColumn(table, "daily_tokens", "INTEGER");
		addColumn(table, "daily_active_seconds", "REAL");
	}
	db.exec(`CREATE TABLE IF NOT EXISTS kit_usage_limit_agent_days (
  agent_slug TEXT NOT NULL, day TEXT NOT NULL, tokens INTEGER NOT NULL DEFAULT 0,
  active_seconds REAL NOT NULL DEFAULT 0, PRIMARY KEY (agent_slug, day)
);`);
}
