import { createHash } from "node:crypto";
import { createPool, type ExecuteValues, type PoolConnection, type QueryOptions } from "mysql2";
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { DatabaseConfig } from "../config.ts";
import { createStoreDatabase } from "./connection.ts";
import type { SqlValue } from "./database.ts";
import { program } from "./schema/generated/mysql.ts";
import { MigrationError, migrateMysqlSchema } from "./schema/runner.ts";
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

async function migrate(pool: Pool, name: string) {
	const lock = `kit-schema:${createHash("sha256").update(name).digest("hex").slice(0, 48)}`;
	await mysqlCall(async () => {
		const connection = await pool.getConnection();
		try {
			const [rows] = await connection.execute<RowDataPacket[]>("SELECT GET_LOCK(?, 15) AS acquired", [lock]);
			if (rows[0]?.acquired !== 1) throw Object.assign(new Error(), { code: "KIT_MYSQL_SCHEMA_LOCK" });
			try {
				await migrateMysqlSchema(
					{
						async rows<T>(sql: string, ...values: SqlValue[]) {
							const [rows] = await connection.execute<RowDataPacket[]>(sql, values);
							return rows as T[];
						},
						async execute(sql, ...values) {
							if (values.length) await connection.execute(sql, values);
							else await connection.query(sql);
						},
					},
					program,
					async (work) => {
						await connection.beginTransaction();
						try {
							await work();
							await connection.commit();
						} catch (error) {
							await connection.rollback().catch(() => connection.destroy());
							throw error;
						}
					},
				);
			} finally {
				await connection.execute("SELECT RELEASE_LOCK(?)", [lock]).catch(() => connection.destroy());
			}
		} finally {
			connection.release();
		}
	});
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
	const source = createEntityDataSource(program.current, {
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
		await migrate(pool, config.name);
		await mysqlCall(() => source.initialize());
	} catch (error) {
		await pool.end().catch(() => undefined);
		throw error;
	}
	return createStoreDatabase("mysql", {
		entitySource: () => source,
		discardConnection: (connection: ReturnType<typeof entityConnection>) => connection.destroy(),
		close: () => mysqlCall(() => source.destroy()),
	});
}
