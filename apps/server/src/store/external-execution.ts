import { createHash } from "node:crypto";
import {
	type ExternalDialect,
	externalTableNames,
	type MigrationConnection,
	readExternalTable,
} from "./metadata/catalog.ts";
import { mysqlTableOptions } from "./metadata/dialect.ts";
import {
	comparable,
	type DataStep,
	type DdlStep,
	type Migration,
	type Schema,
	type Table,
	tableDifference,
} from "./metadata/model.ts";

export class MigrationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "MigrationError";
	}
}

export interface Progress {
	id: string;
	step_index: number;
	inflight: number;
	fingerprint: string;
}

export type PendingVersion = Migration & { coveredVersions?: string[] };

export type MysqlTransaction = (work: () => Promise<void>) => Promise<void>;

const progressTable = "_kit_migration_progress";
const migrationTable = "_kit_migrations";
export const nativeBootstrapPrefix = "kit_typeorm_bootstrap_";
const oidcTextKeysFingerprint = "bf9eb32864267c249db7ef954829ded485e42a9532af3fee04b95de4ac45a9b4";

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

export async function checkSchema(db: MigrationConnection, dialect: ExternalDialect, schema: Schema, stage: string) {
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

async function targetObjects(db: MigrationConnection, dialect: ExternalDialect) {
	const sql =
		dialect === "mysql"
			? "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()"
			: "SELECT relname AS name FROM pg_class WHERE relnamespace = current_schema()::regnamespace AND relkind IN ('r','p','v','m','f','S')";
	const names = (await db.rows<{ name: string }>(sql)).map((row) => row.name);
	if (names.length && !names.includes(migrationTable))
		throw new MigrationError("目标库已有表但缺少 Kit 迁移记录，请核对数据库配置");
	return names;
}

async function record(db: MigrationConnection, version: PendingVersion) {
	const now = new Date().toISOString();
	for (const id of version.coveredVersions ?? [version.id]) {
		await db.execute(`INSERT INTO ${migrationTable} (id, applied_at) VALUES (?, ?)`, id, now);
	}
}

export async function validateCurrent(db: MigrationConnection, dialect: ExternalDialect, expected: Schema) {
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

async function createMysqlProgress(db: MigrationConnection) {
	await db.execute(`CREATE TABLE IF NOT EXISTS ${progressTable} (
		slot INT PRIMARY KEY CHECK (slot = 1), id VARCHAR(100) NOT NULL,
		step_index INT NOT NULL, inflight TINYINT NOT NULL, fingerprint VARCHAR(64) NOT NULL
	) ${mysqlTableOptions}`);
}

async function advance(db: MigrationConnection, index: number, inflight = false) {
	await db.execute(`UPDATE ${progressTable} SET step_index = ?, inflight = ? WHERE slot = 1`, index, Number(inflight));
}

async function prepareMysqlProgress(db: MigrationConnection, version: PendingVersion, saved?: Progress) {
	// 实体快照与历史迁移可能以不同顺序记录等价的约束。指纹核对相同的建表步骤、字段、种子和版本。
	const payload = version.coveredVersions
		? [
				version.coveredVersions,
				version.steps.map((step) => ("sql" in step ? step.changes.map((c) => [c.name, comparable(c.after!)]) : step)),
			]
		: version.steps;
	const fingerprint = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
	if (saved) {
		const first = version.steps[0];
		// 旧版 034 的 TEXT 键无法建表。确认该步尚未落库后登记修正的指纹，再沿用 DDL 恢复。
		if (
			version.id === "034_oidc_member_auth" &&
			saved.fingerprint === oidcTextKeysFingerprint &&
			saved.step_index === 0 &&
			first &&
			"sql" in first &&
			!(await states(db, "mysql", first)).before
		) {
			await db.execute(`UPDATE ${progressTable} SET fingerprint = ? WHERE slot = 1`, fingerprint);
		} else if (saved.fingerprint !== fingerprint || saved.step_index < 0 || saved.step_index > version.steps.length) {
			throw new MigrationError(`MySQL 待恢复迁移与当前代码不符：${version.id}`);
		}
	} else {
		await db.execute(
			`INSERT INTO ${progressTable} (slot, id, step_index, inflight, fingerprint) VALUES (1, ?, 0, 0, ?)`,
			version.id,
			fingerprint,
		);
	}
}

async function finishMysqlVersion(db: MigrationConnection, version: PendingVersion) {
	await record(db, version);
	await db.execute(`DELETE FROM ${progressTable} WHERE slot = 1`);
}

async function applyMysqlVersion(
	db: MigrationConnection,
	version: PendingVersion,
	transaction: MysqlTransaction,
	saved?: Progress,
	validateBootstrap?: () => Promise<void>,
) {
	await prepareMysqlProgress(db, version, saved);
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
				const finish = version.coveredVersions && index === version.steps.length - 1;
				await transaction(async () => {
					if (finish) await validateBootstrap?.();
					await executeData(db, "mysql", step);
					if (finish) await finishMysqlVersion(db, version);
					else await advance(db, index + 1);
				});
				if (finish) return;
			}
		} catch (error) {
			stepError(error, version.id, index);
		}
	}
	await transaction(async () => {
		await validateBootstrap?.();
		await finishMysqlVersion(db, version);
	});
}

export interface ExternalRegistry {
	names: string[];
	applied: Set<string>;
	progress?: Progress;
}

export async function inspectRegistry(db: MigrationConnection, dialect: ExternalDialect): Promise<ExternalRegistry> {
	const names = await targetObjects(db, dialect);
	const ddl =
		dialect === "mysql"
			? `(id VARCHAR(100) PRIMARY KEY, applied_at VARCHAR(32) NOT NULL) ${mysqlTableOptions}`
			: "(id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)";
	const registered = names.includes(migrationTable);
	const hasProgress = dialect === "mysql" && names.includes(progressTable);
	const rows = registered ? await db.rows<{ id: string }>(`SELECT id FROM ${migrationTable}`) : [];
	const [progress] = hasProgress
		? await db.rows<Progress>(`SELECT id, step_index, inflight, fingerprint FROM ${progressTable} WHERE slot = 1`)
		: [];
	if (!rows.length && !progress) assertBootstrapObjects(names, []);
	if (!registered) await db.execute(`CREATE TABLE ${migrationTable} ${ddl}`);
	if (dialect === "mysql" && !hasProgress) await createMysqlProgress(db);
	return { names, applied: new Set(rows.map((row) => row.id)), progress };
}

export function assertBootstrapObjects(names: string[], ddl: DdlStep[], progress?: Progress) {
	const allowed = new Set([progressTable, migrationTable]);
	if (progress) {
		const end = progress.step_index + Number(Boolean(progress.inflight));
		for (const step of ddl.slice(0, end)) for (const change of step.changes) allowed.add(change.name);
	}
	if (names.some((name) => !allowed.has(name)))
		throw new MigrationError("目标库已有实体建库进度之外的表，请核对数据库配置");
}

async function executeData(db: MigrationConnection, dialect: ExternalDialect, step: DataStep) {
	if ("data" in step) {
		for (const sql of step.data) await db.execute(sql);
	} else {
		const history = await import("./migrations/transforms.ts");
		await history.executeTransform(db, dialect, step.transform);
	}
}

async function applyPostgresSteps(db: MigrationConnection, version: PendingVersion) {
	for (const [index, step] of version.steps.entries()) {
		try {
			if ("sql" in step) {
				if (!(await alreadyAdoptedStep(db, "postgres", step, version, index)))
					await executeDdl(db, "postgres", step, version.id, index, false);
			} else {
				await executeData(db, "postgres", step);
			}
		} catch (error) {
			stepError(error, version.id, index);
		}
	}
}
export async function applyVersions(
	db: MigrationConnection,
	dialect: ExternalDialect,
	progress: Progress | undefined,
	pending: PendingVersion[],
	transaction?: MysqlTransaction,
	validateBootstrap?: () => Promise<void>,
) {
	if (progress && pending[0]?.id !== progress.id)
		throw new MigrationError(`MySQL 存在不匹配的待恢复版本：${progress.id}`);
	for (const [offset, version] of pending.entries()) {
		if (dialect === "mysql") {
			if (!transaction) throw new Error("MySQL 缺少迁移事务");
			await applyMysqlVersion(db, version, transaction, offset === 0 ? progress : undefined, validateBootstrap);
			continue;
		}
		await applyPostgresSteps(db, version);
		await validateBootstrap?.();
		await record(db, version);
	}
}
