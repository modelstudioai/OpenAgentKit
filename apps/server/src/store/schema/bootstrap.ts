import type { entityClasses } from "../../entity/tables/index.ts";
import { type Dialect, identifier, type Schema } from "./model.ts";
import { createTableSteps, orderedNewTables } from "./render.ts";

/** 新库直接建立当前实体结构。只向空库写入产品初始数据。 */
export function initialTableSteps(schema: Schema, dialect: Dialect) {
	const tables = [...schema].sort((left, right) => left.name.localeCompare(right.name, "en"));
	return orderedNewTables(tables).flatMap((table) => createTableSteps(table, dialect));
}

type Entities = typeof entityClasses;
type SeedFields<Entity> = { [K in keyof Entity]?: Extract<Entity[K], string | number> };

/** 三库共用的种子 SQL 仅接受安全整数和文本。反斜线在不同 MySQL 模式中的转义语义不同。 */
function seedLiteral(value: unknown) {
	if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
	if (typeof value === "string" && !value.includes("\\") && !value.includes("\0")) {
		return `'${value.replaceAll("'", "''")}'`;
	}
	throw new Error("实体种子需要可跨数据库写入的文本或整数");
}

function seedInsert<Name extends keyof Entities>(table: Name, row: SeedFields<InstanceType<Entities[NoInfer<Name>]>>) {
	const columns = Object.keys(row);
	// 校验标识符，保留已有基线指纹中的未引号 SQL 拼写。
	for (const name of [table, ...columns]) identifier(name, "sqlite");
	const values = Object.values(row).map(seedLiteral);
	return `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${values.join(", ")})`;
}

/** 此批种子随第一个实体基线发布。修改初始值时保留旧版种子供中断的 MySQL 建库继续使用。 */
export const initialRows = [
	seedInsert("quota_policy", { id: 1, monthly_credits: 200 }),
	seedInsert("kit_usage_limit_policy", { id: 1 }),
	seedInsert("kit_branding", { id: 1, product_name: "OpenAgentKit", updated_at: "2026-11-13T00:00:00.000Z" }),
];
