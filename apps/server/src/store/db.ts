import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { program } from "./schema/generated/sqlite.ts";
import { type Migration, type MigrationProgram, type Step, type Table, tableDifference } from "./schema/model.ts";
import { readSqliteTable } from "./schema/sqlite-model.ts";
import { sqliteHistory } from "./sqlite-history.ts";

// esbuild 会把静态 node:sqlite 改写为 sqlite（丢前缀），故用变量间接动态 import 绕过。
const SQLITE_SPEC = "node:sqlite";
const { DatabaseSync: DatabaseSyncCtor } = (await import(SQLITE_SPEC)) as typeof import("node:sqlite");

function applyVersion(db: DatabaseSync, id: string, apply: () => void, rebuild = false) {
	if (rebuild) db.exec("PRAGMA foreign_keys = OFF");
	try {
		db.exec("BEGIN IMMEDIATE");
		try {
			if (!db.prepare("SELECT 1 FROM _kit_migrations WHERE id = ?").get(id)) {
				apply();
				if (rebuild && db.prepare("PRAGMA foreign_key_check").get()) throw new Error("SQLite 重建后有外键冲突");
				db.prepare("INSERT INTO _kit_migrations (id, applied_at) VALUES (?, ?)").run(id, new Date().toISOString());
			}
			db.exec("COMMIT");
		} catch (error) {
			db.exec("ROLLBACK");
			throw error;
		}
	} finally {
		if (rebuild) db.exec("PRAGMA foreign_keys = ON");
	}
}

function sqliteTableDifference(db: DatabaseSync, name: string, expected: Table | null, other?: Table | null) {
	// 检查迁移前后声明的索引，允许存量库保留额外的非唯一索引。
	const indexes = new Set([expected, other].flatMap((table) => table?.indexes.map((index) => index.name) ?? []));
	return tableDifference(expected, readSqliteTable(db, name, indexes));
}

function applyStep(db: DatabaseSync, id: string, step: Step) {
	if ("data" in step) {
		for (const sql of step.data) db.exec(sql);
		return;
	}
	if (!("sql" in step)) throw new Error(`SQLite 迁移包含未识别的数据转换：${id}`);
	for (const { name, before, after } of step.changes) {
		const difference = sqliteTableDifference(db, name, before, after);
		if (difference) throw new Error(`SQLite 迁移 ${id}：${name} 的 ${difference} 与迁移前结构不符`);
	}
	db.exec(step.sql);
	for (const { name, before, after } of step.changes) {
		const difference = sqliteTableDifference(db, name, after, before);
		if (difference) throw new Error(`SQLite 迁移 ${id}：${name} 的 ${difference} 与迁移后结构不符`);
	}
}

function applyNewVersions(db: DatabaseSync, versions: Migration[], applied: Set<string>) {
	const known = new Set(versions.map((version) => version.id));
	for (const id of applied) {
		if (Number.parseInt(id, 10) >= 33 && !known.has(id)) throw new Error(`SQLite 迁移记录包含未知版本：${id}`);
	}
	const firstPending = versions.findIndex((version) => !applied.has(version.id));
	if (firstPending < 0) return;
	const pending = versions.slice(firstPending);
	if (pending.some((version) => applied.has(version.id))) {
		throw new Error(`SQLite 迁移记录不连续，缺少版本：${pending[0]!.id}`);
	}
	for (const migration of pending) {
		applyVersion(
			db,
			migration.id,
			() => {
				for (const step of migration.steps) applyStep(db, migration.id, step);
			},
			migration.sqliteRebuild,
		);
	}
}

export function migrateSqliteSchema(db: DatabaseSync, selected: MigrationProgram = program) {
	db.exec("CREATE TABLE IF NOT EXISTS _kit_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
	const applied = new Set(
		db
			.prepare("SELECT id FROM _kit_migrations")
			.all()
			.map((row) => String(row.id)),
	);
	for (const migration of sqliteHistory) {
		if (applied.has(migration.id)) continue;
		applyVersion(db, migration.id, () => {
			if (migration.run) migration.run(db);
			else db.exec(migration.sql!);
		});
	}
	applyNewVersions(db, selected.upgrades, applied);
	for (const expected of selected.current) {
		const difference = sqliteTableDifference(db, expected.name, expected);
		if (difference) throw new Error(`SQLite 当前数据库：${expected.name} 的 ${difference} 与预期结构不符`);
	}
}

export function openDatabase(dataDir: string): DatabaseSync {
	const db = new DatabaseSyncCtor(join(dataDir, "kit.sqlite"));
	try {
		db.exec("PRAGMA busy_timeout = 15000; PRAGMA journal_mode = WAL;");
		migrateSqliteSchema(db);
		return db;
	} catch (error) {
		db.close();
		throw error;
	}
}
