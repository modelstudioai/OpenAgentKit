import type { DatabaseSync } from "node:sqlite";
import type { DatabaseConfig, ServerConfig } from "../config.ts";
import type { SqlValue, StoreDatabase } from "./database.ts";
import { createSqliteDatabase } from "./sqlite.ts";

type StartupConfig = Pick<ServerConfig, "database" | "dataDir" | "quotaDefaultMonthly">;
export type DatabaseConnection = StoreDatabase | DatabaseSync;

function startupStatements(dialect: StoreDatabase["dialect"], defaultMonthly?: number): [string, ...SqlValue[]][] {
	const now = new Date().toISOString();
	const statements: [string, ...SqlValue[]][] = [
		[
			`UPDATE kit_operations SET
				status = 'failed', phase = 'interrupted', error = ?, updated_at = ?,
				error_details_json = CASE WHEN kind = 'resourceDraft.publish' THEN ? ELSE error_details_json END
				WHERE status IN ('pending', 'running')`,
			"服务已重启，操作结果待核对；请检查远端状态后重新计划，不会自动重试",
			now,
			JSON.stringify({
				code: "publication.interrupted",
				phase: "interrupted",
				retryable: false,
				mutation_started: true,
			}),
		],
		[
			"UPDATE kit_resource_drafts SET status = 'failed', phase = 'uncertain', updated_at = ? WHERE status = 'publishing'",
			now,
		],
	];
	if (defaultMonthly != null) {
		const insertPolicy = "INSERT INTO quota_policy (id, monthly_credits) VALUES (1, 200)";
		statements.push(
			[
				dialect === "mysql"
					? `${insertPolicy} ON DUPLICATE KEY UPDATE id = id`
					: `${insertPolicy} ON CONFLICT(id) DO NOTHING`,
			],
			[
				`UPDATE quota_policy SET monthly_credits = ?, updated_at = ?, updated_by = 'config'
					WHERE id = 1 AND updated_at IS NULL AND monthly_credits <> ?`,
				defaultMonthly,
				now,
				defaultMonthly,
			],
		);
	}
	return statements;
}

/** 装配时复用已初始化的后端，也接收调用方直接打开的 SQLite 连接。 */
export function prepareDatabase(db: DatabaseConnection, defaultMonthly?: number): StoreDatabase {
	if (!("prepare" in db)) return db;
	db.exec("BEGIN IMMEDIATE");
	try {
		for (const [sql, ...values] of startupStatements("sqlite", defaultMonthly)) db.prepare(sql).run(...values);
		db.exec("COMMIT");
	} catch (error) {
		db.exec("ROLLBACK");
		throw error;
	}
	return createSqliteDatabase(db);
}

async function connectExternalDatabase(config: Exclude<DatabaseConfig, { driver: "sqlite" }>) {
	if (config.driver === "postgres") {
		const { connectPostgres } = await import("./postgres.ts");
		return connectPostgres(config);
	}
	const { connectMysql } = await import("./mysql.ts");
	return connectMysql(config);
}

export async function connectDatabase(config: StartupConfig): Promise<StoreDatabase> {
	if (config.database.driver === "sqlite") {
		const { openDatabase } = await import("./db.ts");
		const db = openDatabase(config.dataDir);
		try {
			return prepareDatabase(db, config.quotaDefaultMonthly);
		} catch (error) {
			db.close();
			throw error;
		}
	}
	const db = await connectExternalDatabase(config.database);
	try {
		await db.transaction(async () => {
			for (const [sql, ...values] of startupStatements(db.dialect, config.quotaDefaultMonthly)) {
				await db.run(sql, ...values);
			}
		});
		return db;
	} catch (error) {
		await db.close().catch(() => undefined);
		throw error;
	}
}
