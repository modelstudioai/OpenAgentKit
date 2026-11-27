import type { Dialect, Schema } from "../metadata/model.ts";
import { createTableSteps, orderedNewTables } from "./render.ts";

export { initialRows } from "../baseline.ts";

/** 重现旧版本空库建表步骤，供中断的初始化校验指纹并继续。 */
export function initialTableSteps(schema: Schema, dialect: Dialect) {
	const tables = [...schema].sort((left, right) => left.name.localeCompare(right.name, "en"));
	return orderedNewTables(tables).flatMap((table) => createTableSteps(table, dialect));
}
