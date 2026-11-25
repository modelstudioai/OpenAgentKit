import { cpSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { componentSourceFiles, copyComponentSource, readRegistry, resolveComponentClosure } from "./copy-in.mjs";
import { REPO_ROOT } from "./paths.mjs";

const USAGE = "用法：pnpm kit:add <component> [--framework react|vue] [--dir <project>]";
const {
	positionals,
	values: { dir, framework },
} = parseArgs({
	options: {
		dir: { type: "string" },
		framework: { type: "string", default: "react" },
	},
	allowPositionals: true,
});
const [name] = positionals;
const projectDir = resolve(dir ?? process.cwd());

if (!name || positionals.length > 1 || dir === "" || (framework !== "react" && framework !== "vue")) {
	console.error(USAGE);
	process.exit(1);
}
if (dir === undefined && projectDir === REPO_ROOT) {
	console.error("请传入 --dir <project> 指定组件复制到的项目目录。");
	process.exit(1);
}
if (!existsSync(join(projectDir, "package.json"))) {
	console.error(`目标不是项目目录：${projectDir}`);
	process.exit(1);
}

const chatUiRoot = join(REPO_ROOT, framework === "vue" ? "packages/chat-ui-vue" : "packages/chat-ui");
const registry = readRegistry(chatUiRoot);
const closure = resolveComponentClosure(registry, name);
if (!closure) {
	console.error(`未知组件：${name}（可选：${Object.keys(registry.components).join(", ")}）`);
	process.exit(1);
}

const targetDir = resolve(projectDir, "src/components/kit");
for (const component of closure) {
	const entry = registry.components[component];
	for (const file of componentSourceFiles(entry)) {
		const to = copyComponentSource(chatUiRoot, file, targetDir);
		console.log(`+ ${to}`);
	}
}
const themeTo = resolve(projectDir, "src/components/kit/theme.css");
if (!existsSync(themeTo)) {
	cpSync(join(chatUiRoot, registry.theme), themeTo);
}
console.log("组件已复制进你的项目，可自由修改；升级时按 docs 的 diff 指引合并。");
