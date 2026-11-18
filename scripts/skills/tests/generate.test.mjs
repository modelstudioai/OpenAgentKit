import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import { assertChatUiCoverage, createApiModel } from "../api-model.mjs";
import { createArchive } from "../archive.mjs";
import {
	buildOutputs,
	filesUnder,
	repositoryRoot,
	skillNames,
	skillOutputRoot,
	skillSourceRoot,
	synchronizeOutputs,
} from "../generate.mjs";
import { packSkills } from "../pack.mjs";
import { validateElementExample, validateSkillDirectory, validateSkillMap } from "../validate.mjs";

function writeSkill(root, name, body = "# 接入示例\n\n使用公开 API。\n") {
	const directory = resolve(root, "scripts/skills/src", name);
	mkdirSync(resolve(directory, "references"), { recursive: true });
	mkdirSync(resolve(directory, "examples"), { recursive: true });
	writeFileSync(
		resolve(directory, "metadata.json"),
		JSON.stringify({
			name,
			description: "公开 API 接入示例",
			displayName: "接入示例",
			shortDescription: "通过公开 API 将会话页面接入后端，并处理历史加载和工具审批",
			defaultPrompt: `使用 $${name} 接入示例。`,
		}),
	);
	writeFileSync(resolve(directory, "skill.md"), body);
	writeFileSync(resolve(directory, "catalog.json"), "[]");
	writeFileSync(resolve(directory, "examples/fixture.ts"), "export {};\n");
}

test("public API extraction covers components, helpers and removed APIs; requiredness follows source", () => {
	const directory = mkdtempSync(resolve(tmpdir(), "kit-skills-api-"));
	const source = resolve(directory, "index.ts");
	const modules = { "chat-ui": { path: "index.ts", name: "fixture" } };
	const fixture = (optional) => `
export interface SenderProps { value${optional ? "?" : ""}: string }
export function Header(props: { title: string }) { return props.title }
export const Sender = Object.assign((props: SenderProps) => props.value, { Header });
export function isIconImageSource(icon: string | undefined) { return Boolean(icon) }
export class Failure extends Error { readonly retryable = true; }
`;
	try {
		writeFileSync(source, fixture(false));
		const before = createApiModel(directory, modules);
		assert.deepEqual(before.chatUiCallableNames(), ["Header", "Sender", "Sender.Header", "isIconImageSource"]);
		assert.throws(() => assertChatUiCoverage(before.chatUiCallableNames(), [{ name: "Sender" }]), /missing=.*Header/);
		assert.throws(() => assertChatUiCoverage(["Sender"], [{ name: "Removed" }]), /removed=.*Removed/);
		assert.throws(
			() =>
				assertChatUiCoverage(
					before.chatUiCallableNames(),
					["Header", "Sender", "Sender.Header"].map((name) => ({ name })),
				),
			/missing=.*isIconImageSource/,
		);
		assert.equal(before.describe({ export: "Sender", name: "Sender" }).fields[0].optional, false);
		const errorContract = before.describe({ export: "Failure", name: "Failure" });
		assert.ok(errorContract.fields.some((field) => field.name === "retryable"));
		assert.ok(!errorContract.fields.some((field) => field.name === "prototype"));
		writeFileSync(source, fixture(true));
		const after = createApiModel(directory, modules);
		assert.equal(after.describe({ export: "Sender", name: "Sender" }).fields[0].optional, true);
		assert.throws(() => after.describe({ export: "Removed", name: "Removed" }), /Unknown public export/);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("generated callable declarations come from the public API without inventing runtime exports", () => {
	const outputs = buildOutputs(repositoryRoot);
	const api = outputs.get(resolve(skillOutputRoot(repositoryRoot, "kit-chat-provider"), "references/api.md"));
	assert.ok(api, "kit-chat-provider API reference must be generated");
	assert.match(api, /export function createSseStream\(/);
	assert.match(api, /import type \{ ChatProvider \} from "@openagentpack\/kit-sdk\/providers";/);
	assert.doesNotMatch(api, /export function ChatProvider\b/);
});

test("generated Skill links stay portable when the platform returns Windows paths", () => {
	execFileSync(
		process.execPath,
		[
			"--input-type=module",
			"-e",
			String.raw`
import assert from "node:assert/strict";
import path from "node:path";
import { syncBuiltinESMExports } from "node:module";
const relative = path.relative;
path.relative = (...args) => relative(...args).replaceAll("/", "\\");
syncBuiltinESMExports();
const { buildOutputs, repositoryRoot, skillOutputRoot } = await import("./scripts/skills/generate.mjs");
const outputs = buildOutputs(repositoryRoot);
const examples = outputs.get(path.resolve(skillOutputRoot(repositoryRoot, "kit-chat-provider"), "references/examples.md"));
assert.ok(examples.includes("[源文件](../examples/backend-http.ts)"));
`,
		],
		{ cwd: repositoryRoot, stdio: "pipe" },
	);
});

test("chat-ui examples require component JSX or helper calls, not comments or lookalike names", () => {
	const component = { name: "Sender.Header", example: "examples/fixture.tsx" };
	const helper = { name: "isIconImageSource", kind: "helper", example: "examples/fixture.tsx" };
	validateElementExample(component, 'export const x = <Sender.Header title="Hi" />;\n');
	validateElementExample(helper, 'export const x = isIconImageSource("icon.png");\n');
	assert.throws(() => validateElementExample(component, "// <Sender.Header />\n"), /no JSX usage/);
	assert.throws(() => validateElementExample(helper, "const isIconImageSourceCopy = 1;\n"), /no call usage/);
});

test("packed Skills are reproducible and preserve source modification times", () => {
	const directory = mkdtempSync(resolve(tmpdir(), "kit-skills-pack-"));
	try {
		const first = resolve(directory, "first");
		const second = resolve(directory, "second");
		packSkills({ output: first });
		packSkills({ output: second });
		const names = skillNames(repositoryRoot);
		for (const name of [...names, "kit-skills"]) {
			const archive = resolve(first, `${name}.tgz`);
			assert.deepEqual(readFileSync(archive), readFileSync(resolve(second, `${name}.tgz`)));
			const extracted = resolve(directory, name);
			mkdirSync(extracted);
			execFileSync("tar", ["-xzf", archive, "-C", extracted]);
			const skills = name === "kit-skills" ? names : [name];
			for (const skill of skills) {
				const root = skillOutputRoot(repositoryRoot, skill);
				validateSkillDirectory(resolve(extracted, skill));
				for (const source of filesUnder(root)) {
					const file = resolve(extracted, skill, source.slice(root.length + 1));
					assert.deepEqual(readFileSync(file), readFileSync(source));
					assert.equal(statSync(file).mtimeMs, Math.floor(statSync(source).mtimeMs / 1000) * 1000);
				}
			}
		}
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("Chinese content and anchors are accepted while invalid references and unfinished text are rejected", () => {
	const valid = new Map([
		["SKILL.md", "---\nname: example\ndescription: 接入示例\n---\n\n# 接入示例\n\n[公开接口](api.md#公开接口)\n"],
		["api.md", "# 公开接口\n"],
	]);
	assert.doesNotThrow(() => validateSkillMap("example", valid));
	assert.throws(
		() =>
			validateSkillMap("example", new Map([...valid, ["SKILL.md", `${valid.get("SKILL.md")}\n[API](missing.md)\n`]])),
		/Broken Skill reference/,
	);
	assert.throws(
		() =>
			validateSkillMap(
				"example",
				new Map([...valid, ["SKILL.md", `${valid.get("SKILL.md")}\n[API](../other/api.md)\n`]]),
			),
		/escapes/,
	);
	assert.throws(
		() => validateSkillMap("example", new Map([...valid, ["SKILL.md", `${valid.get("SKILL.md")}\nTODO\n`]])),
		/Unfinished scaffold/,
	);
	assert.throws(() => createArchive([{ path: "../bad", content: "" }]), /Unsafe archive/);
});

test("API contents distinguish static subcomponents from aliases with colliding Markdown headings", () => {
	const api = readFileSync(resolve(skillOutputRoot(repositoryRoot, "kit-components"), "references/api.md"), "utf8");
	for (const [name, anchor] of [
		["Actions.Copy", "actionscopy-1"],
		["Actions.Feedback", "actionsfeedback-1"],
		["Sender.Header", "senderheader-1"],
	]) {
		assert.ok(api.includes(`- [${name}](#${anchor})`));
	}
	const skill = "---\nname: example\ndescription: Example integration\n---\n\n## ActionsCopy\n\n## Actions.Copy\n";
	assert.doesNotThrow(() =>
		validateSkillMap("example", new Map([["SKILL.md", `${skill}\n[Static member](#actionscopy-1)\n`]])),
	);
	assert.throws(
		() => validateSkillMap("example", new Map([["SKILL.md", `${skill}\n[Missing section](#actionscopy-2)\n`]])),
		/Broken Skill anchor/,
	);
});

test("stale generated output fails read-only checking and can be regenerated deterministically", () => {
	const directory = mkdtempSync(resolve(tmpdir(), "kit-skills-drift-"));
	const file = resolve(directory, "api.md");
	try {
		writeFileSync(file, "Previous API");
		const outputs = new Map([[file, "Updated API"]]);
		assert.throws(() => synchronizeOutputs(outputs), /outputs are stale/);
		assert.equal(readFileSync(file, "utf8"), "Previous API");
		assert.equal(synchronizeOutputs(outputs, { write: true }).changed, 1);
		assert.equal(synchronizeOutputs(outputs).changed, 0);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("one generation synchronizes SDK and component examples with their source files", () => {
	const directory = mkdtempSync(resolve(tmpdir(), "kit-skills-sdk-docs-"));
	try {
		for (const path of ["scripts/skills/src", "apps/storybook/content"]) {
			cpSync(resolve(repositoryRoot, path), resolve(directory, path), { recursive: true });
		}
		const examples = [
			["kit-chat-provider", "request.ts", "sdk/request.mdx"],
			["kit-components", "layout.tsx", "components/layout.mdx"],
		];
		for (const [skill, example] of examples) {
			const source = resolve(skillSourceRoot(directory, skill), "examples", example);
			writeFileSync(source, `${readFileSync(source, "utf8")}\n// 已更新的接入示例 ${example}。\n`);
		}
		const model = createApiModel(repositoryRoot);
		const outputs = buildOutputs(directory, model);
		for (const [, example, doc] of examples) {
			const text = outputs.get(resolve(directory, "apps/storybook/content/docs", doc));
			assert.ok(text?.includes(`已更新的接入示例 ${example}`), `${doc} must embed its source example`);
		}
		synchronizeOutputs(outputs, { root: directory, write: true });
		assert.equal(synchronizeOutputs(buildOutputs(directory, model), { root: directory }).changed, 0);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("fixture repository generates a complete final Skill directory", () => {
	const directory = mkdtempSync(resolve(tmpdir(), "kit-skills-minimal-"));
	try {
		for (const name of ["use-kit-chat", "kit-chat-provider"]) writeSkill(directory, name);
		mkdirSync(resolve(directory, "apps/storybook/content/docs/skill"), { recursive: true });
		mkdirSync(resolve(directory, "apps/storybook/content/docs/sdk"), { recursive: true });
		mkdirSync(resolve(directory, "apps/storybook/content/docs/components"), { recursive: true });
		const outputs = buildOutputs(directory, createApiModel(repositoryRoot));
		for (const name of skillNames(directory)) {
			const root = skillOutputRoot(directory, name);
			assert.match(outputs.get(resolve(root, "SKILL.md")), /公开 API 接入示例/);
			assert.match(outputs.get(resolve(root, "agents/openai.yaml")), /display_name: "接入示例"/);
			assert.match(outputs.get(resolve(root, "references/api.md")), /^# API 参考\n/);
			assert.match(outputs.get(resolve(root, "references/examples.md")), /\[源文件\]\(\.\.\/examples\/fixture\.ts\)/);
		}
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("generation rejects untranslated authored prose before it can reach generated Skills", () => {
	const directory = mkdtempSync(resolve(tmpdir(), "kit-skills-language-"));
	const name = "kit-chat-provider";
	const source = skillSourceRoot(directory, name);
	try {
		writeSkill(directory, name);
		for (const section of ["skill", "sdk", "components"])
			mkdirSync(resolve(directory, "apps/storybook/content/docs", section), { recursive: true });
		const doc = "apps/storybook/content/docs/sdk/fixture.mdx";
		writeFileSync(resolve(directory, doc), "# 请求示例\n");
		const entry = {
			name: "createRequest",
			export: "createRequest",
			module: "request",
			description: "创建 HTTP 客户端。",
			notes: ["支持流式读取。"],
			doc,
			example: "examples/fixture.ts",
		};
		writeFileSync(resolve(source, "catalog.json"), JSON.stringify([entry]));
		writeFileSync(resolve(source, "references/setup.md"), "# 配置\n\n受控接入 `RequestClient`。\n");
		const metadata = JSON.parse(readFileSync(resolve(source, "metadata.json"), "utf8"));
		const model = createApiModel(repositoryRoot);
		assert.doesNotThrow(() => buildOutputs(directory, model));

		const failures = [
			...["description", "displayName", "shortDescription", "defaultPrompt"].map((key) => [
				"metadata.json",
				JSON.stringify({ ...metadata, [key]: "Integration example" }),
				`metadata.json#${key}`,
			]),
			[
				"skill.md",
				'# Getting started\r\n\r\nUse `中文` in the request.\r\n\r\n~~~ts\r\nconst label = "中文";\r\n~~~\r\n',
				"skill.md",
			],
			["references/setup.md", "# Setup\n\nUse the public API.\n", "references/setup.md"],
			[
				"catalog.json",
				JSON.stringify([{ ...entry, description: "Create a client." }]),
				"catalog.json#createRequest.description",
			],
			[
				"catalog.json",
				JSON.stringify([{ ...entry, notes: ["支持流式读取。", "Requires a URL."] }]),
				"catalog.json#createRequest.notes[1]",
			],
		];
		for (const [file, content, location] of failures) {
			const path = resolve(source, file);
			const original = readFileSync(path, "utf8");
			writeFileSync(path, content);
			assert.throws(() => buildOutputs(directory, model), {
				message: `scripts/skills/src/${name}/${location} 需要包含中文说明。`,
			});
			writeFileSync(path, original);
		}
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
