import { Pool, type PoolClient, types } from "pg";
import type { DatabaseConfig } from "../config.ts";
import { createStoreDatabase, type SqlValue } from "./database.ts";
import { program } from "./schema/generated/postgres.ts";
import { MigrationError, migratePostgresSchema } from "./schema/runner.ts";

// Store 的 ? 由驱动绑定。保留字符串、引用标识符和注释中的问号。
function bindParameters(sql: string) {
	let index = 0;
	return sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|\?/g, (token) =>
		token === "?" ? `$${++index}` : token,
	);
}

function parseInteger(value: string) {
	const number = Number(value);
	if (!Number.isSafeInteger(number)) throw new RangeError("数据库整数超出 JavaScript 安全范围");
	return number;
}

async function postgresCall<T>(work: () => Promise<T>): Promise<T> {
	try {
		return await work();
	} catch (error) {
		if (error instanceof MigrationError) throw error;
		// 驱动错误可能包含账户、SQL 和约束冲突的业务字段，只保留稳定的错误码。
		const rawCode = error && typeof error === "object" && "code" in error ? error.code : undefined;
		const code = typeof rawCode === "string" && /^[A-Z0-9_]+$/.test(rawCode) ? rawCode : undefined;
		throw Object.assign(new Error(code ? `PostgreSQL 操作失败（${code}）` : "PostgreSQL 操作失败"), { code });
	}
}

function executor(connection: Pool | PoolClient) {
	function query(sql: string, values: SqlValue[]) {
		return postgresCall(() => connection.query(bindParameters(sql), values));
	}
	return {
		async all(sql: string, ...values: SqlValue[]) {
			return (await query(sql, values)).rows;
		},
		async get(sql: string, ...values: SqlValue[]) {
			return (await query(sql, values)).rows[0];
		},
		async run(sql: string, ...values: SqlValue[]) {
			return { changes: (await query(sql, values)).rowCount ?? 0 };
		},
	};
}

async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
	const client = await postgresCall(() => pool.connect());
	let discard = false;
	try {
		await postgresCall(() => client.query("BEGIN"));
		const result = await work(client);
		await postgresCall(() => client.query("COMMIT"));
		return result;
	} catch (error) {
		try {
			await client.query("ROLLBACK");
		} catch {
			discard = true;
		}
		throw error;
	} finally {
		client.release(discard);
	}
}

async function migrate(client: PoolClient) {
	await client.query("SET LOCAL lock_timeout = '15s'");
	await client.query("SELECT pg_advisory_xact_lock(hashtext('openagentpack.kit.schema')::bigint)");
	await migratePostgresSchema(
		{
			async rows<T>(sql: string, ...values: SqlValue[]) {
				return (await client.query(bindParameters(sql), values)).rows as T[];
			},
			async execute(sql, ...values) {
				await client.query(bindParameters(sql), values.length ? values : undefined);
			},
		},
		program,
	);
}

export async function connectPostgres(config: Extract<DatabaseConfig, { driver: "postgres" }>) {
	const pool = new Pool({
		host: config.host,
		port: config.port,
		user: config.user,
		password: () => config.password,
		database: config.name,
		ssl: config.ssl ? { rejectUnauthorized: true } : false,
		types: {
			getTypeParser(oid, format) {
				// BIGINT、COUNT 和 SUM(BIGINT) 的 Store 合同均使用安全整数。
				if (format !== "binary" && (oid === types.builtins.INT8 || oid === types.builtins.NUMERIC)) return parseInteger;
				return types.getTypeParser(oid, format);
			},
		},
	});
	pool.on("error", () => console.warn("[kit-server] PostgreSQL 空闲连接已断开"));
	try {
		await transaction(pool, (client) => postgresCall(() => migrate(client)));
	} catch (error) {
		await pool.end().catch(() => undefined);
		throw error;
	}
	return createStoreDatabase("postgres", {
		executor: executor(pool),
		transaction: (work) => transaction(pool, (client) => work(executor(client))),
		close: () => postgresCall(() => pool.end()),
	});
}
