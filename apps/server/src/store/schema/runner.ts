import { createHash } from "node:crypto";
import { type ExternalDialect, externalTableNames, type MigrationConnection, readExternalTable } from "./catalog.ts";
import {
	type DdlStep,
	type Migration,
	type MigrationProgram,
	type Schema,
	type Table,
	tableDifference,
} from "./model.ts";
import { mysqlTableOptions } from "./render.ts";
import { executeData } from "./transforms.ts";

export class MigrationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "MigrationError";
	}
}

interface Progress {
	id: string;
	step_index: number;
	inflight: number;
	fingerprint: string;
}

type MysqlTransaction = (work: () => Promise<void>) => Promise<void>;

const progressTable = "_kit_migration_progress";
const migrationTable = "_kit_migrations";
const legacyIds = { mysql: "001_initial_mysql_schema", postgres: "001_initial_postgres_schema" };

function stepError(error: unknown, id: string, step: number): never {
	if (error instanceof MigrationError) throw error;
	const code =
		typeof error === "object" &&
		error != null &&
		"code" in error &&
		typeof error.code === "string" &&
		/^[A-Z0-9_]+$/.test(error.code)
			? `（${error.code}）`
			: "";
	throw new MigrationError(`数据库迁移 ${id} 第 ${step + 1} 步失败${code}`);
}

function expectedIndexes(...tables: (Table | null)[]) {
	return new Set(tables.flatMap((table) => table?.indexes.map((index) => index.name) ?? []));
}

async function checkSchema(db: MigrationConnection, dialect: ExternalDialect, schema: Schema, stage: string) {
	for (const expected of schema) {
		const found = await readExternalTable(db, dialect, expected.name, expectedIndexes(expected));
		const difference = tableDifference(expected, found);
		if (difference) throw new MigrationError(`${stage}：${expected.name} 的 ${difference} 与预期结构不符`);
	}
}

function describeMismatch(value: [string, string] | undefined) {
	return value ? `${value[0]} 的 ${value[1]}` : "结构";
}

async function states(db: MigrationConnection, dialect: ExternalDialect, step: DdlStep) {
	let before: [string, string] | undefined;
	let after: [string, string] | undefined;
	for (const change of step.changes) {
		const actual = await readExternalTable(db, dialect, change.name, expectedIndexes(change.before, change.after));
		const old = tableDifference(change.before, actual);
		const next = tableDifference(change.after, actual);
		if (old) before ??= [change.name, old];
		if (next) after ??= [change.name, next];
	}
	return { before, after };
}

async function executeDdl(
	db: MigrationConnection,
	dialect: ExternalDialect,
	step: DdlStep,
	id: string,
	index: number,
	resume: boolean,
	begin: () => Promise<void> = async () => undefined,
) {
	const found = await states(db, dialect, step);
	if (resume && !found.after) return;
	if (found.before)
		throw new MigrationError(`迁移 ${id} 第 ${index + 1} 步：${describeMismatch(found.before)} 与迁移前结构不符`);
	await begin();
	await db.execute(step.sql);
	const checked = await states(db, dialect, step);
	if (checked.after)
		throw new MigrationError(`迁移 ${id} 第 ${index + 1} 步：${describeMismatch(checked.after)} 与迁移后结构不符`);
}

function nextVersions(versions: Migration[], applied: Set<string>, legacyId?: string) {
	const known = new Set(versions.map((version) => version.id));
	for (const id of applied) {
		if (id !== legacyId && !known.has(id)) throw new MigrationError(`数据库迁移记录包含未知版本：${id}`);
	}
	const pending = versions.filter((version) => !applied.has(version.id));
	if (pending.length && versions.slice(versions.indexOf(pending[0]!)).some((version) => applied.has(version.id))) {
		throw new MigrationError(`数据库迁移记录不连续，缺少版本：${pending[0]!.id}`);
	}
	return pending;
}

function knownSchema(versions: Migration[], applied: Set<string>, baseline: Schema = []): Schema {
	const tables = new Map(baseline.map((table) => [table.name, table]));
	const steps = versions.filter(({ id }) => applied.has(id)).flatMap(({ steps }) => steps);
	for (const { name, after } of steps.flatMap((step) => ("changes" in step ? step.changes : []))) {
		if (after) tables.set(name, after);
		else tables.delete(name);
	}
	return [...tables.values()];
}

async function registry(
	db: MigrationConnection,
	dialect: ExternalDialect,
	program: MigrationProgram,
	progress?: Progress,
) {
	const records = await db.rows<{ id: string }>(`SELECT id FROM ${migrationTable}`);
	const applied = new Set(records.map(({ id }) => id));
	const oldId = legacyIds[dialect];
	if (applied.has(oldId)) {
		const adoption = program.adoption;
		if (!adoption || !program.legacy) throw new MigrationError("缺少外部库历史接入定义");
		const versions = [adoption, ...program.upgrades];
		const pending = nextVersions(versions, applied, oldId);
		if (!applied.has(adoption.id)) {
			await checkSchema(db, dialect, program.legacy, "既有初始版本");
		} else if (pending.length && !progress) {
			await validateCurrent(db, dialect, knownSchema(versions, applied, program.legacy));
		}
		return pending;
	}
	const versions = [...program.history, ...program.upgrades];
	const pending = nextVersions(versions, applied);
	if (progress) return pending;
	if (!applied.size) {
		const names = await externalTableNames(db, dialect);
		if (names.some((name) => ![progressTable, migrationTable].includes(name))) {
			throw new MigrationError("目标库已有表但缺少 Kit 迁移记录，请核对数据库配置");
		}
	} else if (pending.length) {
		await validateCurrent(db, dialect, knownSchema(versions, applied));
	}
	return pending;
}

async function record(db: MigrationConnection, id: string) {
	await db.execute(`INSERT INTO ${migrationTable} (id, applied_at) VALUES (?, ?)`, id, new Date().toISOString());
}

async function validateCurrent(db: MigrationConnection, dialect: ExternalDialect, expected: Schema) {
	await checkSchema(db, dialect, expected, "当前数据库");
	const names = await externalTableNames(db, dialect);
	const known = new Set([migrationTable, progressTable, ...expected.map((table) => table.name)]);
	const extra = names.find((name) => /^(?:kit_|catalog_agents$|quota_|usage_turns$)/.test(name) && !known.has(name));
	if (extra) throw new MigrationError(`当前数据库包含迁移未定义的表：${extra}`);
}

async function alreadyAdoptedStep(
	db: MigrationConnection,
	dialect: ExternalDialect,
	step: DdlStep,
	version: Migration,
	index: number,
) {
	// 兼容旧库管理员已事先建好的等价归档表。
	return version.id === "kit_history_adopted" && index === 0 && !(await states(db, dialect, step)).after;
}

/** 调用方已在持有事务级迁移锁的连接上开启事务。 */
export async function migratePostgresSchema(db: MigrationConnection, program: MigrationProgram) {
	await db.execute(`CREATE TABLE IF NOT EXISTS ${migrationTable} (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`);
	const pending = await registry(db, "postgres", program);
	for (const version of pending) {
		for (const [index, step] of version.steps.entries()) {
			try {
				if ("sql" in step) {
					if (!(await alreadyAdoptedStep(db, "postgres", step, version, index))) {
						await executeDdl(db, "postgres", step, version.id, index, false);
					}
				} else {
					await executeData(db, "postgres", step);
				}
			} catch (error) {
				stepError(error, version.id, index);
			}
		}
		await record(db, version.id);
	}
	await validateCurrent(db, "postgres", program.current);
}

async function mysqlProgress(db: MigrationConnection) {
	await db.execute(`CREATE TABLE IF NOT EXISTS ${progressTable} (
		slot INT PRIMARY KEY CHECK (slot = 1), id VARCHAR(100) NOT NULL,
		step_index INT NOT NULL, inflight TINYINT NOT NULL, fingerprint VARCHAR(64) NOT NULL
	) ${mysqlTableOptions}`);
	const [progress] = await db.rows<Progress>(
		`SELECT id, step_index, inflight, fingerprint FROM ${progressTable} WHERE slot = 1`,
	);
	return progress;
}

async function advance(db: MigrationConnection, index: number, inflight = false) {
	await db.execute(`UPDATE ${progressTable} SET step_index = ?, inflight = ? WHERE slot = 1`, index, Number(inflight));
}

async function applyMysqlVersion(
	db: MigrationConnection,
	version: Migration,
	transaction: MysqlTransaction,
	saved?: Progress,
) {
	const fingerprint = createHash("sha256").update(JSON.stringify(version.steps)).digest("hex");
	if (
		saved != null &&
		(saved.fingerprint !== fingerprint || saved.step_index < 0 || saved.step_index > version.steps.length)
	) {
		throw new MigrationError(`MySQL 待恢复迁移与当前代码不符：${version.id}`);
	}
	if (!saved) {
		await db.execute(
			`INSERT INTO ${progressTable} (slot, id, step_index, inflight, fingerprint) VALUES (1, ?, 0, 0, ?)`,
			version.id,
			fingerprint,
		);
	}
	const start = saved?.step_index ?? 0;
	for (let index = start; index < version.steps.length; index++) {
		const step = version.steps[index]!;
		try {
			if ("sql" in step) {
				const inflight = start === index && Boolean(saved?.inflight);
				if (!(await alreadyAdoptedStep(db, "mysql", step, version, index))) {
					await executeDdl(db, "mysql", step, version.id, index, inflight, () => advance(db, index, true));
				}
				await advance(db, index + 1);
			} else {
				await transaction(async () => {
					await executeData(db, "mysql", step);
					await advance(db, index + 1);
				});
			}
		} catch (error) {
			stepError(error, version.id, index);
		}
	}
	await transaction(async () => {
		await record(db, version.id);
		await db.execute(`DELETE FROM ${progressTable} WHERE slot = 1`);
	});
}

/** 调用方在同一连接上持有 MySQL 迁移锁。 */
export async function migrateMysqlSchema(
	db: MigrationConnection,
	program: MigrationProgram,
	transaction: MysqlTransaction,
) {
	await db.execute(`CREATE TABLE IF NOT EXISTS ${migrationTable} (
		id VARCHAR(100) PRIMARY KEY, applied_at VARCHAR(32) NOT NULL
	) ${mysqlTableOptions}`);
	const progress = await mysqlProgress(db);
	const pending = await registry(db, "mysql", program, progress);
	if (progress && pending[0]?.id !== progress.id) {
		throw new MigrationError(`MySQL 存在不匹配的待恢复版本：${progress.id}`);
	}
	for (const [index, version] of pending.entries()) {
		await applyMysqlVersion(db, version, transaction, index === 0 ? progress : undefined);
	}
	await validateCurrent(db, "mysql", program.current);
}
