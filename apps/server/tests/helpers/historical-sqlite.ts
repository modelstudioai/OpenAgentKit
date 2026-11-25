import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { sqliteHistory } from "../../src/store/sqlite-history.ts";

/** 用实际历史建立测试库，避免较新的版本号与较旧的表混用。 */
export function historicalSqlite(dataDir: string, through: string) {
	const db = new DatabaseSync(join(dataDir, "kit.sqlite"));
	try {
		db.exec("CREATE TABLE _kit_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
		const record = db.prepare("INSERT INTO _kit_migrations VALUES (?, ?)");
		const last = sqliteHistory.findIndex((entry) => entry.id === through);
		if (last < 0) throw new Error("未知 SQLite 测试版本");
		for (const migration of sqliteHistory.slice(0, last + 1)) {
			if (migration.run) migration.run(db);
			else db.exec(migration.sql!);
			record.run(migration.id, "2026-10-20");
		}
		return db;
	} catch (error) {
		db.close();
		throw error;
	}
}
