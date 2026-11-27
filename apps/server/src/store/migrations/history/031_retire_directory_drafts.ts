import type { DatabaseSync } from "node:sqlite";

export function run(db: DatabaseSync) {
	db.exec(
		"CREATE TABLE kit_retired_directory_drafts (draft_id TEXT PRIMARY KEY, record_json TEXT NOT NULL, document_json TEXT, retired_at TEXT NOT NULL)",
	);
	const rows = db.prepare("SELECT * FROM kit_resource_drafts WHERE engine != 'yaml'").all();
	const archive = db.prepare("INSERT INTO kit_retired_directory_drafts VALUES (?,?,?,?)");
	for (const row of rows) {
		const document = db
			.prepare("SELECT * FROM kit_resource_draft_documents WHERE draft_id=?")
			.get(String(row.draft_id));
		archive.run(
			String(row.draft_id),
			JSON.stringify(row),
			document ? JSON.stringify(document) : null,
			new Date().toISOString(),
		);
		db.prepare("DELETE FROM kit_resource_drafts WHERE draft_id=?").run(String(row.draft_id));
	}
}
