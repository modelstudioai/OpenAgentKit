import type { StoreDatabase } from "./database.ts";

/** LIKE 使用显式转义符，用户输入的通配符按字面匹配。 */
export function likePattern(value: string) {
	return `%${value.replace(/[!%_]/g, "!$&")}%`;
}

export function jsonText(db: StoreDatabase, column: string, key: string) {
	if (db.dialect === "postgres") return `(CAST(${column} AS jsonb) ->> '${key}')`;
	const expression = `JSON_EXTRACT(${column}, '$.${key}')`;
	return db.dialect === "mysql" ? `JSON_UNQUOTE(${expression})` : expression;
}
