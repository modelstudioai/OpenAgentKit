import { type Schema, tableDifference } from "../store/metadata/model.ts";
import { readEntityDefinition } from "./definition.ts";

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
