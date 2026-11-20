#!/usr/bin/env node
/**
 * 把 apps/web 中与框架无关的共享模块镜像到 apps/web-vue。
 * 单一事实来源是 React 版；只允许复制纯 TS / 词表，不得包含 JSX 或 React 导入。
 * 用法：node scripts/kit/mirror-web-vue-shared.mjs [--check]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const sourceRoot = join(root, "apps/web");
const targetRoot = join(root, "apps/web-vue");
const check = process.argv.includes("--check");

const files = [
	"src/lib/backend.ts",
	"src/lib/chat-backend.ts",
	"src/lib/kit.ts",
	"src/lib/branding.ts",
	"src/i18n/server-error.ts",
	"src/features/auth/member-session-storage.ts",
];

const differences = [];
for (const file of files) {
	const source = readFileSync(join(sourceRoot, file), "utf8");
	const targetPath = join(targetRoot, file);
	if (!existsSync(targetPath)) {
		differences.push(`${file}: 缺失`);
		if (!check) {
			mkdirSync(dirname(targetPath), { recursive: true });
			writeFileSync(targetPath, source);
		}
		continue;
	}
	if (readFileSync(targetPath, "utf8") !== source) {
		differences.push(`${file}: 与 apps/web 不一致`);
		if (!check) writeFileSync(targetPath, source);
	}
}

if (check) {
	if (differences.length) {
		console.error(`✕ web-vue 共享模块漂移：\n- ${differences.join("\n- ")}`);
		console.error("运行 pnpm gen:web-vue-shared 重新生成。");
		process.exit(1);
	}
	console.log(`✓ web-vue 共享模块一致（${files.length} 个文件）`);
} else {
	console.log(`已同步 ${files.length} 个文件到 apps/web-vue`);
}
