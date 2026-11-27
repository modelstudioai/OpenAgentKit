import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { initialRows, migrationIds } from "./baseline.ts";
import { currentTables, entityTableSteps } from "./entity-tables.ts";
import type { MigrationProgram, Schema } from "./metadata/model.ts";
import { sqliteTableDifference } from "./metadata/sqlite-model.ts";
import { createSqliteDatabase } from "./sqlite.ts";

// esbuild 会把静态 node:sqlite 改写为 sqlite（丢前缀），故用变量间接动态 import 绕过。
const SQLITE_SPEC = "node:sqlite";
const { DatabaseSync: DatabaseSyncCtor } = (await import(SQLITE_SPEC)) as typeof import("node:sqlite");

function validate(db: DatabaseSync, schema: Schema) {
	for (const expected of schema) {
		const difference = sqliteTableDifference(db, expected.name, expected);
		if (difference) throw new Error(`SQLite 当前数据库：${expected.name} 的 ${difference} 与预期结构不符`);
	}
}

/** 所有首次启动进程在同一原生连接上持写锁复查空库，提交前核对实际建表结果。 */
async function initializeEmpty(db: DatabaseSync) {
	const store = createSqliteDatabase(db);
	await store.initializeEntities();
	const source = store.source;
	const runner = source.createQueryRunner();
	try {
		await runner.startTransaction();
		db.exec("CREATE TABLE IF NOT EXISTS _kit_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
		const fresh = !db.prepare("SELECT 1 FROM _kit_migrations LIMIT 1").get();
		if (fresh) {
			const existing = db
				.prepare(
					"SELECT 1 FROM sqlite_schema WHERE type IN ('table', 'view') AND name NOT GLOB 'sqlite_*' AND name <> '_kit_migrations' LIMIT 1",
				)
				.get();
			if (existing) throw new Error("目标库已有表但缺少 Kit 迁移记录，请核对数据库配置");
			for (const step of entityTableSteps(source, "sqlite")) await runner.query(step.sql);
			validate(db, currentTables(source, "sqlite"));
			for (const sql of initialRows) db.exec(sql);
			const insert = db.prepare("INSERT INTO _kit_migrations (id, applied_at) VALUES (?, ?)");
			const now = new Date().toISOString();
			for (const id of migrationIds) insert.run(id, now);
		}
		await runner.commitTransaction();
		return fresh;
	} catch (error) {
		if (runner.isTransactionActive) await runner.rollbackTransaction();
		throw error;
	} finally {
		await runner.release();
	}
}

export async function migrateSqliteSchema(db: DatabaseSync, selected?: MigrationProgram) {
	const hasRegistry = db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = '_kit_migrations'").get();
	if ((!hasRegistry || !db.prepare("SELECT 1 FROM _kit_migrations LIMIT 1").get()) && (await initializeEmpty(db)))
		return;

	const applied = new Set(
		db
			.prepare("SELECT id FROM _kit_migrations")
			.all()
			.map((row) => String(row.id)),
	);
	const known = new Set([...migrationIds, ...(selected?.upgrades.map(({ id }) => id) ?? [])]);
	for (const id of applied) {
		if (!known.has(id)) throw new Error(`SQLite 迁移记录包含未知版本：${id}`);
	}
	if ([...known].some((id) => !applied.has(id))) {
		const { upgradeSqlite } = await import("./schema/sqlite-upgrade.ts");
		upgradeSqlite(db, applied, selected?.upgrades);
	}
	validate(db, selected?.current ?? currentTables(createSqliteDatabase(db).source, "sqlite"));
}

// node:sqlite 的 busy_timeout 会阻塞事件循环。同进程打开同一文件时先排队，再取得数据库写锁。
const openings = new Map<string, Promise<void>>();

export async function openDatabase(dataDir: string): Promise<DatabaseSync> {
	const db = new DatabaseSyncCtor(join(dataDir, "kit.sqlite"));
	try {
		const file = db.location()!;
		const ready = (openings.get(file) ?? Promise.resolve()).then(() => {
			db.exec("PRAGMA busy_timeout = 15000; PRAGMA journal_mode = WAL;");
			return migrateSqliteSchema(db);
		});
		const finished = ready.catch(() => {});
		openings.set(file, finished);
		try {
			await ready;
		} finally {
			if (openings.get(file) === finished) openings.delete(file);
		}
		return db;
	} catch (error) {
		db.close();
		throw error;
	}
}
