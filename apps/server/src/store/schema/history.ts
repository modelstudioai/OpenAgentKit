import { DatabaseSync } from "node:sqlite";
import { sqliteHistory } from "../sqlite-history.ts";
import {
	type DataStep,
	type DdlStep,
	identifier,
	type Migration,
	type Schema,
	type Step,
	splitSql,
	type Table,
} from "./model.ts";
import { additiveSteps, change, createTableSteps, forDialect } from "./render.ts";
import { readSqliteSchema } from "./sqlite-model.ts";

const sessionRebuilds = new Set([
	"007_admin_debug_scope",
	"015_template_debug_sessions",
	"024_template_default_environment",
]);

function portableSeed(sql: string, dialect: "mysql" | "postgres") {
	if (!/^INSERT OR IGNORE\b/i.test(sql)) return sql;
	return (
		sql.replace(/^INSERT OR IGNORE/i, "INSERT") +
		(dialect === "mysql" ? " ON DUPLICATE KEY UPDATE id = id" : " ON CONFLICT (id) DO NOTHING")
	);
}

function dailyBackfill(sql: string, dialect: "mysql" | "postgres") {
	const [insert, selection] = sql.split(/\n(?=SELECT)/);
	const totals = selection?.split(/\nON CONFLICT/)[0];
	if (!insert || !totals) throw new Error("逐日用量迁移缺少历史查询");
	if (dialect === "postgres") return sql.replace(" AS INTEGER)", " AS BIGINT)");
	return `${insert}
SELECT d.member_id, d.day, d.tokens, d.active_seconds FROM (
${totals.replace(" AS INTEGER)", " AS SIGNED)")}
) AS d
ON DUPLICATE KEY UPDATE tokens = d.tokens, active_seconds = d.active_seconds`;
}

function historicalData(id: string, statements: string[], dialect: "mysql" | "postgres"): DataStep[] {
	switch (id) {
		case "006_legacy_file_ownership":
			return [{ transform: "legacyFiles" }];
		case "022_usage_limit_days_rebuild":
			return [{ transform: "rebuildDailyUsage" }];
		case "031_retire_directory_drafts":
			return [{ transform: "retireDrafts" }];
		default: {
			const data = statements
				.filter((sql) => /^(?:INSERT|UPDATE|DELETE|WITH)\b/i.test(sql))
				.filter((sql) => !/^INSERT INTO kit_sessions_(?:scoped|targets|optional_environment)\b/i.test(sql))
				.map((sql) =>
					id === "021_usage_limit_days_backfill" ? dailyBackfill(sql, dialect) : portableSeed(sql, dialect),
				);
			return data.length ? [{ data }] : [];
		}
	}
}

function withTableName(table: Table, name: string): Table {
	return { ...table, name };
}

function rebuildSessions(before: Table, after: Table, statements: string[], dialect: "mysql" | "postgres"): Step[] {
	const copy = statements.find((sql) => /^INSERT INTO kit_sessions_\w+/i.test(sql));
	if (!copy) throw new Error("会话表重建缺少复制脚本");

	const stage = withTableName(after, "kit_sessions_migration_next");
	const mainSql = identifier(before.name, dialect);
	const stageSql = identifier(stage.name, dialect);
	const data = { data: [copy.replace(/^INSERT INTO kit_sessions_\w+/i, `INSERT INTO ${stageSql}`)] };
	// MySQL 的索引名归表所有，先建好完整临时表，再原子交换表名。
	if (dialect === "mysql") {
		const backup = withTableName(before, "kit_sessions_migration_old");
		const backupSql = identifier(backup.name, dialect);
		return [
			...createTableSteps(stage, dialect),
			data,
			{
				sql: `RENAME TABLE ${mainSql} TO ${backupSql}, ${stageSql} TO ${mainSql}`,
				changes: [
					{ name: before.name, before, after },
					{ name: stage.name, before: stage, after: null },
					{ name: backup.name, before: null, after: backup },
				],
			},
			{
				sql: `DROP TABLE ${backupSql}`,
				changes: [
					{ name: backup.name, before: backup, after: null },
					{ name: after.name, before: after, after },
				],
			},
		];
	}
	const shell = { ...stage, indexes: [] };
	const renamed = withTableName(shell, after.name);
	return [
		...createTableSteps(shell, dialect),
		data,
		change(`DROP TABLE ${mainSql}`, before, null),
		{
			sql: `ALTER TABLE ${stageSql} RENAME TO ${mainSql}`,
			changes: [
				{ name: stage.name, before: shell, after: null },
				{ name: renamed.name, before: null, after: renamed },
			],
		},
		...additiveSteps([renamed], [after], dialect, true),
	];
}

function setColumnDefault(
	table: Table,
	columnName: string,
	value: string | undefined,
	dialect: "mysql" | "postgres",
): DdlStep {
	const next = {
		...table,
		columns: table.columns.map((column) => {
			if (column.name !== columnName) return column;
			const { default: _, ...rest } = column;
			return value == null ? rest : { ...rest, default: value };
		}),
	};
	const action = value == null ? "DROP DEFAULT" : `SET DEFAULT ${value}`;
	return change(
		`ALTER TABLE ${identifier(table.name, dialect)} ALTER COLUMN ${identifier(columnName, dialect)} ${action}`,
		table,
		next,
	);
}

function tableRequired(schema: Schema, name: string) {
	const table = schema.find((entry) => entry.name === name);
	if (!table) throw new Error(`历史迁移缺少表：${name}`);
	return table;
}

function versionExternal(
	id: string,
	originalBefore: Schema,
	originalAfter: Schema,
	statements: string[],
	dialect: "mysql" | "postgres",
): Migration {
	const before = forDialect(originalBefore, dialect);
	const after = forDialect(originalAfter, dialect);
	const data = historicalData(id, statements, dialect);
	const otherTables = (schema: Schema, name: string) => schema.filter((table) => table.name !== name);
	if (sessionRebuilds.has(id)) {
		return {
			id,
			steps: [
				...rebuildSessions(
					tableRequired(before, "kit_sessions"),
					tableRequired(after, "kit_sessions"),
					statements,
					dialect,
				),
				...additiveSteps(otherTables(before, "kit_sessions"), otherTables(after, "kit_sessions"), dialect, true),
				...data,
			],
		};
	}
	if (id === "018_template_versions") {
		// 旧行先以临时默认值加列、回填，再恢复外部库的无默认值约束。
		const withDefault = (schema: Schema) =>
			schema.map((table) =>
				table.name === "kit_templates"
					? {
							...table,
							columns: table.columns.map((column) =>
								column.name === "updated_at" ? { ...column, default: "''" } : column,
							),
						}
					: table,
			);
		const temporary = withDefault(after);
		return {
			id,
			steps: [
				...additiveSteps(before, temporary, dialect, true),
				...data,
				setColumnDefault(tableRequired(temporary, "kit_templates"), "updated_at", undefined, dialect),
			],
		};
	}
	if (id === "031_retire_directory_drafts") {
		return {
			id,
			steps: [
				...additiveSteps(
					otherTables(before, "kit_resource_drafts"),
					otherTables(after, "kit_resource_drafts"),
					dialect,
					true,
				),
				...data,
				setColumnDefault(tableRequired(before, "kit_resource_drafts"), "engine", "'yaml'", dialect),
			],
		};
	}
	return { id, steps: [...additiveSteps(before, after, dialect, true), ...data] };
}

export function compileHistory() {
	const db = new DatabaseSync(":memory:");
	try {
		let before: Schema = [];
		const mysql: Migration[] = [];
		const postgres: Migration[] = [];
		const sqlite: { id: string; sql: string }[] = [];
		for (const migration of sqliteHistory) {
			if (migration.run) migration.run(db);
			else db.exec(migration.sql!);
			const after = readSqliteSchema(db);
			const statements = splitSql(migration.sql ?? "");
			mysql.push(versionExternal(migration.id, before, after, statements, "mysql"));
			postgres.push(versionExternal(migration.id, before, after, statements, "postgres"));
			sqlite.push({
				id: migration.id,
				sql: migration.sql?.trim() ?? `-- TypeScript 步骤见 schema/history/${migration.id}.ts。`,
			});
			before = after;
		}
		return { sqlite, mysql, postgres, baseline: before };
	} finally {
		db.close();
	}
}
