import { EntitySchema, type EntitySchemaColumnOptions, type EntitySchemaOptions } from "typeorm";
import { type Column, normalizeExpression, type Schema, type Table, tableDifference } from "../store/schema/model.ts";
import { decoratedTable, readEntityDefinition, sqlType } from "./definition.ts";

function defaultValue(sql?: string) {
	if (sql === undefined) return undefined;
	const value = sql.trim();
	if (/^'(?:''|[^'])*'$/.test(value)) return value.slice(1, -1).replaceAll("''", "'");
	if (/^null$/i.test(value)) return null;
	if (/^(true|false)$/i.test(value)) return value.toLowerCase() === "true";
	if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) {
		const numeric = Number(value);
		if (Number.isFinite(numeric) && (!Number.isInteger(numeric) || Number.isSafeInteger(numeric))) return numeric;
	}
	// TypeORM 接受返回 SQL 的函数来表达 CURRENT_TIMESTAMP 等数据库默认值。
	return () => sql;
}

function defaultKey(value: unknown) {
	return typeof value === "function" ? `sql:${normalizeExpression(value())}` : JSON.stringify(value);
}

/** 对照已有版本快照或实际数据库，报告首个发生变化的表和列。 */
export function validateEntityDefinitions(schema: Schema): void {
	const tables = new Map(schema.map((table) => [table.name, table]));
	const entities = readEntityDefinition();
	if (tables.size !== entities.length || tables.size !== schema.length) throw new Error("实体与数据库表清单不一致");
	for (const entity of entities) {
		const actual = tables.get(entity.name);
		const difference = tableDifference(entity, actual ?? null);
		if (difference) {
			const column = entity.columns.find((expected) => {
				const match = actual?.columns.find((col) => col.name === expected.name);
				return !match || tableDifference({ ...entity, columns: [expected] }, { ...entity, columns: [match] });
			});
			throw new Error(`实体与数据库结构不一致：${entity.name}${column ? `.${column.name}` : ""}（${difference}）`);
		}
	}
}

function physicalType(column: Column): Pick<EntitySchemaColumnOptions, "type" | "length"> {
	const [, type, length] = /^([a-z ]+)(?:\(([0-9]+)\))?$/.exec(column.type.toLowerCase()) ?? [];
	if (!type) throw new Error(`无法映射实体列 ${column.name} 的物理类型 ${column.type}`);
	return { type: type as EntitySchemaColumnOptions["type"], ...(length ? { length: Number(length) } : {}) };
}

function databaseColumn(table: Table, column: Column, declared?: EntitySchemaColumnOptions): EntitySchemaColumnOptions {
	if (!declared) {
		// MySQL 用计算列实现部分唯一索引；这是物理列，无需给所有方言的实体添加属性。
		if (!column.generated) throw new Error(`缺少实体列：${table.name}.${column.name}`);
		return {
			...physicalType(column),
			nullable: column.nullable,
			asExpression: column.generated,
			generatedType: "STORED",
		};
	}
	const options = { ...declared };
	if (sqlType(options) !== column.type.toUpperCase()) {
		delete options.length;
		Object.assign(options, physicalType(column));
	}
	if (options.primary) options.nullable = column.nullable;
	if (options.collation !== column.collation) options.collation = column.collation;
	const physicalDefault = defaultValue(column.default);
	if (defaultKey(options.default) !== defaultKey(physicalDefault)) options.default = physicalDefault;
	return options;
}

type KeyOptions = NonNullable<EntitySchemaOptions<object>["foreignKeys"]>[number];

/** 单独为每个连接投影方言差异，保留原生装饰器元数据供其他 DataSource 复用。 */
export function createEntitySchemas(schema: Schema) {
	return schema.map((table) => {
		const { target, columns } = decoratedTable(table.name);
		return new EntitySchema({
			name: target.name,
			target,
			tableName: table.name,
			columns: Object.fromEntries(
				table.columns.map((column) => [column.name, databaseColumn(table, column, columns.get(column.name))]),
			),
			indices: table.indexes.map((index) => ({
				...index,
				// MySQL 的物理索引前缀长度由迁移 DDL 应用。ORM 索引按实体属性引用列。
				columns: index.columns.map((column) => column.replace(/\(\d+\)$/, "")),
			})),
			uniques: table.unique
				.filter((key) => key.length > 1 || !columns.get(key[0]!)?.unique)
				.map((key) => ({ columns: key })),
			checks: table.checks.map((expression) => ({ expression })),
			foreignKeys: table.foreignKeys.map((key) => ({
				target: key.table,
				columnNames: key.columns,
				referencedColumnNames: key.references,
				onDelete: key.onDelete as KeyOptions["onDelete"],
				onUpdate: key.onUpdate as KeyOptions["onUpdate"],
			})),
			synchronize: false,
		});
	});
}
