import { createHash } from "node:crypto";
import { createPool, type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import type { DatabaseConfig } from "../config.ts";
import { createStoreDatabase, type SqlValue } from "./database.ts";
import { program } from "./schema/generated/mysql.ts";
import { MigrationError, migrateMysqlSchema } from "./schema/runner.ts";

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

function executor(connection: Pool | PoolConnection) {
	function valuesFor(values: SqlValue[]) {
		return values.map((value) => (value instanceof Uint8Array ? Buffer.from(value) : value));
	}
	function all(sql: string, ...values: SqlValue[]) {
		return mysqlCall(async () => {
			const [rows] = await connection.execute<RowDataPacket[]>(sql, valuesFor(values));
			return rows;
		});
	}
	return {
		all,
		async get(sql: string, ...values: SqlValue[]) {
			return (await all(sql, ...values))[0];
		},
		run(sql: string, ...values: SqlValue[]) {
			return mysqlCall(async () => {
				const [result] = await connection.execute<ResultSetHeader>(sql, valuesFor(values));
				return { changes: result.affectedRows };
			});
		},
	};
}

async function migrate(pool: Pool, name: string) {
	const lock = `kit-schema:${createHash("sha256").update(name).digest("hex").slice(0, 48)}`;
	await mysqlCall(async () => {
		const connection = await pool.getConnection();
		try {
			const [rows] = await connection.query<RowDataPacket[]>("SELECT GET_LOCK(?, 15) AS acquired", [lock]);
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
				await connection.query("SELECT RELEASE_LOCK(?)", [lock]).catch(() => connection.destroy());
			}
		} finally {
			connection.release();
		}
	});
}

export async function connectMysql(config: Extract<DatabaseConfig, { driver: "mysql" }>) {
	const verifiedTls = { rejectUnauthorized: true, verifyIdentity: true };
	const pool = createPool({
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
	try {
		await migrate(pool, config.name);
	} catch (error) {
		await pool.end().catch(() => undefined);
		throw error;
	}
	return createStoreDatabase("mysql", {
		executor: executor(pool),
		async transaction(work) {
			const connection = await mysqlCall(() => pool.getConnection());
			try {
				await mysqlCall(() => connection.beginTransaction());
				const result = await work(executor(connection));
				await mysqlCall(() => connection.commit());
				return result;
			} catch (error) {
				await connection.rollback().catch(() => connection.destroy());
				throw error;
			} finally {
				connection.release();
			}
		},
		isDuplicateKey: (error) => errorCode(error) === "ER_DUP_ENTRY",
		close: () => mysqlCall(() => pool.end()),
	});
}
