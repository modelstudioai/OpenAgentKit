#!/usr/bin/env node
/**
 * i18n 键对齐门禁（方案 docs/research/2026-11-18-internationalization-plan.md §9）：
 * 1) 每个 app 的 src/i18n/locales/{zh-CN,en} 命名空间与展平键集合双向对齐，不一致即失败；
 * 2) zh-CN 中未被 app 源码引用的键仅告警（存量迁移未清零，不阻断）。
 * 词表使用纯对象字面量 TS 文件，Node ≥24 原生 type stripping 直接加载。
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_APPS = ["apps/web", "apps/console"];
export const DEFAULT_LOCALES = ["zh-CN", "en"];
export const CHAT_UI_COMPONENTS = "packages/chat-ui/src/components";

/** 把嵌套词表展平成点分键列表；非字符串叶子记为非法键使对齐检查失败。 */
export function flattenKeys(value, prefix = "", out = []) {
	if (value !== null && typeof value === "object" && !Array.isArray(value)) {
		for (const [key, child] of Object.entries(value)) {
			flattenKeys(child, prefix ? `${prefix}.${key}` : key, out);
		}
	} else if (typeof value !== "string") {
		out.push(prefix ? `${prefix}!<non-string>` : "!<non-string>");
	} else {
		out.push(prefix);
	}
	return out;
}

async function loadNamespaceMap(localeDir) {
	const map = {};
	if (!existsSync(localeDir)) return map;
	for (const file of readdirSync(localeDir)) {
		if (!file.endsWith(".ts")) continue;
		const ns = file.slice(0, -".ts".length);
		const mod = await import(pathToFileURL(resolve(localeDir, file)).href);
		map[ns] = mod.default ?? {};
	}
	return map;
}

/** 比对单个命名空间的展平键集合，双向差异写入 problems。 */
function diffKeys(prefix, zhTree, enTree, problems) {
	const zhKeys = new Set(flattenKeys(zhTree));
	const enKeys = new Set(flattenKeys(enTree));
	for (const key of zhKeys) {
		if (!enKeys.has(key)) problems.push(`${prefix}${key}: en 缺失`);
	}
	for (const key of enKeys) {
		if (!zhKeys.has(key)) problems.push(`${prefix}${key}: en 多出（zh-CN 是唯一事实来源）`);
	}
}

/** 双向比对两个 locale 词表目录，返回人类可读的问题清单（空数组即通过）。 */
export async function compareLocaleDirs(zhDir, enDir) {
	const problems = [];
	const zh = await loadNamespaceMap(zhDir);
	const en = await loadNamespaceMap(enDir);
	for (const ns of new Set([...Object.keys(zh), ...Object.keys(en)])) {
		if (!zh[ns]) problems.push(`${ns}: zh-CN 缺少命名空间文件`);
		if (!en[ns]) problems.push(`${ns}: en 缺少命名空间文件`);
		if (zh[ns] && en[ns]) diffKeys(`${ns}.`, zh[ns], en[ns], problems);
	}
	return problems;
}

/** 递归收集组件目录里的词典文件（strings.ts）。 */
function findStringsFiles(dir, out = []) {
	if (!existsSync(dir)) return out;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) findStringsFiles(full, out);
		else if (entry.name === "strings.ts") out.push(full);
	}
	return out;
}

/** chat-ui 词典守护：每个 strings.ts 必须默认导出 { "zh-CN", en } 且键双向对齐。 */
export async function checkChatUiStrings(componentsDir) {
	const problems = [];
	for (const file of findStringsFiles(componentsDir)) {
		const label = `${relative(process.cwd(), componentsDir)} → ${relative(componentsDir, file)}`;
		const table = (await import(pathToFileURL(resolve(file)).href)).default;
		if (!table || typeof table !== "object" || !table["zh-CN"] || !table.en) {
			problems.push(`${label}: 词典必须 default 导出 { "zh-CN": {...}, en: {...} }`);
			continue;
		}
		diffKeys(`${label}: `, table["zh-CN"], table.en, problems);
	}
	return problems;
}

function readSourceText(srcDir) {
	const chunks = [];
	const walk = (dir) => {
		for (const entry of readdirSync(dir)) {
			const full = join(dir, entry);
			if (statSync(full).isDirectory()) {
			// 词表目录（locales）自身不算引用；i18n 引导代码里的 t() 调用计入引用。
			if (entry !== "locales") walk(full);
			} else if (/\.(ts|tsx)$/.test(entry)) {
				chunks.push(readFileSync(full, "utf8"));
			}
		}
	};
	if (existsSync(srcDir)) walk(srcDir);
	return chunks.join("\n");
}

/** 检查单个 app（如 apps/web）：返回 { problems, warnings }。 */
export async function checkApp(appDir) {
	const problems = [];
	const warnings = [];
	const localesDir = join(appDir, "src/i18n/locales");
	if (!existsSync(localesDir)) return { problems, warnings };
	const label = relative(process.cwd(), appDir) || appDir;
	for (const problem of await compareLocaleDirs(join(localesDir, "zh-CN"), join(localesDir, "en"))) {
		problems.push(`${label}: ${problem}`);
	}
	const source = readSourceText(join(appDir, "src"));
	const zh = await loadNamespaceMap(join(localesDir, "zh-CN"));
	for (const [ns, tree] of Object.entries(zh)) {
		for (const key of flattenKeys(tree)) {
			// 默认命名空间下代码用短键 t("a.b")；三种引用形态任一命中即视为已引用。
			if (!source.includes(`${ns}.${key}`) && !source.includes(`${ns}:${key}`) && !source.includes(key)) {
				warnings.push(`${label}: 未被引用的键 ${ns}.${key}`);
			}
		}
	}
	return { problems, warnings };
}

async function main() {
	const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
	const targets = args.length ? args : DEFAULT_APPS;
	let failed = false;
	for (const app of targets) {
		const { problems, warnings } = await checkApp(app);
		for (const warning of warnings) console.warn(`⚠ ${warning}`);
		for (const problem of problems) {
			console.error(`✕ ${problem}`);
			failed = true;
		}
	}
	if (!args.length) {
		for (const problem of await checkChatUiStrings(CHAT_UI_COMPONENTS)) {
			console.error(`✕ ${problem}`);
			failed = true;
		}
	}
	if (failed) {
		console.error("i18n 键对齐检查失败：zh-CN 为唯一事实来源，en 必须双向对齐（见方案 §5、§9）。");
		process.exit(1);
	}
	console.log("✓ i18n 键对齐检查通过");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	await main();
}
