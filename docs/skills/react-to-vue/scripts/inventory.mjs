#!/usr/bin/env node
/**
 * React 组件移植清单（启发式）。
 * 用法：node docs/skills/react-to-vue/scripts/inventory.mjs <React 文件或目录>
 * 只读源码做正则扫描，不替代逐行阅读。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const targets = process.argv.slice(2);
if (!targets.length) {
	console.error("用法：node inventory.mjs <React 文件或目录>");
	process.exit(1);
}

function files(path) {
	const stat = statSync(path);
	if (stat.isFile()) return [path];
	return readdirSync(path)
		.flatMap((name) => files(join(path, name)))
		.filter((file) => [".ts", ".tsx"].includes(extname(file)) && !file.includes(".test."));
}

const HOOK = /\b(use[A-Z][A-Za-z0-9]*)\s*\(/g;
const NODE_PROP = /(\w+)\??\s*:\s*(ReactNode|ReactElement|ReactNode\[\]|ReactElement\[\])/g;
const TESTID = /data-testid="([^"]+)"/g;
const ARIA = /aria-([a-z]+)="([^"]+)"/g;
const ROLE = /role="([^"]+)"/g;
const PORTAL = /\bcreatePortal\b/;
const IMPERATIVE = /\b(forwardRef|useImperativeHandle)\b/;

function collect(source, re) {
	return [...source.matchAll(re)];
}

const out = [];
for (const file of targets.flatMap(files)) {
	const source = readFileSync(file, "utf8");
	const hooks = new Map();
	for (const [, name] of collect(source, HOOK)) hooks.set(name, (hooks.get(name) ?? 0) + 1);
	const nodeProps = [...new Set(collect(source, NODE_PROP).map((m) => `${m[1]}: ${m[2]}`))];
	const testids = [...new Set(collect(source, TESTID).map((m) => m[1]))];
	const arias = [...new Set(collect(source, ARIA).map((m) => `aria-${m[1]}="${m[2]}"`))];
	const roles = [...new Set(collect(source, ROLE).map((m) => m[1]))];

	out.push(`\n## ${file}`);
	out.push(`- hooks: ${hooks.size ? [...hooks].map(([k, v]) => `${k}(${v})`).join(", ") : "无"}`);
	out.push(`- 插槽候选: ${nodeProps.length ? nodeProps.join(", ") : "无"}`);
	out.push(`- testid: ${testids.length ? testids.join(", ") : "无"}`);
	out.push(`- aria: ${arias.length ? arias.join(", ") : "无"}`);
	out.push(`- role: ${roles.length ? roles.join(", ") : "无"}`);
	if (PORTAL.test(source)) out.push("- 需要 Teleport：createPortal");
	if (IMPERATIVE.test(source)) out.push("- 需要 defineExpose：forwardRef / useImperativeHandle");
}

out.push("\n下一步：对照 SKILL.md 的 Step 0 分类与 Step 4 合同自检。");
process.stdout.write(`${out.join("\n")}\n`);
