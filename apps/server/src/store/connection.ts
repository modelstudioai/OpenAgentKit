import { AsyncLocalStorage } from "node:async_hooks";
import { type DataSource, QueryFailedError, type QueryRunner } from "typeorm";
import type { EntityWork, StoreDatabase } from "./database.ts";

interface DatabaseAdapter<Connection> {
	entitySource(): DataSource | Promise<DataSource>;
	discardConnection(connection: Connection): void | Promise<void>;
	close(): Promise<void>;
}

function driverCode(error: unknown): string | undefined {
	const driver = error instanceof QueryFailedError ? error.driverError : error;
	const code = driver && typeof driver === "object" && "code" in driver ? driver.code : undefined;
	return typeof code === "string" && /^[A-Z0-9_]+$/.test(code) ? code : undefined;
}

// TypeORM 查询异常带 SQL、参数和原始驱动错误；连接异常也可能含账户或主机。
function databaseError(error?: unknown) {
	const code = driverCode(error);
	return Object.assign(new Error(code ? `数据库操作失败（${code}）` : "数据库操作失败"), { code });
}

async function driverCall<T>(work: () => T | Promise<T>): Promise<T> {
	try {
		return await work();
	} catch (error) {
		throw databaseError(error);
	}
}

class StoreConnection {
	private usable = true;

	constructor(
		private readonly runner: QueryRunner,
		private readonly discard: () => Promise<void>,
	) {}

	async run<T>(work: EntityWork<T>): Promise<T> {
		if (!this.usable || this.runner.isReleased) throw databaseError();
		try {
			return await work(this.runner.manager);
		} catch (error) {
			if (error instanceof QueryFailedError) throw databaseError(error);
			throw error;
		}
	}

	async transaction<T>(work: () => Promise<T>): Promise<T> {
		if (!this.usable || this.runner.isReleased) throw databaseError();
		if (this.runner.isTransactionActive) return work();
		try {
			await driverCall(() => this.runner.startTransaction());
			const result = await work();
			await driverCall(() => this.runner.commitTransaction());
			return result;
		} catch (error) {
			await this.rollback();
			throw error;
		}
	}

	private async rollback() {
		if (!this.runner.isTransactionActive || this.runner.isReleased) return;
		try {
			await this.runner.rollbackTransaction();
		} catch {
			this.usable = false;
			await this.discard();
		}
	}
}

async function releaseRunner(runner: QueryRunner, succeeded: boolean) {
	if (runner.isReleased) return;
	try {
		await runner.release();
	} catch (error) {
		if (succeeded) throw databaseError(error);
	}
}

export function createStoreDatabase<Connection>(
	dialect: StoreDatabase["dialect"],
	adapter: DatabaseAdapter<Connection>,
): StoreDatabase {
	const scope = new AsyncLocalStorage<StoreConnection>();
	let pending = Promise.resolve();
	let unavailable = false;

	function serialize<T>(work: () => Promise<T>): Promise<T> {
		const result = pending.then(work);
		pending = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	}

	async function withManager<T>(work: EntityWork<T>, transactional = false) {
		if (unavailable) throw databaseError();
		const source = await driverCall(() => adapter.entitySource());
		const runner = source.createQueryRunner();
		let succeeded = false;
		let release = true;
		try {
			const connection: Connection = await driverCall(() => runner.connect());
			const current = new StoreConnection(runner, async () => {
				try {
					await adapter.discardConnection(connection);
				} catch {
					// 连接仍可能持有事务，禁止归还连接池并停止接受新操作。
					release = false;
					unavailable = true;
				}
			});
			const run = () => scope.run(current, () => current.run(work));
			const result = await (transactional ? current.transaction(run) : run());
			succeeded = true;
			return result;
		} finally {
			if (release) await releaseRunner(runner, succeeded);
		}
	}

	function read<T>(work: EntityWork<T>) {
		const current = scope.getStore();
		if (current) return current.run(work);
		return dialect === "sqlite" ? serialize(() => withManager(work)) : withManager(work);
	}
	function write<T>(work: EntityWork<T>) {
		const current = scope.getStore();
		return current ? current.run(work) : serialize(() => withManager(work));
	}
	return {
		dialect,
		read,
		write,
		transaction(work) {
			const current = scope.getStore();
			return current ? current.transaction(work) : serialize(() => withManager(work, true));
		},
		insertEntityIfAbsent(entity, values, conflictColumns = []) {
			return write(async (manager) => {
				const builder = manager.createQueryBuilder().insert().into(entity).values(values).updateEntity(false);
				const [statement, parameters] = builder.getQueryAndParameters();
				const target = conflictColumns.map((column) => {
					const field = manager.dataSource.getMetadata(entity).findColumnWithPropertyName(column);
					if (!field) throw new Error(`未登记的实体列：${column}`);
					return builder.escape(field.databaseName);
				});
				// MySQL 的 INSERT IGNORE 也会忽略字段错误，只接受主键或唯一键冲突。
				const clause =
					dialect === "mysql" ? "" : ` ON CONFLICT${target.length ? ` (${target.join(", ")})` : ""} DO NOTHING`;
				try {
					const result = await manager.queryRunner!.query(statement + clause, parameters, true);
					return Boolean(result.affected);
				} catch (error) {
					if (dialect === "mysql" && error instanceof QueryFailedError && driverCode(error) === "ER_DUP_ENTRY")
						return false;
					throw error;
				}
			});
		},
		close: () => serialize(() => adapter.close()),
	};
}
