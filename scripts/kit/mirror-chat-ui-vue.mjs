#!/usr/bin/env node
/**
 * 把 chat-ui 中与框架无关的资产镜像到 chat-ui-vue（theme.css、各组件 strings.ts）。
 * 用法：node scripts/kit/mirror-chat-ui-vue.mjs [--check]
 * 默认写入；--check 只比对，不一致时退出码 1。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const sourceRoot = join(root, "packages/chat-ui");
const targetRoot = join(root, "packages/chat-ui-vue");
const check = process.argv.includes("--check");

function collectStrings(dir, out = []) {
	if (!existsSync(dir)) return out;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) collectStrings(full, out);
		else if (entry.name === "strings.ts") out.push(relative(sourceRoot, full));
	}
	return out;
}

const pairs = [{ from: "src/theme.css", to: "src/theme.css" }];
for (const file of collectStrings(join(sourceRoot, "src/components"))) {
	if (existsSync(join(targetRoot, dirname(file)))) pairs.push({ from: file, to: file });
}

const differences = [];
for (const { from, to } of pairs) {
	const source = readFileSync(join(sourceRoot, from), "utf8");
	const targetPath = join(targetRoot, to);
	if (!existsSync(targetPath)) {
		differences.push(`${to}: 缺失`);
		if (!check) {
			mkdirSync(dirname(targetPath), { recursive: true });
			writeFileSync(targetPath, source);
		}
		continue;
	}
	if (readFileSync(targetPath, "utf8") !== source) {
		differences.push(`${to}: 与 chat-ui 不一致`);
		if (!check) writeFileSync(targetPath, source);
	}
}

if (check) {
	if (differences.length) {
		console.error(`✕ chat-ui-vue 镜像漂移：\n- ${differences.join("\n- ")}`);
		console.error("运行 pnpm gen:chat-ui-vue 重新生成。");
		process.exit(1);
	}
	console.log(`✓ chat-ui-vue 镜像一致（${pairs.length} 个文件）`);
} else {
	console.log(`已同步 ${pairs.length} 个文件到 packages/chat-ui-vue`);
}
