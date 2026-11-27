import type { DatabaseSync } from "node:sqlite";

// 与 feat 线的 019-022（模版限额与逐日账）撞号：合并后统一重排为 023-026，
// 并加幂等守卫——已按旧 id 应用过这些迁移的 main 线存量库不会重复执行。
export function run(db: DatabaseSync) {
	const columns = db.prepare("PRAGMA table_info(catalog_agents)").all() as { name: string }[];
	if (columns.some((column) => column.name === "agent_version")) return;
	db.exec("ALTER TABLE catalog_agents ADD COLUMN agent_version INTEGER CHECK (agent_version > 0);");
}
