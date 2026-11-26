import { type EntitySchemaColumnOptions, getMetadataArgsStorage } from "typeorm";
import type { Column, Schema, Table } from "../store/schema/model.ts";
import { createIndex, createTable } from "../store/schema/render.ts";
import { entityClasses } from "./tables/index.ts";

export function decoratedTable(name: string) {
	if (!Object.hasOwn(entityClasses, name)) throw new Error(`未注册表 ${name} 的实体类`);
	const target = entityClasses[name as keyof typeof entityClasses];
	const metadata = getMetadataArgsStorage();
	const tables = metadata.filterTables(target);
	if (tables.length !== 1 || tables[0]?.name !== name) throw new Error(`实体 ${target.name} 的表名应为 ${name}`);
	const columns = new Map<string, EntitySchemaColumnOptions>();
	for (const { propertyName, options } of metadata.columns.filter((entry) => entry.target === target)) {
		if (columns.has(propertyName) || (options.name && options.name !== propertyName)) {
			throw new Error(`实体属性与表列必须一一对应：${name}.${propertyName}`);
		}
		if (!options.type) throw new Error(`未声明实体列类型：${name}.${propertyName}`);
		const generation = metadata.findGenerated(target, propertyName)?.strategy;
		columns.set(propertyName, {
			type: options.type,
			length: options.length,
			nullable: options.nullable,
			primary: options.primary,
			unique: options.unique,
			collation: options.collation,
			default: options.default,
			generated: generation,
			transformer: options.transformer,
		});
	}
	return { target, columns };
}

export function sqlType(options: EntitySchemaColumnOptions) {
	return `${String(options.type).toUpperCase()}${options.length ? `(${options.length})` : ""}`;
}

function sqlDefault(value: unknown): string {
	if (typeof value === "function") return value();
	if (typeof value === "string") return `'${value.replaceAll("'", "''")}'`;
	if (value === null) return "NULL";
	if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	throw new Error("实体列需要 SQL 标量默认值或返回 SQL 表达式的函数");
}

function entityColumn(name: string, options: EntitySchemaColumnOptions): Column {
	if (options.generated && options.generated !== "increment") throw new Error(`不支持的列生成策略：${name}`);
	return {
		name,
		type: sqlType(options),
		// SQLite 的自增主键是 rowid 别名，PRAGMA table_xinfo 将其报告为可空。
		nullable: options.nullable ?? options.generated === "increment",
		...(options.default === undefined ? {} : { default: sqlDefault(options.default) }),
		...(options.generated ? { identity: true } : {}),
		...(options.collation ? { collation: options.collation } : {}),
	};
}

function entityTable(name: string): Table {
	const { target, columns } = decoratedTable(name);
	const metadata = getMetadataArgsStorage();
	const fields = [...columns];
	const propertyNames = Object.fromEntries(fields.map(([property]) => [property, property]));
	function columnNames(declared: string[] | ((properties: Record<string, string>) => unknown) | undefined) {
		const values = typeof declared === "function" ? declared(propertyNames) : declared;
		if (
			!Array.isArray(values) ||
			!values.length ||
			!values.every((key) => typeof key === "string" && columns.has(key))
		) {
			throw new Error(`实体约束引用了未登记的列：${name}`);
		}
		return values as string[];
	}
	const unique = metadata.filterUniques(target).map((key) => columnNames(key.columns));
	const indexes = metadata
		.filterIndices(target)
		.map((index) => {
			if (!index.name) throw new Error(`实体索引需要稳定名称：${name}`);
			return {
				name: index.name,
				columns: columnNames(index.columns),
				unique: Boolean(index.unique),
				...(index.where ? { where: index.where } : {}),
			};
		})
		.sort((left, right) => left.name.localeCompare(right.name, "en"));
	const foreignKeys = metadata.filterForeignKeys(target).map((key) => {
		const target = key.type;
		const reference =
			typeof target === "string"
				? target
				: typeof target === "function"
					? (metadata.filterTables(target)[0]?.name ??
						metadata.filterTables((target as () => new () => object)())[0]?.name)
					: undefined;
		if (!reference || !key.referencedColumnNames?.length || !key.columnNames) {
			throw new Error(`实体外键需要显式声明引用表和列：${name}`);
		}
		return {
			table: reference,
			columns: columnNames(key.columnNames),
			references: key.referencedColumnNames,
			onDelete: key.onDelete ?? "NO ACTION",
			onUpdate: key.onUpdate ?? "NO ACTION",
		};
	});
	return {
		name,
		columns: fields.map(([field, options]) => entityColumn(field, options)),
		primary: fields.filter(([, options]) => options.primary).map(([field]) => field),
		unique,
		indexes,
		foreignKeys,
		// TypeScript 自下而上应用类装饰器，约束快照按源码顺序输出。
		checks: metadata
			.filterChecks(target)
			.map((check) => check.expression)
			.reverse(),
	};
}

/** 实体字段、索引和约束共同定义当前逻辑结构。 */
export function readEntityDefinition(): Schema {
	return Object.keys(entityClasses).sort().map(entityTable);
}

/** 新增版本保存可复查的 SQL 快照，三库从同一逻辑结构派生。 */
export function renderEntityDefinition(schema: Schema = readEntityDefinition()): string {
	const statements = schema.flatMap((table) => [
		// SQLite 系统目录按声明的逆序列出外键，快照重读后需还原相同顺序。
		createTable({ ...table, foreignKeys: [...table.foreignKeys].reverse() }, "sqlite"),
		...table.indexes.map((index) => createIndex(table.name, index, "sqlite")),
	]);
	return `${statements.map((sql) => `${sql};`).join("\n\n")}\n`;
}
