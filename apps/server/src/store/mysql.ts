import { createHash } from "node:crypto";
import { createPool, type ExecuteValues, type PoolConnection, type QueryOptions } from "mysql2";
import type { DataSource } from "typeorm";
import type { DatabaseConfig } from "../config.ts";
import { createStoreDatabase } from "./connection.ts";
import type { SqlValue } from "./database.ts";
import { MigrationError } from "./external-execution.ts";
import { initializeExternal } from "./external-schema.ts";
import { createEntityDataSource } from "./typeorm.ts";

function errorCode(error: unknown) {
	if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
	return typeof error.code === "string" && /^[A-Z0-9_]+$/.test(error.code) ? error.code : undefined;
}

// 驱动错误可能含连接账户、SQL 或业务字段。向调用方只返回稳定的错误码。
async function mysqlCall<T>(work: () => Promise<T>): Promise<T> {
	try {
		return await work();
	} catch (error) {
		if (error instanceof MigrationError) throw error;
		const code = errorCode(error);
		throw Object.assign(new Error(code ? `MySQL 操作失败（${code}）` : "MySQL 操作失败"), { code });
	}
}

async function initialize(source: DataSource, name: string) {
	const lock = `kit-schema:${createHash("sha256").update(name).digest("hex").slice(0, 48)}`;
	const runner = source.createQueryRunner();
	const client: ReturnType<typeof entityConnection> = await runner.connect();
	try {
		const rows: { acquired: number }[] = await runner.query("SELECT GET_LOCK(?, 15) AS acquired", [lock]);
		if (rows[0]?.acquired !== 1) throw Object.assign(new Error(), { code: "KIT_MYSQL_SCHEMA_LOCK" });
		try {
			await initializeExternal(
				{
					rows<T>(sql: string, ...values: SqlValue[]): Promise<T[]> {
						return runner.query(sql, values);
					},
					async execute(sql, ...values) {
						await runner.query(sql, values);
					},
				},
				"mysql",
				source,
				async (work) => {
					await runner.startTransaction();
					try {
						await work();
						await runner.commitTransaction();
					} catch (error) {
						await runner.rollbackTransaction().catch(() => client.destroy());
						throw error;
					}
				},
			);
		} finally {
			await runner.query("SELECT RELEASE_LOCK(?)", [lock]).catch(() => client.destroy());
		}
	} finally {
		await runner.release();
	}
}

// TypeORM 的 MySQL QueryRunner 使用 mysql2.query() 的文本协议。带参数的普通查询和流式查询
// 都改用 execute() 的服务端绑定，保留连接的 sql_mode 及事务控制语句的原有行为。
function entityConnection(connection: PoolConnection) {
	const client = connection.promise();
	return {
		promise: () => ({
			query(sql: string | QueryOptions, parameters?: ExecuteValues[]) {
				const options = typeof sql === "string" ? { sql } : sql;
				return parameters?.length ? client.execute(options, parameters) : client.query(options);
			},
		}),
		query(sql: string, parameters?: ExecuteValues[]) {
			return parameters?.length ? connection.execute(sql, parameters) : connection.query(sql);
		},
		listeners: connection.listeners.bind(connection),
		on: connection.on.bind(connection),
		release: () => connection.release(),
		destroy: () => connection.destroy(),
	};
}

export async function connectMysql(config: Extract<DatabaseConfig, { driver: "mysql" }>) {
	const verifiedTls = { rejectUnauthorized: true, verifyIdentity: true };
	const driverPool = createPool({
		host: config.host,
		port: config.port,
		user: config.user,
		password: config.password,
		database: config.name,
		ssl: config.ssl ? verifiedTls : undefined,
		charset: "utf8mb4",
		decimalNumbers: true,
		supportBigNumbers: true,
		flags: ["FOUND_ROWS"],
	});
	const pool = driverPool.promise();
	// 迁移与 TypeORM 的实体管理器复用同一个 mysql2 连接池。
	const source = createEntityDataSource({
		type: "mysql",
		database: config.name,
		driver: {
			createPool: () => ({
				end: driverPool.end.bind(driverPool),
				getConnection(done: (error: Error | null, connection?: ReturnType<typeof entityConnection>) => void) {
					driverPool.getConnection((error, connection) => {
						if (error) done(error);
						else done(null, entityConnection(connection));
					});
				},
			}),
		},
	});
	try {
		await mysqlCall(() => source.initialize());
		await mysqlCall(() => initialize(source, config.name));
	} catch (error) {
		if (source.isInitialized) await source.destroy().catch(() => undefined);
		else await pool.end().catch(() => undefined);
		throw error;
	}
	return createStoreDatabase("mysql", {
		entitySource: () => source,
		discardConnection: (connection: ReturnType<typeof entityConnection>) => connection.destroy(),
		close: () => mysqlCall(() => source.destroy()),
	});
}
