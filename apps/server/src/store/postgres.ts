import { Pool, type PoolClient, types } from "pg";
import type { DataSource } from "typeorm";
import type { DatabaseConfig } from "../config.ts";
import { createStoreDatabase } from "./connection.ts";
import type { SqlValue } from "./database.ts";
import { MigrationError } from "./external-execution.ts";
import { initializeExternal } from "./external-schema.ts";
import { createEntityDataSource } from "./typeorm.ts";

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

async function initialize(source: DataSource) {
	const runner = source.createQueryRunner();
	const client: PoolClient = await runner.connect();
	try {
		await runner.startTransaction();
		await runner.query("SET LOCAL lock_timeout = '15s'");
		await runner.query("SELECT pg_advisory_xact_lock(hashtext('openagentpack.kit.schema')::bigint)");
		await initializeExternal(
			{
				rows<T>(sql: string, ...values: SqlValue[]): Promise<T[]> {
					return runner.query(values.length ? bindParameters(sql) : sql, values);
				},
				async execute(sql, ...values) {
					await runner.query(values.length ? bindParameters(sql) : sql, values);
				},
			},
			"postgres",
			source,
		);
		await runner.commitTransaction();
	} catch (error) {
		if (runner.isTransactionActive)
			await runner.rollbackTransaction().catch(() => client.emit("error", new Error("数据库迁移回滚失败")));
		throw error;
	} finally {
		await runner.release();
	}
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
	const source = createEntityDataSource({
		type: "postgres",
		database: config.name,
		driver: {
			Pool: function ExistingPool() {
				return pool;
			},
		},
		installExtensions: false,
		// 原生池已安装脱敏错误处理器。
		poolErrorHandler: () => undefined,
	});
	try {
		await postgresCall(() => source.initialize());
		await postgresCall(() => initialize(source));
	} catch (error) {
		if (source.isInitialized) await source.destroy().catch(() => undefined);
		else await pool.end().catch(() => undefined);
		throw error;
	}
	return createStoreDatabase("postgres", {
		entitySource: () => source,
		discardConnection(client: PoolClient) {
			// 借出期间 TypeORM 监听 pg 的 error 事件，使用 release(error) 淘汰连接。
			client.emit("error", new Error("数据库事务回滚失败"));
		},
		close: () => postgresCall(() => source.destroy()),
	});
}
