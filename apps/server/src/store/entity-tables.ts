import { type DataSource, Table, TableForeignKey, type TableIndex } from "typeorm";
import type { BetterSqlite3Driver } from "typeorm/driver/better-sqlite3/BetterSqlite3Driver.js";
import { BetterSqlite3QueryRunner } from "typeorm/driver/better-sqlite3/BetterSqlite3QueryRunner.js";
import type { MysqlDriver } from "typeorm/driver/mysql/MysqlDriver.js";
import { MysqlQueryRunner } from "typeorm/driver/mysql/MysqlQueryRunner.js";
import type { PostgresDriver } from "typeorm/driver/postgres/PostgresDriver.js";
import { PostgresQueryRunner } from "typeorm/driver/postgres/PostgresQueryRunner.js";
import { entityClasses } from "../entity/tables/index.ts";
import { columnDefault, expressionSql, mysqlTableOptions, orderedNewTables } from "./metadata/dialect.ts";
import {
	type DdlStep,
	type Dialect,
	type Index,
	identifier,
	type Table as PhysicalTable,
	type Schema,
} from "./metadata/model.ts";
import { KitEntityDataSource } from "./typeorm.ts";

export function currentTables(source: DataSource, dialect: Dialect): Schema {
	if (!(source instanceof KitEntityDataSource) || source.dialect !== dialect)
		throw new Error("实体连接与数据库方言不一致");
	return source.tables;
}

// 使用驱动自身的建表、建索引语句。由调用方在持有迁移锁的连接上执行，并登记本次已覆盖的版本。
class SqliteStatements extends BetterSqlite3QueryRunner {
	table(table: Table) {
		return this.createTableSql(table, true).query;
	}
	index(table: Table, index: TableIndex) {
		return this.createIndexSql(table, index).query;
	}
}

class PostgresStatements extends PostgresQueryRunner {
	table(table: Table) {
		return this.createTableSql(table, true).query;
	}
	index(table: Table, index: TableIndex) {
		return this.createIndexSql(table, index).query;
	}
}

function mysqlPrefixIndex(index: Index) {
	const columns = index.columns.map((column) => {
		const match = /^([a-z_][a-z0-9_]*)(\([1-9][0-9]*\))?$/.exec(column);
		if (!match) throw new Error(`无效的 MySQL 索引列：${column}`);
		return identifier(match[1]!, "mysql") + (match[2] ?? "");
	});
	return `${index.unique ? "UNIQUE " : ""}INDEX ${identifier(index.name, "mysql")} (${columns.join(", ")})`;
}

class MysqlStatements extends MysqlQueryRunner {
	table(table: Table, expected: PhysicalTable) {
		// MySQL 驱动不输出 CHECK，也不支持索引前缀长度。这两项与表排序规则一起补在同一个建表步骤。
		const prefixed = expected.indexes.filter((index) => index.columns.some((column) => column.includes("(")));
		table.indices = table.indices.filter((index) => !prefixed.some((key) => key.name === index.name));
		const extra = [
			...table.checks.map((check) => `CHECK (${expressionSql(check.expression!, "mysql")})`),
			...prefixed.map(mysqlPrefixIndex),
		];
		const sql = this.createTableSql(table, true).query;
		const ending = ") ENGINE=InnoDB";
		if (!sql.endsWith(ending)) throw new Error("无法设置 MySQL 实体表选项");
		const constraints = extra.length ? `, ${extra.join(", ")}` : "";
		return `${sql.slice(0, -ending.length)}${constraints}) ${mysqlTableOptions}`;
	}
}

function nativeTable(source: DataSource, expected: PhysicalTable, dialect: Dialect) {
	const metadata = source.getMetadata(entityClasses[expected.name as keyof typeof entityClasses]);
	const table = Table.create(metadata, source.driver);
	table.foreignKeys = metadata.foreignKeys.map((key) => TableForeignKey.create(key, source.driver));
	for (const column of table.columns) {
		const physical = expected.columns.find((field) => field.name === column.name)!;
		// 使用实体声明的 SQL 默认值，并保留 MySQL 对 TEXT 默认值的表达式要求。
		if (physical.default !== undefined) column.default = columnDefault(physical, dialect);
	}
	return table;
}

function step(sql: string, before: PhysicalTable | null, after: PhysicalTable): DdlStep {
	return { sql, changes: [{ name: after.name, before, after }] };
}

export function entityTableSteps(source: DataSource, dialect: Dialect): DdlStep[] {
	const tables = [...currentTables(source, dialect)].sort((a, b) => a.name.localeCompare(b.name, "en"));
	const statements =
		dialect === "mysql"
			? new MysqlStatements(source.driver as MysqlDriver, "master")
			: dialect === "postgres"
				? new PostgresStatements(source.driver as PostgresDriver, "master")
				: new SqliteStatements(source.driver as BetterSqlite3Driver);
	return orderedNewTables(tables).flatMap((expected) => {
		const table = nativeTable(source, expected, dialect);
		if (statements instanceof MysqlStatements) return [step(statements.table(table, expected), null, expected)];
		let state: PhysicalTable = { ...expected, indexes: [] };
		const steps = [step(statements.table(table), null, state)];
		for (const index of expected.indexes) {
			const bound = table.indices.find((candidate) => candidate.name === index.name);
			if (!bound) throw new Error(`实体索引未映射：${expected.name}.${index.name}`);
			const next = { ...state, indexes: [...state.indexes, index] };
			steps.push(step(statements.index(table, bound), state, next));
			state = next;
		}
		return steps;
	});
}
