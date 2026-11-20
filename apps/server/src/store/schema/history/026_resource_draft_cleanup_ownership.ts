import type { DatabaseSync } from "node:sqlite";

export function run(db: DatabaseSync) {
	const columns = db.prepare("PRAGMA table_info(kit_resource_drafts)").all() as { name: string }[];
	if (columns.some((column) => column.name === "cleanup_key_hash")) return;
	db.exec("ALTER TABLE kit_resource_drafts ADD COLUMN cleanup_key_hash TEXT;");
}
