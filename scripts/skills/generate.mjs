import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { assertChatUiCoverage, createApiModel } from "./api-model.mjs";
import {
	filesUnder,
	headingSlugs,
	portablePath,
	validateChineseMarkdown,
	validateChineseText,
	validateElementExample,
	validateSkillMap,
} from "./validate.mjs";

export { filesUnder, validateElementExample, validateSkillMap } from "./validate.mjs";

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const skillSourceRoot = (root, name) => resolve(root, "scripts/skills/src", name);
export const skillOutputRoot = (root, name) => resolve(root, "assets/skills", name);

export function skillNames(root = repositoryRoot) {
	return readdirSync(resolve(root, "scripts/skills/src"), { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();
}

function inside(directory, path) {
	const rel = relative(directory, path);
	if (rel.startsWith(`..${sep}`) || rel === ".." || resolve(path) === resolve(directory))
		throw new Error(`Reference escapes its independent Skill: ${path}`);
	return path;
}

function table(fields) {
	if (!fields.length) return "";
	const cell = (value) => value.replaceAll("|", "\\|").replaceAll("\n", " ");
	return [
		"| 字段 | 必填 | 类型 |",
		"| --- | --- | --- |",
		...fields.map((field) => `| \`${field.name}\` | ${field.optional ? "否" : "是"} | \`${cell(field.type)}\` |`),
		"",
	].join("\n");
}

function declaration(entry) {
	const identifier = entry.member ?? entry.export;
	let code = `import ${entry.isValue ? "" : "type "}{ ${entry.export} } from "${entry.packageName}";`;
	if (entry.member) {
		code = `// ${entry.name} 的类型\n${entry.type}`;
	} else if (entry.isValue && entry.signatures.length) {
		code = entry.signatures.map((signature) => `export function ${identifier}${signature};`).join("\n");
	} else if (entry.constructSignatures.length) {
		const constructorSignature = entry.constructSignatures[0].replace(new RegExp(`: ${entry.export}$`), "");
		code = `declare class ${entry.export} {\n  constructor${constructorSignature};\n}`;
	} else if (entry.type !== entry.export && !entry.type.startsWith(`${entry.export}<`)) {
		code = `export type ${identifier} = ${entry.type};`;
	}
	return `\`\`\`ts\n${code}\n\`\`\`\n\n${table(entry.fields)}`;
}

function renderApi(name, entries, model, root, renderedDocs) {
	const descriptions = entries.map(model.describe);
	const supportingTypesHeading = "相关类型";
	const anchors = headingSlugs(["API 参考", "目录", ...entries.map((entry) => entry.name), supportingTypesHeading]);
	const lines = [
		"# API 参考",
		"",
		"本页由 `pnpm gen:skills` 生成。更新公开 TypeScript 声明或中文 catalog 后重新生成。",
		"字段类型和必填性来自公开 API，行为说明依据所列文档整理。",
		"组件表格列出 Kit 自有属性。组件按声明继承标准的 React/DOM 属性。",
		"",
		"## 目录",
		"",
		...entries.map((entry, index) => `- [${entry.name}](#${anchors[index + 2]})`),
		`- [${supportingTypesHeading}](#${anchors.at(-1)})`,
		"",
	];
	for (const entry of descriptions) {
		const docPath = resolve(root, entry.doc);
		const doc = renderedDocs.get(docPath) ?? readFileSync(docPath, "utf8");
		lines.push(
			`## ${entry.name}`,
			"",
			entry.description,
			"",
			`从 \`${entry.packageName}\` 导入 \`${entry.member ? entry.export : entry.name}\`。`,
			`公开入口为 \`${entry.source}\`，声明位于 \`${entry.declaration}\`。`,
			`说明来自 \`${entry.doc}\`。`,
			`[可编译示例](../${entry.example})`,
			"",
			...(entry.notes ?? []).map((note) => `- ${note}`),
			"",
			declaration(entry),
			`<!-- source-sha256: ${entry.sourceHash}; doc-sha256: ${createHash("sha256").update(doc).digest("hex")} -->`,
			"",
		);
	}
	lines.push(`## ${supportingTypesHeading}`, "", "以下公开类型可供离线查阅。", "");
	for (const entry of model.supportingTypes(descriptions, name === "kit-components"))
		lines.push(`### ${entry.name}`, "", `来自 \`${entry.packageName}\`。`, "", declaration(entry), "");
	return `${lines.join("\n").trim()}\n`;
}

function renderExamples(root, name) {
	const directory = skillSourceRoot(root, name);
	const examples = filesUnder(resolve(directory, "examples")).filter((file) => /\.tsx?$/.test(file));
	return [
		"# 可编译示例",
		"",
		"本页由随附的示例源文件生成。请按应用需求调整回调和运行时配置。",
		"",
		...examples.flatMap((file) => [
			`## ${portablePath(relative(resolve(directory, "examples"), file))}`,
			"",
			`[源文件](../${portablePath(relative(directory, file))})`,
			"",
			`\`\`\`${file.endsWith(".tsx") ? "tsx" : "ts"}\n${readFileSync(file, "utf8").trimEnd()}\n\`\`\``,
			"",
		]),
	].join("\n");
}

function renderSkill(metadata, body) {
	const description = metadata.description.replace(/\s+/g, " ").trim();
	return `---\nname: ${metadata.name}\ndescription: ${JSON.stringify(description)}\n---\n\n${body.trim()}\n`;
}

function renderOpenAi(metadata) {
	return [
		"interface:",
		`  display_name: ${JSON.stringify(metadata.displayName)}`,
		`  short_description: ${JSON.stringify(metadata.shortDescription)}`,
		`  default_prompt: ${JSON.stringify(metadata.defaultPrompt)}`,
		"",
	].join("\n");
}

const exampleMarker = /\{\/\* skill-example: ([\w./-]+) \*\/\}[\s\S]*?\{\/\* \/skill-example \*\/\}/g;

export function renderDocsExamples(text, root) {
	const names = new Set(skillNames(root));
	return text.replace(exampleMarker, (_match, path) => {
		const [name] = path.split("/");
		if (!names.has(name)) throw new Error(`Unknown Skill example: ${path}`);
		const file = inside(skillSourceRoot(root, name), resolve(root, "scripts/skills/src", path));
		if (!/\.tsx?$/.test(file)) throw new Error(`Expected a TypeScript example: ${path}`);
		return `{/* skill-example: ${path} */}\n\n\`\`\`${file.endsWith(".tsx") ? "tsx" : "ts"}\n${readFileSync(file, "utf8").trimEnd()}\n\`\`\`\n\n{/* /skill-example */}`;
	});
}

export function readMetadata(root, name) {
	const path = resolve(skillSourceRoot(root, name), "metadata.json");
	const metadata = JSON.parse(readFileSync(path, "utf8"));
	for (const key of ["name", "description", "displayName", "shortDescription", "defaultPrompt"]) {
		if (typeof metadata[key] !== "string" || !metadata[key].trim())
			throw new Error(`Missing metadata.${key} for ${name}`);
		if (key !== "name") validateChineseText(metadata[key], `${portablePath(relative(root, path))}#${key}`);
	}
	if (metadata.name !== name) throw new Error(`metadata.name must match ${name}, got ${metadata.name}`);
	return metadata;
}

export function readCatalog(root, name) {
	return JSON.parse(readFileSync(resolve(skillSourceRoot(root, name), "catalog.json"), "utf8"));
}

function validateEntry(root, name, entry) {
	if (!entry.description || !entry.doc || !entry.example) throw new Error(`Incomplete catalog entry: ${entry.name}`);
	const source = `scripts/skills/src/${name}/catalog.json#${entry.name}`;
	validateChineseText(entry.description, `${source}.description`);
	for (const [index, note] of (entry.notes ?? []).entries()) validateChineseText(note, `${source}.notes[${index}]`);
	if (!existsSync(resolve(root, entry.doc))) throw new Error(`Missing documentation source: ${entry.doc}`);
	const example = inside(skillSourceRoot(root, name), resolve(skillSourceRoot(root, name), entry.example));
	if (!existsSync(example)) throw new Error(`Missing example for ${entry.name}: ${entry.example}`);
	if (name === "kit-components") validateElementExample(entry, readFileSync(example, "utf8"));
}

function buildDocsOutputs(root) {
	const outputs = new Map();
	// Hash the final embedded examples, not the previous checked-in document.
	for (const file of ["skill", "sdk", "components"].flatMap((section) =>
		filesUnder(resolve(root, "apps/storybook/content/docs", section)),
	)) {
		if (!file.endsWith(".mdx")) continue;
		const text = readFileSync(file, "utf8");
		if (text.includes("{/* skill-example:")) outputs.set(file, renderDocsExamples(text, root));
	}
	return outputs;
}

function buildSkillOutputs(root, name, model, renderedDocs) {
	const source = skillSourceRoot(root, name);
	const metadata = readMetadata(root, name);
	const entries = readCatalog(root, name);
	if (name === "kit-components") assertChatUiCoverage(model.chatUiCallableNames(), entries);
	for (const entry of entries) validateEntry(root, name, entry);

	const bodyPath = resolve(source, "skill.md");
	const body = readFileSync(bodyPath, "utf8");
	validateChineseMarkdown(body, portablePath(relative(root, bodyPath)));

	const skillFiles = new Map();
	skillFiles.set("SKILL.md", renderSkill(metadata, body));
	skillFiles.set("agents/openai.yaml", renderOpenAi(metadata));
	skillFiles.set("references/api.md", renderApi(name, entries, model, root, renderedDocs));
	skillFiles.set("references/examples.md", renderExamples(root, name));
	for (const file of filesUnder(resolve(source, "references"))) {
		const text = readFileSync(file, "utf8");
		if (file.endsWith(".md")) validateChineseMarkdown(text, portablePath(relative(root, file)));
		skillFiles.set(portablePath(relative(source, file)), text);
	}
	for (const file of filesUnder(resolve(skillSourceRoot(root, name), "examples")))
		skillFiles.set(
			`examples/${portablePath(relative(resolve(skillSourceRoot(root, name), "examples"), file))}`,
			readFileSync(file, "utf8"),
		);

	validateSkillMap(name, skillFiles);
	return skillFiles;
}

export function buildOutputs(root = repositoryRoot, model = createApiModel(root)) {
	const outputs = buildDocsOutputs(root);
	for (const name of skillNames(root)) {
		for (const [file, text] of buildSkillOutputs(root, name, model, outputs))
			outputs.set(resolve(skillOutputRoot(root, name), file), text);
	}
	return outputs;
}

function staleOutputs(outputs) {
	return [...outputs].filter(([file, text]) => !existsSync(file) || readFileSync(file, "utf8") !== text);
}

function extraOutputs(root, outputs) {
	const expected = new Set(outputs.keys());
	const extra = [];
	for (const name of skillNames(root)) {
		const directory = skillOutputRoot(root, name);
		if (!existsSync(directory)) continue;
		for (const file of filesUnder(directory)) if (!expected.has(file)) extra.push(file);
	}
	return extra;
}

export function synchronizeOutputs(outputs, { root = repositoryRoot, write = false } = {}) {
	const stale = staleOutputs(outputs);
	if (!write && stale.length)
		throw new Error(
			`Skill outputs are stale; run pnpm gen:skills:\n${stale.map(([file]) => relative(root, file)).join("\n")}`,
		);
	if (write)
		for (const [file, text] of stale) {
			mkdirSync(dirname(file), { recursive: true });
			writeFileSync(file, text);
		}
	return { outputs: outputs.size, changed: stale.length };
}

export function syncSkills({ root = repositoryRoot, write = false } = {}) {
	const outputs = buildOutputs(root);
	const stale = staleOutputs(outputs);
	const extra = extraOutputs(root, outputs);
	if (!write && (stale.length || extra.length)) {
		const details = [
			...stale.map(([file]) => `stale: ${relative(root, file)}`),
			...extra.map((file) => `unexpected: ${relative(root, file)}`),
		];
		throw new Error(`Skill outputs are stale; run pnpm gen:skills:\n${details.join("\n")}`);
	}
	if (write) {
		for (const name of skillNames(root)) rmSync(skillOutputRoot(root, name), { recursive: true, force: true });
		for (const [file, text] of outputs) {
			mkdirSync(dirname(file), { recursive: true });
			writeFileSync(file, text);
		}
	}
	return { outputs: outputs.size, changed: stale.length + extra.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		const result = syncSkills({ write: process.argv.includes("--write") });
		process.stdout.write(
			`Skills ${process.argv.includes("--write") ? "generated" : "checked"}: ${result.outputs} outputs, ${result.changed} changed.\n`,
		);
	} catch (error) {
		process.stderr.write(`${error.message}\n`);
		process.exitCode = 1;
	}
}
