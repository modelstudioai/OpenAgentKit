import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { sqliteHistory } from "../sqlite-history.ts";
import { compileChange, dialects, type ExplicitMigration, parseExplicit, readDefinition } from "./changes.ts";
import { compileHistory } from "./history.ts";
import manifest from "./manifest.json" with { type: "json" };
import type { Dialect, Migration, MigrationProgram, Schema, Step, Table } from "./model.ts";
import { createTableSteps, forDialect, orderedNewTables, sameSchema } from "./render.ts";

const root = fileURLToPath(new URL("./", import.meta.url));
const initialVersion = 33;
const generatedHeader = "由 db:generate 生成，修改结构请编辑共享定义。";
const definitionPath = "definition.sql";

interface Version {
	id: string;
	sql: string;
	explicit?: ExplicitMigration;
}

function read(path: string) {
	return readFileSync(join(root, path), "utf8");
}

function readVersions(): Version[] {
	return manifest.slice(sqliteHistory.length).map(({ id, source, steps }, index) => {
		if (source !== "version" || !/^\d{3,}_[a-z0-9_]+$/.test(id) || id.length > 100)
			throw new Error(`无效的迁移清单条目：${id}`);
		if (Number.parseInt(id, 10) !== initialVersion + index) throw new Error(`迁移版本不连续：${id}`);
		const explicit = steps ? parseExplicit(JSON.parse(read(`versions/${id}.steps.json`))) : undefined;
		return { id, sql: read(`versions/${id}.sql`), ...(explicit ? { explicit } : {}) };
	});
}

function checkRegisteredFiles(directory: "history" | "versions", filenames: string[]) {
	const registered = new Set(filenames);
	for (const file of readdirSync(join(root, directory))) {
		if (/\.(?:sql|ts|steps\.json)$/.test(file) && !registered.has(file))
			throw new Error(`迁移清单缺少文件登记：${directory}/${file}`);
	}
}

function verifyHistory() {
	const filenames = sqliteHistory.map(({ id, run }) => `${id}.${run ? "ts" : "sql"}`);
	checkRegisteredFiles("history", filenames);
	const contents = filenames.map((file) => [file, read(`history/${file}`)]);
	const frozen = read("history.sha256").trim();
	const hash = createHash("sha256").update(JSON.stringify(contents)).digest("hex");
	if (hash !== frozen) throw new Error("SQLite 历史迁移已变更，请保留原有内容和顺序，并追加新版本");
}

function versionFiles(version: Version) {
	const files = new Map<string, string>();
	if (version.explicit) files.set(`${version.id}.steps.json`, `${JSON.stringify(version.explicit, null, 2)}\n`);
	files.set(`${version.id}.sql`, version.sql);
	return files;
}

function checkVersionFiles(versions: Version[]) {
	checkRegisteredFiles(
		"versions",
		versions.flatMap((version) => [...versionFiles(version).keys()]),
	);
}

function write(path: string, content: string) {
	const filename = join(root, path);
	const temporary = `${filename}.${process.pid}.tmp`;
	try {
		writeFileSync(temporary, content);
		renameSync(temporary, filename);
	} finally {
		rmSync(temporary, { force: true });
	}
}

function appendVersion(version: Version) {
	for (const [file, content] of versionFiles(version)) {
		const path = `versions/${file}`;
		// 写入清单前中断时，同名命令可以继续登记内容一致的文件。
		if (existsSync(join(root, path))) {
			if (read(path) !== content) throw new Error(`未登记的迁移文件与本次生成不符：${path}`);
		} else {
			write(path, content);
		}
	}
	const entry = { id: version.id, source: "version", ...(version.explicit ? { steps: true } : {}) };
	write("manifest.json", `${JSON.stringify([...manifest, entry], null, 2)}\n`);
}

function sqlArtifact(sql: string[]) {
	return `-- ${generatedHeader}\n\n${sql.join("\n\n").trim()}\n`;
}

function statementSql(step: Step): string[] {
	if ("sql" in step) return [`${step.sql};`];
	if ("data" in step) return step.data.map((sql) => `${sql};`);
	return [`-- 数据转换 ${step.transform} 由运行时执行。`];
}

function migrationSql(migration: Migration) {
	return [`-- ${migration.id}`, ...migration.steps.flatMap(statementSql)].join("\n");
}

function typescriptArtifact(program: MigrationProgram) {
	const tableReferences = new Map<string, number>();
	function reference(table: Table | null) {
		if (!table) return "null";
		const key = JSON.stringify(table);
		if (!tableReferences.has(key)) tableReferences.set(key, tableReferences.size);
		return `tables[${tableReferences.get(key)}]!`;
	}
	const list = (schema: Schema) => `[${schema.map(reference).join(", ")}]`;
	function renderStep(step: Step) {
		if (!("sql" in step)) return JSON.stringify(step);
		const changes = step.changes.map(
			({ name, before, after }) =>
				`{name:${JSON.stringify(name)},before:${reference(before)},after:${reference(after)}}`,
		);
		return `{sql:${JSON.stringify(step.sql)},changes:[${changes.join(",")}]}`;
	}
	function renderMigrations(migrations: Migration[]) {
		return migrations
			.map((migration) => {
				const steps = migration.steps.map(renderStep).join(",\n\t\t");
				const body = steps ? `\n\t\t${steps}\n\t` : "";
				return `\t{id:${JSON.stringify(migration.id)},steps:[${body}]${migration.sqliteRebuild ? ",sqliteRebuild:true" : ""}},`;
			})
			.join("\n");
	}
	const history = renderMigrations(program.history);
	const upgrades = renderMigrations(program.upgrades);
	const current = list(program.current);
	const adoption = program.adoption ? `\tadoption: ${renderMigrations([program.adoption]).trimStart()}\n` : "";
	const legacy = program.legacy ? `\tlegacy: ${list(program.legacy)},\n` : "";
	const tables = [...tableReferences.keys()].map((table) => `\t${table},`).join("\n");
	return `// ${generatedHeader}
import type { MigrationProgram, Table } from "../model.ts";

const tables: Table[] = [
${tables}
];

export const program: MigrationProgram = {
	history: [
${history}
	],
	upgrades: [
${upgrades}
	],
	current: ${current},
${legacy}${adoption}};
`;
}

export function buildArtifacts(versions: Version[], source: string) {
	const history = compileHistory();
	let previous = history.baseline;
	const upgrades: Record<Dialect, Migration[]> = { sqlite: [], mysql: [], postgres: [] };
	for (const version of versions) {
		const current = readDefinition(version.sql);
		const change = compileChange(version.id, previous, current, version.explicit);
		for (const dialect of dialects) upgrades[dialect].push(change[dialect]);
		previous = current;
	}
	const defined = readDefinition(source);
	if (!sameSchema(previous, defined)) throw new Error("共享表结构有未生成的变更，请运行 db:generate --name <变更名>");
	const outputs = new Map<string, string>();
	for (const dialect of dialects) {
		const current = forDialect(defined, dialect);
		const baseline = forDialect(history.baseline, dialect);
		const prior = dialect === "sqlite" ? [] : history[dialect];
		outputs.set(
			`generated/${dialect}.ts`,
			typescriptArtifact({
				history: prior,
				upgrades: upgrades[dialect],
				current,
				...(dialect === "sqlite"
					? {}
					: {
							legacy: baseline.filter((table) => table.name !== "kit_retired_directory_drafts"),
							adoption: {
								id: "kit_history_adopted",
								steps: createTableSteps(
									baseline.find((table) => table.name === "kit_retired_directory_drafts")!,
									dialect,
								),
							},
						}),
			}),
		);
		const original =
			dialect === "sqlite" ? history.sqlite.map((entry) => `-- ${entry.id}\n${entry.sql}`) : prior.map(migrationSql);
		outputs.set(
			`generated/migrations.${dialect}.sql`,
			sqlArtifact([...original, ...upgrades[dialect].map(migrationSql)]),
		);
		outputs.set(
			`generated/schema.${dialect}.sql`,
			sqlArtifact(
				orderedNewTables(current).flatMap((table) => createTableSteps(table, dialect).map((step) => `${step.sql};`)),
			),
		);
	}
	return outputs;
}

function planNext(versions: Version[], source: string, name: string, explicit?: ExplicitMigration) {
	if (!/^[a-z][a-z0-9_]{0,79}$/.test(name)) throw new Error("--name 需为小写 SQL 迁移名称");
	const before = versions.length ? readDefinition(versions.at(-1)!.sql) : compileHistory().baseline;
	const changed = !sameSchema(before, readDefinition(source));
	const latest = versions.at(-1);
	const sameName = latest?.id.split("_").slice(1).join("_") === name;
	if (!changed && sameName && (!explicit || JSON.stringify(explicit) === JSON.stringify(latest?.explicit))) {
		// 写生成文件中途失败时，重跑同名命令即可补齐。
		return undefined;
	}
	if (!changed && !explicit) throw new Error("共享定义没有新变更");
	const id = `${String(initialVersion + versions.length).padStart(3, "0")}_${name}`;
	return { id, sql: source, ...(explicit ? { explicit } : {}) };
}

function writeOutputs(outputs: Map<string, string>) {
	mkdirSync(join(root, "generated"), { recursive: true });
	for (const [path, sql] of outputs) {
		if (!existsSync(join(root, path)) || read(path) !== sql) write(path, sql);
	}
}

function run() {
	const {
		values: { check, render, name, steps },
	} = parseArgs({
		options: {
			check: { type: "boolean" },
			render: { type: "boolean" },
			name: { type: "string" },
			steps: { type: "string" },
		},
	});
	if (check && render) throw new Error("--check 和 --render 只能选择一个");
	if ((check || render) && (name !== undefined || steps !== undefined))
		throw new Error("--check 和 --render 不接收变更参数");
	if (!check && !render && !name) throw new Error("请提供 --name <变更名>");

	verifyHistory();
	const source = read(definitionPath);
	const versions = readVersions();
	const explicit = steps
		? parseExplicit(JSON.parse(readFileSync(resolve(process.env.INIT_CWD ?? process.cwd(), steps), "utf8")))
		: undefined;
	const next = name ? planNext(versions, source, name, explicit) : undefined;
	const planned = next ? [...versions, next] : versions;
	checkVersionFiles(planned);
	const outputs = buildArtifacts(planned, source);
	if (check) return;
	if (next) appendVersion(next);
	writeOutputs(outputs);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	try {
		run();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
