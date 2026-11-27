import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { constants, DatabaseSync } from "node:sqlite";
import type { DataSource } from "typeorm";
import { expect, it, vi } from "vitest";
import { migrationIds } from "../src/store/baseline.ts";
import { createStoreDatabase } from "../src/store/connection.ts";
import { migrateSqliteSchema, openDatabase } from "../src/store/db.ts";
import { createSqliteDatabase } from "../src/store/sqlite.ts";

it("回滚失败时淘汰借出的连接，保留业务错误并脱敏后续连接错误", async () => {
	const businessError = new Error("余额不足");
	const driverError = Object.assign(new Error("数据库连接账户及主机"), { code: "28P01" });
	const connection = {};
	const runner = {
		manager: {},
		isTransactionActive: false,
		connect: vi.fn().mockResolvedValueOnce(connection).mockRejectedValueOnce(driverError),
		async startTransaction() {
			this.isTransactionActive = true;
		},
		rollbackTransaction: vi.fn().mockRejectedValue(driverError),
		release: vi.fn().mockRejectedValue(driverError),
	};
	const discardConnection = vi.fn();
	const store = createStoreDatabase("postgres", {
		entitySource: () => ({ createQueryRunner: () => runner }) as unknown as DataSource,
		discardConnection,
		close: async () => {},
	});
	const failure = store.write(() =>
		store.transaction(async () => {
			throw businessError;
		}),
	);
	await expect(failure).rejects.toBe(businessError);
	expect(runner.rollbackTransaction).toHaveBeenCalledOnce();
	expect(discardConnection).toHaveBeenCalledExactlyOnceWith(connection);
	const next = store.read(async () => true);
	await expect(next).rejects.toMatchObject({ message: "数据库操作失败（28P01）", code: "28P01" });
	expect(runner.release).toHaveBeenCalledTimes(2);
});

it("SQLite 锁释放后可再次开启事务，查询失败不会公开 SQL 和绑定值", async () => {
	const dir = mkdtempSync(join(tmpdir(), "kit-transaction-lock-"));
	const file = join(dir, "kit.sqlite");
	const db = new DatabaseSync(file);
	const writer = new DatabaseSync(file);
	const store = createSqliteDatabase(db);
	try {
		await store.initializeEntities();
		db.exec("CREATE TABLE tx_probe (value TEXT PRIMARY KEY)");
		db.exec("PRAGMA busy_timeout = 0");
		writer.exec("BEGIN IMMEDIATE");
		const onBusy = vi.fn(async () => true);
		await expect(store.transaction(onBusy)).rejects.toMatchObject({ code: "ERR_SQLITE_ERROR" });
		expect(onBusy).not.toHaveBeenCalled();
		writer.exec("ROLLBACK");

		const value = "仅供测试的私密字段";
		const insert = () => store.write((manager) => manager.query("INSERT INTO tx_probe VALUES (?)", [value]));
		await store.transaction(insert);
		const duplicate = store.transaction(insert);
		await expect(duplicate).rejects.toMatchObject({ code: "ERR_SQLITE_ERROR" });
		await expect(duplicate).rejects.not.toHaveProperty("query");
		await expect(duplicate).rejects.not.toHaveProperty("parameters");
		await expect(duplicate).rejects.not.toHaveProperty("driverError");
		const businessError = new Error("撤销变更");
		await expect(
			store.transaction(async () => {
				expect(db.isTransaction).toBe(true);
				await store.write((manager) => manager.query("DELETE FROM tx_probe"));
				throw businessError;
			}),
		).rejects.toBe(businessError);
		expect(db.prepare("SELECT value FROM tx_probe").all()).toEqual([{ value }]);
		expect(db.isTransaction).toBe(false);
	} finally {
		writer.close();
		await store.close();
		rmSync(dir, { recursive: true, force: true });
	}
});

it("SQLite 同一空库并发首次打开只登记一组基线与初始数据", async () => {
	const directory = mkdtempSync(join(tmpdir(), "kit-concurrent-bootstrap-"));
	try {
		const connections = await Promise.all([openDatabase(directory), openDatabase(directory)]);
		try {
			const baseline = "SELECT id, applied_at FROM _kit_migrations ORDER BY rowid";
			const versions = connections[0].prepare(baseline).all();
			expect(versions.map(({ id }) => id)).toEqual(migrationIds);
			expect(connections[1].prepare(baseline).all()).toEqual(versions);
			expect(connections[1].prepare("SELECT id, monthly_credits FROM quota_policy").all()).toEqual([
				{ id: 1, monthly_credits: 200 },
			]);
		} finally {
			for (const db of connections) db.close();
		}
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

it("SQLite 实体建表中途失败回滚所有表与迁移记录，可再次启动", async () => {
	const db = new DatabaseSync(":memory:");
	try {
		db.setAuthorizer((action, name) =>
			action === constants.SQLITE_CREATE_TABLE && name === "kit_members" ? constants.SQLITE_DENY : constants.SQLITE_OK,
		);
		await expect(migrateSqliteSchema(db)).rejects.toThrow();
		expect(db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all()).toEqual([]);
		expect(db.isTransaction).toBe(false);
		db.setAuthorizer(null);
		await migrateSqliteSchema(db);
		expect(db.prepare("SELECT COUNT(*) AS n FROM _kit_migrations").get()).toEqual({ n: migrationIds.length });
	} finally {
		db.close();
	}
});
