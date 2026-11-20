import type { DatabaseSync } from "node:sqlite";
import { createStoreDatabase, type SqlValue, type StoreDatabase } from "./database.ts";

const adapters = new WeakMap<DatabaseSync, StoreDatabase>();
export function createSqliteDatabase(db: DatabaseSync) {
	const existing = adapters.get(db);
	if (existing) return existing;
	const executor = {
		async get(sql: string, ...values: SqlValue[]) {
			return db.prepare(sql).get(...values);
		},
		async all(sql: string, ...values: SqlValue[]) {
			return db.prepare(sql).all(...values);
		},
		async run(sql: string, ...values: SqlValue[]) {
			return { changes: Number(db.prepare(sql).run(...values).changes) };
		},
	};
	const database = createStoreDatabase("sqlite", {
		executor,
		async transaction(work) {
			db.exec("BEGIN IMMEDIATE");
			try {
				const result = await work(executor);
				db.exec("COMMIT");
				return result;
			} catch (error) {
				db.exec("ROLLBACK");
				throw error;
			}
		},
		async close() {
			db.close();
		},
	});
	adapters.set(db, database);
	return database;
}
