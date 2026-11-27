import type { DatabaseSync } from "node:sqlite";

export function run(db: DatabaseSync) {
	// 早期开发服务已应用过不含上传清单的 029；追加迁移，保留现有声明、state 和成功证明。
	const columns = db.prepare("PRAGMA table_info(kit_resource_draft_documents)").all() as { name: string }[];
	if (!columns.some((column) => column.name === "assets_json"))
		db.exec("ALTER TABLE kit_resource_draft_documents ADD COLUMN assets_json TEXT NOT NULL DEFAULT '[]'");
}
