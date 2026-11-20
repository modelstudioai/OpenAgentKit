import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { type Dialect, type Migration, type Schema, type Step, splitSql, tableDifference } from "./model.ts";
import { additiveSteps, createTableSteps, forDialect, orderedNewTables, sameSchema } from "./render.ts";
import { readSqliteSchema } from "./sqlite-model.ts";

export const dialects = ["sqlite", "mysql", "postgres"] as const;
const explicitSchema = z.strictObject({
	sqliteRebuild: z.boolean().optional(),
	steps: z
		.array(
			z.strictObject({
				kind: z.enum(["ddl", "data"]),
				sqlite: z.string().min(1),
				mysql: z.string().min(1),
				postgres: z.string().min(1),
			}),
		)
		.min(1),
});

export type ExplicitMigration = z.infer<typeof explicitSchema>;

export function parseExplicit(input: unknown): ExplicitMigration {
	return explicitSchema.parse(input);
}

function isDefinitionStatement(sql: string) {
	return /^CREATE (?:TABLE|(?:UNIQUE )?INDEX)\b/i.test(sql);
}

function rejectUnsupportedSQLite(sql: string) {
	const unquoted = sql.replace(/'(?:''|[^'])*'/g, "''");
	if (/\b(?:WITHOUT\s+ROWID|STRICT|DEFERRABLE|DESC|GENERATED|MATCH|ON\s+CONFLICT)\b/i.test(unquoted)) {
		throw new Error(`共享定义暂不支持的 SQLite 声明：${sql.split("\n")[0]}`);
	}
}

export function readDefinition(sql: string): Schema {
	const db = new DatabaseSync(":memory:");
	try {
		for (const statement of splitSql(sql)) {
			if (!isDefinitionStatement(statement)) throw new Error("共享定义仅接受 CREATE TABLE 和 CREATE INDEX");
			rejectUnsupportedSQLite(statement);
			db.exec(statement);
		}
		const schema = readSqliteSchema(db);
		validateReferences(schema);
		return schema;
	} finally {
		db.close();
	}
}

function validateReferences(schema: Schema) {
	for (const table of schema) {
		if (/^_kit_/.test(table.name)) throw new Error(`共享定义使用了迁移保留表名：${table.name}`);
		for (const key of table.foreignKeys) {
			const parent = schema.find((entry) => entry.name === key.table);
			if (!parent || !key.references.every((name) => parent.columns.some((column) => column.name === name))) {
				throw new Error(`外键目标不存在：${table.name} → ${key.table}`);
			}
		}
	}
}

function changesBetween(before: Schema, after: Schema) {
	const names = new Set([...before, ...after].map((table) => table.name));
	return [...names].flatMap((name) => {
		const old = before.find((table) => table.name === name) ?? null;
		const next = after.find((table) => table.name === name) ?? null;
		return tableDifference(old, next) ? [{ name, before: old, after: next }] : [];
	});
}

function checkExplicitStatement(kind: "ddl" | "data", dialect: Dialect, sql: string[]) {
	if (sql.length === 0) throw new Error(`显式迁移缺少 ${dialect} 语句`);
	if (kind === "data") {
		if (!sql.every((statement) => /^(?:INSERT|UPDATE|DELETE)\b/i.test(statement))) {
			throw new Error("显式数据步骤只接受 INSERT、UPDATE 或 DELETE");
		}
		return;
	}
	if (dialect === "mysql" && sql.length !== 1) throw new Error("MySQL 的每个 DDL 步骤必须是一条原子语句");
	if (dialect !== "sqlite" && !sql.every((statement) => /^(?:CREATE|ALTER|DROP|RENAME)\b/i.test(statement))) {
		throw new Error("外部库的结构步骤使用 DDL，数据变更放在数据步骤中");
	}
	if (
		dialect === "sqlite" &&
		!sql.every((statement) => /^(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)\b/i.test(statement))
	) {
		throw new Error("SQLite 结构步骤含不支持的语句");
	}
}

function explicitStatements(step: ExplicitMigration["steps"][number]) {
	return Object.fromEntries(
		dialects.map((dialect) => {
			const sql = splitSql(step[dialect]);
			checkExplicitStatement(step.kind, dialect, sql);
			return [dialect, sql];
		}),
	) as Record<Dialect, string[]>;
}

function explicitDdl(before: Schema, after: Schema, dialect: Dialect, sql: string[]) {
	const changes = changesBetween(forDialect(before, dialect), forDialect(after, dialect));
	if (!changes.length) throw new Error(`显式 DDL 在 ${dialect} 中缺少可验证的结构变更`);
	return { sql: sql.join(";\n"), changes };
}

function runExplicitSteps(db: DatabaseSync, before: Schema, spec: ExplicitMigration) {
	const steps: Record<Dialect, Step[]> = { sqlite: [], mysql: [], postgres: [] };
	let state = before;
	for (const step of spec.steps) {
		const statements = explicitStatements(step);
		for (const sql of statements.sqlite) db.exec(sql);
		if (step.kind === "data") {
			for (const dialect of dialects) steps[dialect].push({ data: statements[dialect] });
			continue;
		}
		const next = readSqliteSchema(db);
		for (const dialect of dialects) steps[dialect].push(explicitDdl(state, next, dialect, statements[dialect]));
		state = next;
	}
	return { steps, state };
}

function compileExplicit(before: Schema, target: Schema, spec: ExplicitMigration) {
	const db = new DatabaseSync(":memory:");
	try {
		for (const table of orderedNewTables(before)) {
			for (const step of createTableSteps(table, "sqlite")) db.exec(step.sql);
		}
		if (spec.sqliteRebuild) db.exec("PRAGMA foreign_keys = OFF");
		const { steps, state } = runExplicitSteps(db, before, spec);
		if (!sameSchema(state, target)) throw new Error("显式迁移结束后的结构与共享定义不符");
		return steps;
	} finally {
		db.close();
	}
}

export function compileChange(
	id: string,
	before: Schema,
	after: Schema,
	explicit?: ExplicitMigration,
): Record<Dialect, Migration> {
	const manual = explicit && compileExplicit(before, after, explicit);
	return Object.fromEntries(
		dialects.map((dialect) => [
			dialect,
			{
				id,
				steps: manual?.[dialect] ?? additiveSteps(forDialect(before, dialect), forDialect(after, dialect), dialect),
				...(dialect === "sqlite" && explicit?.sqliteRebuild ? { sqliteRebuild: true } : {}),
			},
		]),
	) as Record<Dialect, Migration>;
}
