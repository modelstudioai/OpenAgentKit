import type { DatabaseSync } from "node:sqlite";
import { type Column, type ForeignKey, type Index, identifier, type Schema, splitSql, type Table } from "./model.ts";

type ColumnRow = { name: string; type: string; notnull: number; pk: number; dflt_value: string | null };
type IndexRow = { name: string; origin: string; unique: number };
type ReferenceRow = {
	id: number;
	seq: number;
	table: string;
	from: string;
	to: string;
	on_delete: string;
	on_update: string;
};

function tableTerms(sql: string) {
	return splitSql(sql.slice(sql.indexOf("(") + 1, sql.lastIndexOf(")")), ",");
}

function termName(term: string) {
	return term
		.match(/^(?:"([^"]+)"|([a-z_][a-z0-9_]*))/i)
		?.slice(1)
		.find(Boolean);
}

function expression(term: string, start: number) {
	let depth = 0;
	const first = term.indexOf("(", start);
	const tokens = term.slice(first).match(/'(?:''|[^'])*'|"(?:""|[^"])*"|./gs) ?? [];
	let offset = first;
	for (const token of tokens) {
		offset += token.length;
		if (token === "(") depth++;
		if (token === ")") depth--;
		if (depth === 0) return term.slice(first + 1, offset - 1);
	}
	throw new Error(`无效的 SQLite 约束：${term}`);
}

function readColumns(db: DatabaseSync, name: string, terms: string[]) {
	const rows = db.prepare("SELECT * FROM pragma_table_xinfo(?)").all(name) as unknown as (ColumnRow & {
		hidden: number;
	})[];
	const columns = rows.map((row): Column => {
		const term = terms.find((part) => termName(part) === row.name) ?? "";
		if (row.hidden) throw new Error(`共享表定义暂不支持 SQLite 生成列：${name}.${row.name}`);
		const collation = term.match(/\bCOLLATE\s+(\w+)/i)?.[1]?.toUpperCase();
		return {
			name: row.name,
			type: row.type.toUpperCase(),
			nullable: !row.notnull,
			...(row.dflt_value == null ? {} : { default: row.dflt_value }),
			...(/\bAUTOINCREMENT\b/i.test(term) ? { identity: true } : {}),
			...(collation ? { collation } : {}),
		};
	});
	const primary = rows
		.filter((row) => row.pk)
		.sort((a, b) => a.pk - b.pk)
		.map((row) => row.name);
	return { columns, primary };
}

function readIndexes(db: DatabaseSync, name: string, managedIndexes?: ReadonlySet<string>) {
	const unique: string[][] = [];
	const indexes: Index[] = [];
	const rows = db.prepare("SELECT * FROM pragma_index_list(?)").all(name) as unknown as IndexRow[];
	for (const index of rows) {
		if (index.origin === "pk") continue;
		if (managedIndexes && !index.unique && !managedIndexes.has(index.name)) continue;
		const columns = db
			.prepare("SELECT name FROM pragma_index_info(?) ORDER BY seqno")
			.all(index.name)
			.map((row) => row.name);
		if (!columns.every((column): column is string => typeof column === "string")) {
			throw new Error(`共享表定义暂不支持表达式索引：${index.name}`);
		}
		if (index.origin === "u") {
			unique.push(columns);
			continue;
		}
		const sql = db.prepare("SELECT sql FROM sqlite_schema WHERE name = ?").get(index.name)?.sql as string;
		const tail = sql.match(/\)\s*WHERE\s+([\s\S]+)$/i)?.[1];
		indexes.push({ name: index.name, columns, unique: Boolean(index.unique), ...(tail ? { where: tail } : {}) });
	}
	return { unique, indexes: indexes.sort((a, b) => a.name.localeCompare(b.name, "en")) };
}

function readReferences(db: DatabaseSync, name: string): ForeignKey[] {
	const rows = db
		.prepare("SELECT * FROM pragma_foreign_key_list(?) ORDER BY id, seq")
		.all(name) as unknown as ReferenceRow[];
	const groups = new Map<number, ForeignKey>();
	for (const row of rows) {
		let key = groups.get(row.id);
		if (!key) {
			key = { table: row.table, columns: [], references: [], onDelete: row.on_delete, onUpdate: row.on_update };
			groups.set(row.id, key);
		}
		if (!row.to) throw new Error(`请显式给出外键引用列：${name}.${row.from}`);
		key.columns.push(row.from);
		key.references.push(row.to);
	}
	return [...groups.values()];
}

export function readSqliteTable(db: DatabaseSync, name: string, managedIndexes?: ReadonlySet<string>): Table | null {
	const entry = db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?").get(name);
	if (!entry) return null;
	const sql = String(entry.sql);
	const terms = tableTerms(sql);
	const checks = terms.flatMap((term) =>
		[...term.matchAll(/\bCHECK\s*\(/gi)].map((match) => expression(term, match.index)),
	);
	return {
		name,
		...readColumns(db, name, terms),
		...readIndexes(db, name, managedIndexes),
		foreignKeys: readReferences(db, name),
		checks,
	};
}

export function readSqliteSchema(db: DatabaseSync): Schema {
	const rows = db
		.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
		.all();
	return rows.map((row) => {
		const name = String(row.name);
		identifier(name, "sqlite");
		const table = readSqliteTable(db, name);
		if (!table) throw new Error(`缺少 SQLite 表：${name}`);
		return table;
	});
}
