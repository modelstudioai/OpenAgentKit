import type { DatabaseSync } from "node:sqlite";
import type { DataSource } from "typeorm";
import type { BetterSqlite3Driver } from "typeorm/driver/better-sqlite3/BetterSqlite3Driver.js";
import { createStoreDatabase } from "./connection.ts";
import type { SqlValue, StoreDatabase } from "./database.ts";
import { createEntityDataSource } from "./typeorm.ts";

const adapters = new WeakMap<
	DatabaseSync,
	StoreDatabase & { source: DataSource; initializeEntities(): Promise<void> }
>();

function sqliteEntitySource(db: DatabaseSync) {
	// 建表和业务读写共用同一个 DataSource 与 node:sqlite 连接。
	return createEntityDataSource({
		type: "better-sqlite3",
		database: db.location() ?? ":memory:",
		driver: class {
			pragma(options: string) {
				return db.prepare(`PRAGMA ${options}`).all();
			}

			prepare(sql: string) {
				const statement = db.prepare(sql === "BEGIN TRANSACTION" ? "BEGIN IMMEDIATE" : sql);
				return {
					reader: statement.columns().length > 0,
					all: (...values: SqlValue[]) => statement.all(...values),
					run: (...values: SqlValue[]) => statement.run(...values),
				};
			}

			close() {
				if (db.isOpen) db.close();
			}
		},
	});
}

export function createSqliteDatabase(db: DatabaseSync) {
	const existing = adapters.get(db);
	if (existing) return existing;
	const source = sqliteEntitySource(db);
	let initializing: ReturnType<typeof source.initialize> | undefined;
	const entitySource = () => (initializing ??= source.initialize());
	const store = createStoreDatabase("sqlite", {
		entitySource,
		discardConnection() {
			if (db.isTransaction) db.exec("ROLLBACK");
			// SQLite 共用一个原生连接。回滚失败时移除驱动缓存的 runner，清除其事务标记。
			(source.driver as BetterSqlite3Driver).queryRunner = undefined;
		},
		async close() {
			if (source.isInitialized) await source.destroy();
			else if (db.isOpen) db.close();
		},
	});
	const database = {
		...store,
		source,
		async initializeEntities() {
			await entitySource();
		},
	};
	adapters.set(db, database);
	return database;
}
