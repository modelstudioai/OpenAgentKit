import { type Column, type Dialect, type Index, identifier, type Schema, type Table } from "./model.ts";

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
	// SHA-256 摘要参与 MySQL 主键和唯一键。保留已应用的 PostgreSQL 列类型。
	if (
		dialect === "mysql" &&
		table.name === "kit_oidc_member_bindings" &&
		(name === "subject_key" || name === "issuer_key")
	)
		return "VARCHAR(64)";
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
	const indexes = table.indexes.map((index) => {
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
	// 显式登记外键索引，保证 InnoDB 建表后的结构与迁移定义一致。
	if (dialect === "mysql" && table.name === "kit_oidc_member_bindings")
		indexes.push({ name: "idx_oidc_member_bindings_member", columns: ["member_id"], unique: false });
	return indexes;
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

export function columnDefault(column: Column, dialect: Dialect) {
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

export function expressionSql(expression: string, dialect: Dialect) {
	if (dialect !== "mysql") return expression;
	return expression.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"/g, (token) =>
		token.startsWith('"') ? identifier(token.slice(1, -1), dialect) : token,
	);
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
