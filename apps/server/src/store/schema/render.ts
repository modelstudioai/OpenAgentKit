import {
	type Column,
	type DdlStep,
	type Dialect,
	type Index,
	identifier,
	type Schema,
	sameValue,
	type Table,
	tableDifference,
} from "./model.ts";

export const mysqlTableOptions = "ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_bin";

const widths = [
	[7, "admission_month month"],
	[10, "day"],
	[20, "auth_type collection_status debug_source engine mode purpose stage visibility"],
	[24, "category"],
	[
		32,
		"accounting_started_at at attempted_at captured_at created_at deleted_at expires_at finalized_at last_event_at listed_at retired_at reviewed_at updated_at",
	],
	[100, "content_type kind"],
	[
		128,
		"catalog_id cleanup_key_hash draft_id group_id hash member_id operation_id preset_pack_id request_hash template_id token_hash",
	],
	[255, "agent_key agent_slug client_message_id file_id name owner project_name request_key session_id slug username"],
	[512, "subject_id"],
] as const;
const textWidths = new Map(widths.flatMap(([width, names]) => names.split(" ").map((name) => [name, width] as const)));
const smallIntegers = new Set([
	"active_seconds_unknown",
	"cleanup_pending",
	"featured",
	"source_dirty",
	"tokens_unknown",
]);
const longText = new Set([
	"capabilities",
	"detail",
	"event_ids",
	"log",
	"opening_remarks",
	"result",
	"suggested_prompts",
	"theme",
	"yaml",
]);

function externalText(table: Table, column: Column, dialect: "mysql" | "postgres") {
	const name = column.name;
	const width = textWidths.get(name);
	if (width) return `VARCHAR(${width})`;
	if (name === "id") return "VARCHAR(128)";
	if (name === "status" && !["kit_sessions", "kit_session_usage"].includes(table.name)) return "VARCHAR(20)";
	if (name === "phase" && table.name === "kit_resource_drafts") return "VARCHAR(20)";
	if (dialect === "mysql" && (name.endsWith("_json") || longText.has(name))) return "LONGTEXT";
	return "TEXT";
}

function externalType(table: Table, column: Column, dialect: "mysql" | "postgres") {
	switch (column.type) {
		case "INTEGER":
			if (smallIntegers.has(column.name)) return dialect === "mysql" ? "TINYINT" : "SMALLINT";
			return column.name === "id" && !column.identity ? "INT" : "BIGINT";
		case "REAL":
			return dialect === "mysql" ? "DOUBLE" : "DOUBLE PRECISION";
		case "BLOB":
			return dialect === "mysql" ? "LONGBLOB" : "BYTEA";
		case "TEXT":
			return externalText(table, column, dialect);
		default:
			if (/^VARCHAR\([1-9][0-9]{0,3}\)$/.test(column.type)) return column.type;
			throw new Error(`共享定义不支持的字段类型 ${column.type}：${table.name}.${column.name}`);
	}
}

function externalColumn(table: Table, column: Column, dialect: "mysql" | "postgres", retiredDrafts: boolean): Column {
	const { collation, ...common } = column;
	const result: Column = {
		...common,
		type: externalType(table, column, dialect),
		nullable: column.nullable && !table.primary.includes(column.name),
	};
	if (collation) {
		if (collation !== "NOCASE" || table.name !== "kit_members" || column.name !== "username") {
			throw new Error(`缺少排序规则 ${collation} 的方言映射：${table.name}.${column.name}`);
		}
		if (dialect === "mysql") result.collation = "ascii_general_ci";
	}
	if (
		table.name === "kit_resource_drafts" &&
		column.name === "engine" &&
		retiredDrafts &&
		result.default === "'directory'"
	) {
		result.default = "'yaml'";
	}
	if (table.name === "kit_templates" && column.name === "updated_at" && result.default === "''") delete result.default;
	return result;
}

function mysqlPlainIndex(table: Table, index: Index): Index {
	if (index.unique) return index;
	return {
		...index,
		columns: index.columns.map((name) => {
			const column = table.columns.find((entry) => entry.name === name);
			// MySQL 对无界文本的普通索引需要前缀。有限长度的列沿用完整键。
			return column && /^(?:LONG)?TEXT$/.test(externalType(table, column, "mysql")) ? `${name}(64)` : name;
		}),
	};
}

function externalIndexes(table: Table, dialect: "mysql" | "postgres") {
	return table.indexes.map((index) => {
		if (index.name === "idx_usage_turns_idempotency" && index.where === "client_message_id IS NOT NULL") {
			// 三库的 UNIQUE 均允许多行 NULL，外部库的完整索引能够直接用于冲突判定。
			const { where: _, ...plain } = index;
			return plain;
		}
		if (dialect !== "mysql") return index;
		if (index.name === "idx_debug_sessions_project") {
			return {
				...index,
				columns: index.columns.map((name) => (["project_name", "agent_key"].includes(name) ? `${name}(64)` : name)),
			};
		}
		if (index.where && index.name !== "idx_resource_drafts_active_owner") {
			throw new Error(`缺少 MySQL 部分索引映射：${table.name}.${index.name}`);
		}
		return index.name === "idx_resource_drafts_active_owner"
			? { name: index.name, columns: ["active_owner"], unique: true }
			: mysqlPlainIndex(table, index);
	});
}

export function forDialect(schema: Schema, dialect: Dialect): Schema {
	if (dialect === "sqlite") return schema;
	const retiredDrafts = schema.some((table) => table.name === "kit_retired_directory_drafts");
	return schema.map((table) => {
		const columns = table.columns.map((column) => externalColumn(table, column, dialect, retiredDrafts));
		const checks = [...table.checks];
		if (dialect === "postgres") {
			if (table.name === "kit_members") checks.push("username = lower(username)");
			if (table.name === "kit_resource_drafts") checks.push("cleanup_pending IN (0, 1)");
		}
		const active = table.indexes.find((index) => index.name === "idx_resource_drafts_active_owner");
		if (dialect === "mysql" && active?.where) {
			columns.push({
				name: "active_owner",
				type: "VARCHAR(255)",
				nullable: true,
				generated: `CASE WHEN ${active.where} THEN owner END`,
			});
		}
		return { ...table, columns, checks, indexes: externalIndexes(table, dialect) };
	});
}

function columnDefault(column: Column, dialect: Dialect) {
	const value = column.default!;
	if (dialect !== "mysql") return value;
	if (/^'(?:''|[^'])*'$/.test(value)) {
		const literal = value.slice(1, -1).replaceAll("''", "'");
		// 二进制字面量经显式字符集转换，避免服务器的 SQL 转义模式改变值。
		if (/['\\\\]/.test(literal)) {
			return `(CONVERT(0x${Buffer.from(literal, "utf8").toString("hex")} USING utf8mb4))`;
		}
	}
	return /^(?:LONG)?TEXT$/.test(column.type) ? `(${value})` : value;
}

function expressionSql(expression: string, dialect: Dialect) {
	if (dialect !== "mysql") return expression;
	return expression.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"/g, (token) =>
		token.startsWith('"') ? identifier(token.slice(1, -1), dialect) : token,
	);
}

function sqlColumn(column: Column, dialect: Dialect) {
	const terms = [identifier(column.name, dialect), column.type];
	if (column.collation) {
		terms.push(dialect === "mysql" ? "CHARACTER SET ascii" : "", `COLLATE ${column.collation}`);
	}
	if (column.identity) {
		terms.push(
			dialect === "sqlite"
				? "PRIMARY KEY AUTOINCREMENT"
				: dialect === "mysql"
					? "AUTO_INCREMENT"
					: "GENERATED BY DEFAULT AS IDENTITY",
		);
	} else if (!column.nullable) {
		terms.push("NOT NULL");
	}
	if (column.generated) terms.push(`GENERATED ALWAYS AS (${column.generated}) STORED`);
	if (column.default != null) {
		terms.push(`DEFAULT ${columnDefault(column, dialect)}`);
	}
	return terms.filter(Boolean).join(" ");
}

function columnsSql(columns: string[], dialect: Dialect) {
	return columns
		.map((entry) => {
			const [name, size] = entry.split("(");
			return identifier(name!, dialect) + (size ? `(${size}` : "");
		})
		.join(", ");
}

function keySql(index: Index, dialect: Dialect) {
	return `${index.unique ? "UNIQUE " : ""}INDEX ${identifier(index.name, dialect)}`;
}

export function createIndex(table: string, index: Index, dialect: Dialect) {
	return `CREATE ${keySql(index, dialect)} ON ${identifier(table, dialect)} (${columnsSql(index.columns, dialect)})${
		index.where ? ` WHERE ${index.where}` : ""
	}`;
}

export function createTable(table: Table, dialect: Dialect) {
	const lines = table.columns.map((column) => sqlColumn(column, dialect));
	if (table.primary.length && !(dialect === "sqlite" && table.columns.some((column) => column.identity))) {
		lines.push(`PRIMARY KEY (${columnsSql(table.primary, dialect)})`);
	}
	lines.push(...table.unique.map((key) => `UNIQUE (${columnsSql(key, dialect)})`));
	for (const key of table.foreignKeys) {
		lines.push(
			`FOREIGN KEY (${columnsSql(key.columns, dialect)}) REFERENCES ${identifier(key.table, dialect)} (${columnsSql(
				key.references,
				dialect,
			)})${key.onDelete !== "NO ACTION" ? ` ON DELETE ${key.onDelete}` : ""}${
				key.onUpdate !== "NO ACTION" ? ` ON UPDATE ${key.onUpdate}` : ""
			}`,
		);
	}
	lines.push(...table.checks.map((check) => `CHECK (${expressionSql(check, dialect)})`));
	if (dialect === "mysql") {
		lines.push(...table.indexes.map((index) => `${keySql(index, dialect)} (${columnsSql(index.columns, dialect)})`));
	}
	return `CREATE TABLE ${identifier(table.name, dialect)} (\n  ${lines.join(",\n  ")}\n)${
		dialect === "mysql" ? ` ${mysqlTableOptions}` : ""
	}`;
}

export function change(sql: string, before: Table | null, after: Table | null): DdlStep {
	const name = (after ?? before)?.name;
	if (!name) throw new Error("DDL 需声明变更表的前后结构");
	return { sql, changes: [{ name, before, after }] };
}

export function orderedNewTables(schema: Schema, existing: Iterable<string> = []) {
	const ready = new Set(existing);
	const pending = [...schema];
	const result: Schema = [];
	while (pending.length > 0) {
		const index = pending.findIndex((table) =>
			table.foreignKeys.every((key) => key.table === table.name || ready.has(key.table)),
		);
		if (index === -1) throw new Error(`无法确定建表顺序，请检查外键：${pending.map((table) => table.name).join(", ")}`);
		const [table] = pending.splice(index, 1);
		result.push(table!);
		ready.add(table!.name);
	}
	return result;
}

export function createTableSteps(table: Table, dialect: Dialect): DdlStep[] {
	if (dialect === "mysql") return [change(createTable(table, dialect), null, table)];
	let state: Table = { ...table, indexes: [] };
	const steps = [change(createTable(state, dialect), null, state)];
	for (const index of table.indexes) {
		const next = { ...state, indexes: [...state.indexes, index] };
		steps.push(change(createIndex(table.name, index, dialect), state, next));
		state = next;
	}
	return steps;
}

function scalarDefault(sql?: string) {
	return sql != null && /^(?:[-+]?\d+(?:\.\d+)?|'(?:''|[^'])*')$/.test(sql);
}

function growTable(before: Table, after: Table, dialect: Dialect, historical: boolean) {
	const originalColumns = new Set(before.columns.map((column) => column.name));
	const originalIndexes = new Set(before.indexes.map((index) => index.name));
	const added = after.columns.filter((column) => !originalColumns.has(column.name));
	const newIndexes = after.indexes.filter((index) => !originalIndexes.has(index.name));
	const newChecks = historical ? after.checks.filter((check) => !before.checks.includes(check)) : [];
	const retained = {
		...after,
		columns: after.columns.filter((column) => originalColumns.has(column.name)),
		indexes: after.indexes.filter((index) => originalIndexes.has(index.name)),
		checks: after.checks.filter((check) => !newChecks.includes(check)),
	};
	const unsupported = tableDifference(before, retained);
	if (unsupported) throw new Error(`${before.name} 的 ${unsupported} 需要显式迁移规则`);
	const tableSql = identifier(before.name, dialect);
	const steps: DdlStep[] = [];
	let state = before;
	for (const column of added) {
		if (!historical && (column.identity || column.generated || (!column.nullable && !scalarDefault(column.default)))) {
			throw new Error(`${before.name}.${column.name} 需要显式迁移规则`);
		}
		const next = { ...state, columns: [...state.columns, column] };
		steps.push(change(`ALTER TABLE ${tableSql} ADD COLUMN ${sqlColumn(column, dialect)}`, state, next));
		state = next;
	}
	for (const check of newChecks) {
		const next = { ...state, checks: [...state.checks, check] };
		steps.push(change(`ALTER TABLE ${tableSql} ADD CHECK (${check})`, state, next));
		state = next;
	}
	for (const index of newIndexes) {
		if (!historical && (index.unique || index.where)) throw new Error(`索引 ${index.name} 需要显式迁移规则`);
		const next = { ...state, indexes: [...state.indexes, index] };
		steps.push(change(createIndex(before.name, index, dialect), state, next));
		state = next;
	}
	return steps;
}

export function additiveSteps(before: Schema, after: Schema, dialect: Dialect, historical = false) {
	const targets = new Map(after.map((table) => [table.name, table]));
	const original = new Set(before.map((table) => table.name));
	const steps = before.flatMap((table) => {
		const next = targets.get(table.name);
		if (!next) throw new Error(`删除表 ${table.name} 需要显式迁移规则`);
		return growTable(table, next, dialect, historical);
	});
	for (const table of orderedNewTables(
		after.filter((table) => !original.has(table.name)),
		original,
	)) {
		steps.push(...createTableSteps(table, dialect));
	}
	return steps;
}

export function sameSchema(before: Schema, after: Schema) {
	return (
		sameValue(
			before.map((table) => table.name),
			after.map((table) => table.name),
		) && before.every((table, position) => !tableDifference(table, after[position] ?? null))
	);
}
