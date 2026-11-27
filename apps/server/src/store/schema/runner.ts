import {
	applyVersions,
	assertBootstrapObjects,
	checkSchema,
	type ExternalRegistry,
	MigrationError,
	type MysqlTransaction,
	nativeBootstrapPrefix,
	type PendingVersion,
	type Progress,
	validateCurrent,
} from "../external-execution.ts";
import type { ExternalDialect, MigrationConnection } from "../metadata/catalog.ts";
import type { Migration, MigrationProgram, Schema } from "../metadata/model.ts";
import { initialRows, initialTableSteps } from "./bootstrap.ts";

const bootstrapPrefix = "kit_entity_bootstrap_";
const legacyIds = { mysql: "001_initial_mysql_schema", postgres: "001_initial_postgres_schema" };

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

async function legacyVersions(
	db: MigrationConnection,
	dialect: ExternalDialect,
	program: MigrationProgram,
	applied: Set<string>,
	progress?: Progress,
) {
	const oldId = legacyIds[dialect];
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

/** 进度 ID 锚定当时的版本前缀。换版本重启时先按旧快照完成建库，再升级到新实体。 */
function initialVersions(
	dialect: ExternalDialect,
	program: MigrationProgram,
	versions: Migration[],
	names: string[],
	progress?: Progress,
): PendingVersion[] {
	const prefix = progress?.id.startsWith(nativeBootstrapPrefix) ? nativeBootstrapPrefix : bootstrapPrefix;
	const count = progress ? Number(progress.id.slice(prefix.length)) : versions.length;
	if (!Number.isSafeInteger(count) || count <= 0 || count > versions.length)
		throw new MigrationError("待恢复的实体建库版本不在当前迁移清单中");
	const coveredVersions = versions.slice(0, count).map(({ id }) => id);
	const schema = count === versions.length ? program.current : knownSchema(versions, new Set(coveredVersions));
	const ddl = initialTableSteps(schema, dialect);
	assertBootstrapObjects(names, ddl, progress);
	return [
		{
			id: `${prefix}${count}`,
			steps: [...ddl, { data: initialRows }],
			coveredVersions,
		},
		...versions.slice(count),
	];
}

async function registry(
	db: MigrationConnection,
	dialect: ExternalDialect,
	program: MigrationProgram,
	{ names, applied, progress }: ExternalRegistry,
): Promise<PendingVersion[]> {
	const oldId = legacyIds[dialect];
	if (applied.has(oldId)) {
		return legacyVersions(db, dialect, program, applied, progress);
	}
	const versions = [...program.history, ...program.upgrades];
	const pending = nextVersions(versions, applied);
	if (progress && !progress.id.startsWith(bootstrapPrefix) && !progress.id.startsWith(nativeBootstrapPrefix))
		return pending;
	if (!applied.size) return initialVersions(dialect, program, versions, names, progress);
	if (pending.length && !progress) {
		await validateCurrent(db, dialect, knownSchema(versions, applied));
	}
	return pending;
}

/** 已持锁。只有历史版本、历史建库中断或需要接入的旧库进入本模块。 */
export async function upgradeExternal(
	db: MigrationConnection,
	dialect: ExternalDialect,
	state: ExternalRegistry,
	program: MigrationProgram,
	current: Schema,
	transaction?: MysqlTransaction,
) {
	const pending = await registry(db, dialect, program, state);
	await applyVersions(db, dialect, state.progress, pending, transaction);
	await validateCurrent(db, dialect, current);
}
