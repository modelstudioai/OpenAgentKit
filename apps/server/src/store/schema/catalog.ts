import type { SqlValue } from "../database.ts";
import type { Column, ForeignKey, Index, Table } from "./model.ts";

export interface MigrationConnection {
	rows<T>(sql: string, ...values: SqlValue[]): Promise<T[]>;
	execute(sql: string, ...values: SqlValue[]): Promise<void>;
}

export type ExternalDialect = "mysql" | "postgres";

interface ColumnRow {
	name: string;
	type: string;
	nullable: "YES" | "NO";
	default_value: string | null;
	collation: string | null;
	identity: string | null;
	generated_sql: string | null;
	engine?: string;
	table_collation?: string;
}

interface IndexRow {
	name: string;
	column_name: string;
	is_unique: number | boolean;
	is_primary: number | boolean;
	predicate: string | null;
	implicit_unique?: boolean;
	prefix?: number | null;
}

interface ForeignKeyRow {
	name: string;
	column_name: string;
	reference_table: string;
	reference_column: string;
	on_delete: string;
	on_update: string;
}

const mysqlColumns = `SELECT c.column_name AS name, c.column_type AS type,
	c.is_nullable AS nullable, c.column_default AS default_value,
	NULLIF(c.collation_name, t.table_collation) AS collation, c.extra AS identity,
	NULLIF(c.generation_expression, '') AS generated_sql, t.engine AS engine,
	t.table_collation AS table_collation
	FROM information_schema.columns c JOIN information_schema.tables t
	  ON c.table_schema = t.table_schema AND c.table_name = t.table_name
	WHERE c.table_schema = DATABASE() AND c.table_name = ?
	ORDER BY c.ordinal_position`;

const pgColumns = `SELECT column_name AS name, CASE data_type
	    WHEN 'character varying' THEN 'varchar(' || character_maximum_length || ')'
	    WHEN 'integer' THEN 'int'
	    ELSE data_type END AS type,
	is_nullable AS nullable, column_default AS default_value, collation_name AS collation,
	identity_generation AS identity, generation_expression AS generated_sql
	FROM information_schema.columns
	WHERE table_schema = current_schema() AND table_name = ?
	ORDER BY ordinal_position`;

const mysqlIndexes = `SELECT index_name AS name, column_name AS column_name, non_unique = 0 AS is_unique,
	index_name = 'PRIMARY' AS is_primary, sub_part AS prefix, NULL AS predicate
	FROM information_schema.statistics
	WHERE table_schema = DATABASE() AND table_name = ?
	ORDER BY index_name, seq_in_index`;

const pgIndexes = `SELECT ix.relname AS name, COALESCE(a.attname, pg_get_indexdef(i.indexrelid, pos.n::integer, true)) AS column_name,
	i.indisunique AS is_unique, i.indisprimary AS is_primary,
	EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = ix.oid AND c.contype = 'u') AS implicit_unique,
	pg_get_expr(i.indpred, i.indrelid) AS predicate
	FROM pg_index i JOIN pg_class tbl ON tbl.oid = i.indrelid
	JOIN pg_class ix ON ix.oid = i.indexrelid
	JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
	JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS pos(attnum, n) ON true
	LEFT JOIN pg_attribute a ON a.attrelid = tbl.oid AND a.attnum = pos.attnum
	WHERE ns.nspname = current_schema() AND tbl.relname = ? AND i.indisvalid
	ORDER BY ix.relname, pos.n`;

const mysqlReferences = `SELECT k.constraint_name AS name, k.column_name AS column_name,
	k.referenced_table_name AS reference_table, k.referenced_column_name AS reference_column,
	r.delete_rule AS on_delete, r.update_rule AS on_update
	FROM information_schema.key_column_usage k JOIN information_schema.referential_constraints r
	  ON k.constraint_schema = r.constraint_schema AND k.constraint_name = r.constraint_name
	  AND k.table_name = r.table_name
	WHERE k.table_schema = DATABASE() AND k.table_name = ? AND k.referenced_table_name IS NOT NULL
	ORDER BY k.constraint_name, k.ordinal_position`;

const pgReferences = `SELECT c.conname AS name, a.attname AS column_name, ref.relname AS reference_table,
	refa.attname AS reference_column, c.confdeltype AS on_delete, c.confupdtype AS on_update
	FROM pg_constraint c JOIN pg_class tbl ON tbl.oid = c.conrelid
	JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
	JOIN pg_class ref ON ref.oid = c.confrelid
	JOIN LATERAL generate_subscripts(c.conkey, 1) AS pos(n) ON true
	JOIN pg_attribute a ON a.attrelid = tbl.oid AND a.attnum = c.conkey[pos.n]
	JOIN pg_attribute refa ON refa.attrelid = ref.oid AND refa.attnum = c.confkey[pos.n]
	WHERE ns.nspname = current_schema() AND tbl.relname = ? AND c.contype = 'f'
	ORDER BY c.conname, pos.n`;

const mysqlChecks = `SELECT c.check_clause AS expression
	FROM information_schema.table_constraints t JOIN information_schema.check_constraints c
	  ON t.constraint_schema = c.constraint_schema AND t.constraint_name = c.constraint_name
	WHERE t.table_schema = DATABASE() AND t.table_name = ? AND t.constraint_type = 'CHECK' AND t.enforced = 'YES'`;

const pgChecks = `SELECT pg_get_expr(c.conbin, c.conrelid) AS expression
	FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace ns ON ns.oid = t.relnamespace
	WHERE ns.nspname = current_schema() AND t.relname = ? AND c.contype = 'c' AND c.convalidated`;

function mysqlExpression(sql: string) {
	// INFORMATION_SCHEMA 将表达式中的字面量分隔符转义了一层。
	return sql.replaceAll("\\'", "'").replace(/convert\(0x([a-f0-9]+) using utf8mb4\)/gi, (_, hex: string) => {
		const value = Buffer.from(hex, "hex").toString("utf8");
		return `'${value.replaceAll("'", "''")}'`;
	});
}

function defaultValue(row: ColumnRow, dialect: ExternalDialect) {
	if (row.default_value == null) return undefined;
	if (dialect === "postgres") return String(row.default_value);
	if (row.identity?.includes("DEFAULT_GENERATED")) return mysqlExpression(String(row.default_value));
	if (/^(?:varchar|text|longtext)/i.test(row.type)) return `'${String(row.default_value).replaceAll("'", "''")}'`;
	return String(row.default_value);
}

function column(row: ColumnRow, dialect: ExternalDialect): Column {
	const value = defaultValue(row, dialect);
	const identity = dialect === "mysql" ? row.identity?.includes("auto_increment") : row.identity === "BY DEFAULT";
	return {
		name: row.name,
		type: row.type,
		nullable: row.nullable === "YES",
		...(identity ? { identity } : {}),
		...(value != null && !identity ? { default: value } : {}),
		...(row.collation ? { collation: row.collation } : {}),
		...(row.generated_sql
			? { generated: dialect === "mysql" ? mysqlExpression(row.generated_sql) : row.generated_sql }
			: {}),
	};
}

function indexColumn(row: IndexRow) {
	return row.prefix == null ? row.column_name : `${row.column_name}(${row.prefix})`;
}

function indexes(rows: IndexRow[], expectedNames: ReadonlySet<string>) {
	const grouped = new Map<string, Index>();
	const primary = rows.filter((row) => row.is_primary).map(indexColumn);
	const unnamed = new Set<string>();
	for (const row of rows) {
		if (row.is_primary) continue;
		let index = grouped.get(row.name);
		if (!index) {
			index = {
				name: row.name,
				columns: [],
				unique: Boolean(row.is_unique),
				...(row.predicate ? { where: row.predicate } : {}),
			};
			grouped.set(row.name, index);
			if (row.implicit_unique ?? (index.unique && !expectedNames.has(index.name))) unnamed.add(row.name);
		}
		index.columns.push(indexColumn(row));
	}
	const keys = [...grouped.values()];
	return {
		primary,
		unique: keys.filter((index) => unnamed.has(index.name)).map((index) => index.columns),
		indexes: keys.filter((index) => !unnamed.has(index.name)),
	};
}

const foreignActions: Record<string, string> = {
	a: "NO ACTION",
	r: "NO ACTION",
	c: "CASCADE",
	n: "SET NULL",
	d: "SET DEFAULT",
	RESTRICT: "NO ACTION",
};

function references(rows: ForeignKeyRow[]) {
	const groups = new Map<string, ForeignKey>();
	for (const row of rows) {
		let key = groups.get(row.name);
		if (!key) {
			key = {
				columns: [],
				table: row.reference_table,
				references: [],
				onDelete: foreignActions[row.on_delete] ?? row.on_delete,
				onUpdate: foreignActions[row.on_update] ?? row.on_update,
			};
			groups.set(row.name, key);
		}
		key.columns.push(row.column_name);
		key.references.push(row.reference_column);
	}
	return [...groups.values()];
}

export async function readExternalTable(
	db: MigrationConnection,
	dialect: ExternalDialect,
	name: string,
	expectedIndexes: ReadonlySet<string>,
): Promise<Table | null> {
	const mysql = dialect === "mysql";
	const columns = await db.rows<ColumnRow>(mysql ? mysqlColumns : pgColumns, name);
	if (!columns.length) return null;
	if (mysql && (columns[0]!.engine !== "InnoDB" || columns[0]!.table_collation !== "utf8mb4_0900_bin")) {
		// SHOW CREATE 的物理属性不含业务数据，用结构差异提示调用方。
		return {
			name,
			columns: columns.map((row) => ({ ...column(row, dialect), type: `${row.type} (engine/collation mismatch)` })),
			primary: [],
			unique: [],
			indexes: [],
			foreignKeys: [],
			checks: [],
		};
	}
	const list = await db.rows<IndexRow>(mysql ? mysqlIndexes : pgIndexes, name);
	const keys = await db.rows<ForeignKeyRow>(mysql ? mysqlReferences : pgReferences, name);
	const constraints = await db.rows<{ expression: string }>(mysql ? mysqlChecks : pgChecks, name);
	return {
		name,
		columns: columns.map((row) => column(row, dialect)),
		...indexes(list, expectedIndexes),
		foreignKeys: references(keys),
		checks: constraints.map((row) => (mysql ? mysqlExpression(row.expression) : row.expression)),
	};
}

export async function externalTableNames(db: MigrationConnection, dialect: ExternalDialect) {
	const schema = dialect === "mysql" ? "DATABASE()" : "current_schema()";
	const rows = await db.rows<{ name: string }>(`SELECT table_name AS name FROM information_schema.tables
		WHERE table_schema = ${schema} AND table_type = 'BASE TABLE'`);
	return rows.map((row) => row.name);
}
