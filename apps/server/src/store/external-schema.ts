import type { DataSource } from "typeorm";
import { initialRows, migrationIds, upgradeIds } from "./baseline.ts";
import { currentTables, entityTableSteps } from "./entity-tables.ts";
import {
	applyVersions,
	assertBootstrapObjects,
	inspectRegistry,
	type MysqlTransaction,
	nativeBootstrapPrefix,
	validateCurrent,
} from "./external-execution.ts";
import type { ExternalDialect, MigrationConnection } from "./metadata/catalog.ts";

function hasExactly(applied: Set<string>, expected: readonly string[]) {
	return applied.size === expected.length && expected.every((id) => applied.has(id));
}

/** 调用方在同一连接上持有迁移锁。空库使用 TypeORM 的建表步骤，当前库只核对物理结构。 */
export async function initializeExternal(
	db: MigrationConnection,
	dialect: ExternalDialect,
	source: DataSource,
	transaction?: MysqlTransaction,
) {
	const state = await inspectRegistry(db, dialect);
	const current = currentTables(source, dialect);
	const validate = () => validateCurrent(db, dialect, current);
	const adopted = [`001_initial_${dialect}_schema`, "kit_history_adopted", ...upgradeIds];
	if (!state.progress && (hasExactly(state.applied, migrationIds) || hasExactly(state.applied, adopted))) {
		await validate();
		return;
	}
	const nativeId = `${nativeBootstrapPrefix}${migrationIds.length}`;
	if (!state.applied.size && (!state.progress || state.progress.id === nativeId)) {
		const ddl = entityTableSteps(source, dialect);
		assertBootstrapObjects(state.names, ddl, state.progress);
		const version = { id: nativeId, coveredVersions: [...migrationIds], steps: [...ddl, { data: initialRows }] };
		await applyVersions(db, dialect, state.progress, [version], transaction, validate);
		return;
	}
	// 跨版本续建固定原始物理表顺序和种子。历史指纹匹配后先完成旧基线，再执行增量。
	const { upgradeExternal } = await import("./migrations/runner.ts");
	const { program } =
		dialect === "mysql"
			? await import("./migrations/generated/mysql.ts")
			: await import("./migrations/generated/postgres.ts");
	await upgradeExternal(db, dialect, state, program, current, transaction);
}
