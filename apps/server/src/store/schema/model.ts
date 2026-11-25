export type Dialect = "sqlite" | "mysql" | "postgres";

export interface Column {
	name: string;
	type: string;
	nullable: boolean;
	default?: string;
	identity?: boolean;
	collation?: string;
	generated?: string;
}

export interface Index {
	name: string;
	columns: string[];
	unique: boolean;
	where?: string;
}

export interface ForeignKey {
	columns: string[];
	table: string;
	references: string[];
	onDelete: string;
	onUpdate: string;
}

export interface Table {
	name: string;
	columns: Column[];
	primary: string[];
	unique: string[][];
	foreignKeys: ForeignKey[];
	checks: string[];
	indexes: Index[];
}

export type Schema = Table[];

export type DataStep = { data: string[] } | { transform: "legacyFiles" | "rebuildDailyUsage" | "retireDrafts" };
export type TableChange = { name: string; before: Table | null; after: Table | null };
export type DdlStep = { sql: string; changes: TableChange[] };
export type Step = DdlStep | DataStep;

export interface Migration {
	id: string;
	steps: Step[];
	sqliteRebuild?: boolean;
}

export interface MigrationProgram {
	history: Migration[];
	upgrades: Migration[];
	current: Schema;
	legacy?: Schema;
	adoption?: Migration;
}

export function identifier(name: string, dialect: Dialect) {
	if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name)) throw new Error(`不支持的数据库标识符：${name}`);
	return dialect === "mysql" ? `\`${name}\`` : `"${name}"`;
}

/** 保持字符串和引用标识符完整。迁移脚本与结构定义都是仓库内的 SQL。 */
function sqlTokens(source: string) {
	return (
		source.match(
			/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|\x60(?:\x60\x60|[^\x60])*\x60|\s+|::|>=|<=|<>|!=|[a-zA-Z_][a-zA-Z_0-9]*|\d+(?:\.\d+)?|./g,
		) ?? []
	);
}

export function splitSql(source: string, separator = ";") {
	const terms: string[] = [];
	let pending = "";
	let depth = 0;
	for (const token of sqlTokens(source)) {
		if (token === separator && depth === 0) {
			terms.push(pending);
			pending = "";
			continue;
		}
		pending += token.startsWith("--") || token.startsWith("/*") ? " " : token;
		depth += parenthesisDepth(token);
	}
	terms.push(pending);
	return terms.map((statement) => statement.trim()).filter(Boolean);
}

function parenthesisDepth(token: string) {
	if (token === "(") return 1;
	if (token === ")") return -1;
	return 0;
}

function ungroup(tokens: string[]): string[] {
	while (tokens[0] === "(" && tokens.at(-1) === ")") {
		let depth = 0;
		const end = tokens.findIndex((token) => {
			if (token === "(") depth++;
			if (token === ")") depth--;
			return depth === 0;
		});
		if (end !== tokens.length - 1) break;
		tokens = tokens.slice(1, -1);
	}
	return tokens;
}

/** 系统目录会为 CHECK 补括号，PG 会把 IN 展开为 ANY(ARRAY) 并补类型转换。 */
export function normalizeExpression(sql?: string): string {
	if (sql == null) return "";
	const literals: string[] = [];
	const template = sql.replace(/'(?:''|[^'])*'/g, (literal) => {
		literals.push(literal);
		return "'_kit_literal_'";
	});
	const projected = template
		.replace(/::(?:character varying|double precision|text|integer|bigint|smallint|numeric|boolean)(?:\[\])?/gi, "")
		.replace(
			/=\s*ANY\s*\(\s*(?:\(ARRAY\[([^\]]*)\]\)|ARRAY\[([^\]]*)\])\s*\)/gi,
			(_, wrapped, direct) => ` IN (${wrapped ?? direct})`,
		)
		.replace(/_(?:utf8mb4|utf8mb3|ascii)(?=')/gi, "");
	let literalIndex = 0;
	const tokens = sqlTokens(projected)
		.filter((token) => token.trim())
		.map((token) => {
			if (token.startsWith("'")) return literals[literalIndex++] ?? token;
			if (token === "<>") return "!=";
			return token.replace(/^["\x60]|["\x60]$/g, "").toLowerCase();
		});
	return normalizePredicate(removeAtomicGroups(tokens));
}

function removeAtomicGroups(tokens: string[]) {
	const result = [...tokens];
	for (let index = result.length - 3; index > 0; index--) {
		if (result[index] !== "(" || result[index + 2] !== ")" || ["(", ")"].includes(result[index + 1]!)) continue;
		if (["(", "=", "!=", ">", "<", ">=", "<="].includes(result[index - 1]!))
			result.splice(index, 3, result[index + 1]!);
	}
	return result;
}

function splitBoolean(tokens: string[], operator: string) {
	let depth = 0;
	const parts: string[][] = [[]];
	for (const token of tokens) {
		depth += parenthesisDepth(token);
		if (depth === 0 && token === operator) parts.push([]);
		else parts.at(-1)!.push(token);
	}
	return parts;
}

function normalizePredicate(value: string[]): string {
	const tokens = ungroup(value);
	if (tokens[0] === "case" && tokens[1] === "when" && tokens.at(-1) === "end") {
		const then = tokens.indexOf("then");
		if (then > 2)
			return `case when ${normalizePredicate(tokens.slice(2, then))} then ${tokens.slice(then + 1).join(" ")}`;
	}
	for (const operator of ["or", "and"]) {
		const parts = splitBoolean(tokens, operator);
		if (parts.length > 1) return `(${parts.map(normalizePredicate).join(` ${operator} `)})`;
	}
	// 比较式的操作数可由系统目录单独加括号。
	const comparison = tokens.findIndex((token) => ["=", "!=", "<", ">", "<=", ">=", "is", "in"].includes(token));
	if (comparison < 0) return tokens.join(" ");
	const right = tokens.slice(comparison + 1);
	const operand = tokens[comparison] === "in" ? `(${ungroup(right).join(" ")})` : ungroup(right).join(" ");
	return `${ungroup(tokens.slice(0, comparison)).join(" ")} ${tokens[comparison]} ${operand}`;
}

function sorted<T>(records: T[]) {
	return records.map((item) => JSON.stringify(item)).sort();
}

export function comparable(table: Table) {
	const orderedColumns = table.columns.map((column) => [
		column.name,
		column.type.toLowerCase(),
		column.nullable,
		normalizeExpression(column.default),
		Boolean(column.identity),
		column.collation?.toLowerCase() ?? "",
		normalizeExpression(column.generated),
	]);
	return {
		columns: sorted(orderedColumns),
		primary: table.primary,
		unique: sorted(table.unique),
		foreignKeys: sorted(
			table.foreignKeys.map((key) => [key.columns, key.table, key.references, key.onDelete, key.onUpdate]),
		),
		checks: table.checks.map(normalizeExpression).sort(),
		indexes: sorted(
			table.indexes.map((index) => [index.name, index.columns, index.unique, normalizeExpression(index.where)]),
		),
	};
}

export function sameValue(left: unknown, right: unknown) {
	return JSON.stringify(left) === JSON.stringify(right);
}

export function tableDifference(expected: Table | null, actual: Table | null) {
	if (expected == null || actual == null) return expected === actual ? undefined : "表存在状态";
	const wanted = comparable(expected);
	const found = comparable(actual);
	return (Object.keys(wanted) as (keyof ReturnType<typeof comparable>)[]).find(
		(key) => !sameValue(wanted[key], found[key]),
	);
}
