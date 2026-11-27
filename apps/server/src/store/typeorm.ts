import {
	type ColumnOptions,
	DataSource,
	type DataSourceOptions,
	getMetadataArgsStorage,
	type TableColumn,
} from "typeorm";
import { ConnectionMetadataBuilder } from "typeorm/connection/ConnectionMetadataBuilder.js";
import { MetadataArgsStorage } from "typeorm/metadata-args/MetadataArgsStorage.js";
import { EntityMetadataBuilder } from "typeorm/metadata-builder/EntityMetadataBuilder.js";
import { EntityMetadataValidator } from "typeorm/metadata-builder/EntityMetadataValidator.js";
import { ObjectUtils } from "typeorm/util/ObjectUtils.js";
import { readEntityDefinition } from "../entity/definition.ts";
import { entityClasses } from "../entity/tables/index.ts";
import { forDialect } from "./metadata/dialect.ts";
import type { Column, Dialect, Schema } from "./metadata/model.ts";

type KitSourceOptions = DataSourceOptions & {
	type: "mysql" | "postgres" | "better-sqlite3";
};

function columnOptions(column: Column, declared: ColumnOptions | undefined): ColumnOptions {
	const match = /^([a-z ]+)(?:\(([0-9]+)\))?$/.exec(column.type.toLowerCase());
	if (!match) throw new Error(`不支持的实体列类型：${column.type}`);
	let value = declared?.default;
	if (column.default === undefined) value = undefined;
	else if (typeof value === "string" && /^'(?:[^']|'')*'$/.test(column.default))
		value = column.default.slice(1, -1).replaceAll("''", "'");
	return {
		...declared,
		type: match[1] as ColumnOptions["type"],
		length: match[2] ? Number(match[2]) : undefined,
		nullable: column.nullable,
		collation: column.collation,
		default: value,
		...(column.collation === "ascii_general_ci" ? { charset: "ascii" } : {}),
		...(column.generated
			? { generatedType: "STORED", asExpression: column.generated, insert: false, update: false }
			: {}),
	};
}

/** 保留类、外键、转换器与装饰器身份，只为当前连接替换方言相关的列与约束参数。 */
function connectionDecorators(tables: Schema) {
	const declared = getMetadataArgsStorage();
	const columns = [];
	const checks = [];
	const indices = [];
	for (const table of tables) {
		const target = entityClasses[table.name as keyof typeof entityClasses];
		const fields = new Map(declared.filterColumns(target).map((field) => [field.propertyName, field]));
		for (const column of table.columns) {
			const field = fields.get(column.name);
			columns.push({
				...field,
				target,
				propertyName: column.name,
				mode: field?.mode ?? ("regular" as const),
				options: columnOptions(column, field?.options),
			});
		}
		for (const expression of table.checks) checks.push({ target, expression });
		for (const index of table.indexes)
			indices.push({
				target,
				name: index.name,
				unique: index.unique,
				where: index.where,
				columns: index.columns.map((column) => column.replace(/\(\d+\)$/, "")),
			});
	}
	return Object.assign(new MetadataArgsStorage(), declared, { columns, checks, indices });
}

/** 各驱动共享原始的实体类，数据库方言与元数据则属于各自的 DataSource。 */
export class KitEntityDataSource extends DataSource {
	readonly dialect: Dialect;
	readonly tables: Schema;

	constructor(options: KitSourceOptions) {
		const classes = Object.values(entityClasses);
		super({
			...options,
			entities: classes,
			synchronize: false,
			migrationsRun: false,
			dropSchema: false,
			logging: false,
		});
		this.dialect = options.type === "better-sqlite3" ? "sqlite" : options.type;
		this.tables = forDialect(readEntityDefinition(), this.dialect);
		const metadatas = new EntityMetadataBuilder(this, connectionDecorators(this.tables)).build(classes);
		if (this.dialect === "postgres") {
			// 已发布 PostgreSQL 表用 SQL 标准 identity；TypeORM 默认将 increment 渲染为 SERIAL。
			for (const entity of metadatas) {
				for (const column of entity.generatedColumns) {
					if (column.generationStrategy === "increment") {
						// TypeORM 接受 PrimaryGeneratedColumn("identity")，其 ColumnMetadata 声明遗漏了该策略。
						const generation: Pick<TableColumn, "generationStrategy" | "generatedIdentity"> = column;
						generation.generationStrategy = "identity";
						generation.generatedIdentity = "BY DEFAULT";
					}
				}
			}
		}
		new EntityMetadataValidator().validateMany(metadatas, this.driver);
		this.entityMetadatas.push(...metadatas);
		for (const metadata of metadatas) this.entityMetadatasMap.set(metadata.target, metadata);
	}

	// 构造时即可离线核对三库元数据。initialize 复用同一映射，按 TypeORM 生命周期加载订阅者与迁移。
	protected override async buildMetadatas(): Promise<void> {
		const builder = new ConnectionMetadataBuilder(this);
		const subscribers = await builder.buildSubscribers(ObjectUtils.mixedListToArray(this.options.subscribers ?? []));
		const migrations = await builder.buildMigrations(ObjectUtils.mixedListToArray(this.options.migrations ?? []));
		this.subscribers.splice(0, this.subscribers.length, ...subscribers);
		this.migrations.splice(0, this.migrations.length, ...migrations);
	}
}

export function createEntityDataSource(options: KitSourceOptions): KitEntityDataSource {
	return new KitEntityDataSource(options);
}
