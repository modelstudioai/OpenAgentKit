import { AsyncLocalStorage } from "node:async_hooks";

export type SqlValue = string | number | bigint | Uint8Array | null;

interface SqlExecutor {
	get(sql: string, ...values: SqlValue[]): Promise<unknown>;
	all(sql: string, ...values: SqlValue[]): Promise<unknown[]>;
	run(sql: string, ...values: SqlValue[]): Promise<{ changes: number }>;
}

export interface StoreDatabase extends SqlExecutor {
	readonly dialect: "sqlite" | "mysql" | "postgres";
	transaction<T>(work: () => Promise<T>): Promise<T>;
	insertIfAbsent(sql: string, conflictColumns: string, ...values: SqlValue[]): Promise<{ changes: number }>;
	upsert(sql: string, conflictColumns: string, update: string, ...values: SqlValue[]): Promise<{ changes: number }>;
	close(): Promise<void>;
}

interface DatabaseAdapter {
	executor: SqlExecutor;
	transaction<T>(work: (executor: SqlExecutor) => Promise<T>): Promise<T>;
	isDuplicateKey?(error: unknown): boolean;
	close(): Promise<void>;
}

export function createStoreDatabase(dialect: StoreDatabase["dialect"], adapter: DatabaseAdapter): StoreDatabase {
	const scope = new AsyncLocalStorage<SqlExecutor>();
	let pending = Promise.resolve();

	function serialize<T>(work: () => Promise<T>): Promise<T> {
		const result = pending.then(work);
		pending = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	}

	function read<T>(work: (executor: SqlExecutor) => Promise<T>): Promise<T> {
		const executor = scope.getStore();
		if (executor) return work(executor);
		// SQLite 读写共用连接，事务期间普通查询也必须排队。连接池可用其他连接读取已提交的数据。
		return dialect === "sqlite" ? serialize(() => work(adapter.executor)) : work(adapter.executor);
	}

	function run(sql: string, ...values: SqlValue[]) {
		const executor = scope.getStore();
		// 所有后端均沿用 Kit 单实例下的写入顺序。
		return executor ? executor.run(sql, ...values) : serialize(() => adapter.executor.run(sql, ...values));
	}

	return {
		dialect,
		get: (sql, ...values) => read((executor) => executor.get(sql, ...values)),
		all: (sql, ...values) => read((executor) => executor.all(sql, ...values)),
		run,
		async transaction(work) {
			if (scope.getStore()) return work();
			// 事务内跨 Store 的调用共用这一连接与提交边界。
			return serialize(() => adapter.transaction((executor) => scope.run(executor, work)));
		},
		async insertIfAbsent(sql, conflictColumns, ...values) {
			if (dialect !== "mysql") {
				const target = conflictColumns ? `(${conflictColumns})` : "";
				return run(`${sql} ON CONFLICT${target} DO NOTHING`, ...values);
			}
			try {
				return await run(sql, ...values);
			} catch (error) {
				if (adapter.isDuplicateKey?.(error)) return { changes: 0 };
				throw error;
			}
		},
		upsert(sql, conflictColumns, update, ...values) {
			const clause =
				dialect === "mysql" ? "AS excluded ON DUPLICATE KEY UPDATE" : `ON CONFLICT(${conflictColumns}) DO UPDATE SET`;
			return run(`${sql} ${clause} ${update}`, ...values);
		},
		close: () => serialize(() => adapter.close()),
	};
}
