import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { REPO_ROOT } from "./paths.mjs";

const script = join(REPO_ROOT, "scripts/kit/add-component.mjs");
const reactFiles = ["message/index.tsx", "message-list/index.tsx", "process/sub-agent-card/index.tsx"];

for (const { name, directory, args, source, files } of [
	{ name: "当前项目默认使用 React", directory: false, args: ["message"], source: "chat-ui", files: reactFiles },
	{ name: "使用 --dir 指定项目", directory: true, args: ["message"], source: "chat-ui", files: reactFiles },
	{
		name: "使用 --framework vue 复制 Chat 与传递依赖",
		directory: true,
		args: ["chat", "--framework", "vue"],
		source: "chat-ui-vue",
		files: [
			"chat/index.ts",
			"message/index.ts",
			"actions/index.ts",
			"process/execution-group/index.ts",
			"process/sub-agent-card/index.ts",
			"processing-indicator/index.ts",
		],
	},
]) {
	test(`kit:add ${name}`, (t) => {
		const project = mkdtempSync(join(tmpdir(), "kit-add-"));
		t.after(() => rmSync(project, { recursive: true, force: true }));
		writeFileSync(join(project, "package.json"), '{"name":"kit-add-regression","private":true}');
		const projectArgs = directory ? ["--dir", project] : [];
		const result = spawnSync(process.execPath, [script, ...args, ...projectArgs], {
			cwd: directory ? REPO_ROOT : project,
			encoding: "utf8",
			timeout: 10_000,
		});
		assert.equal(result.status, 0, `${result.error?.message ?? ""}\n${result.stdout}\n${result.stderr}`);
		const chatUiRoot = join(REPO_ROOT, "packages", source);
		const target = join(project, "src/components/kit");
		for (const file of files) {
			assert.equal(
				readFileSync(join(target, file), "utf8"),
				readFileSync(join(chatUiRoot, "src/components", file), "utf8"),
				`组件及其依赖应复制到目标项目：${file}`,
			);
		}
		assert.equal(
			readFileSync(join(target, "theme.css"), "utf8"),
			readFileSync(join(chatUiRoot, "src/theme.css"), "utf8"),
		);
	});
}
