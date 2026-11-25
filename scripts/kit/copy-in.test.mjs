import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { test } from "node:test";
import { componentDestPath, componentSourceFiles, readRegistry, resolveComponentClosure } from "./copy-in.mjs";
import { REPO_ROOT } from "./paths.mjs";

/** 模拟 copy-in：specifier 字符串原样进入生成文件，所以相对导入必须按落点目录解析。 */
function resolveInCopiedTree(fromFile, specifier) {
	return normalize(join(dirname(componentDestPath(fromFile)), specifier));
}

for (const packageName of ["chat-ui", "chat-ui-vue"]) {
	test(`${packageName} copy-in 闭包中的每个组件都能独立复制并解析相对导入`, () => {
		const chatUiRoot = join(REPO_ROOT, "packages", packageName);
		const registry = readRegistry(chatUiRoot);
		for (const name of Object.keys(registry.components)) {
			const closure = resolveComponentClosure(registry, name);
			assert.ok(closure, `${name} 的 registry 闭包不存在`);
			const files = [...closure].flatMap((component) => componentSourceFiles(registry.components[component]));
			const copied = new Set(files.map(componentDestPath));
			for (const file of files) {
				const source = readFileSync(join(chatUiRoot, file), "utf8");
				const specifiers = [...source.matchAll(/(?:from|import)\s*"([^"]+)"/g)]
					.map((match) => match[1])
					.filter((specifier) => specifier.startsWith("."));
				for (const specifier of specifiers) {
					const target = resolveInCopiedTree(file, specifier);
					assert.ok(copied.has(target), `${file} -> ${specifier} 解析为 ${target}，不在生成树内`);
				}
			}
		}
	});
}

test("Vue Markdown 和代码高亮声明复制到独立项目所需的 hast 类型", () => {
	const registry = readRegistry(join(REPO_ROOT, "packages/chat-ui-vue"));
	for (const name of ["code-highlighter", "markdown"]) {
		assert.ok(registry.components[name]?.npmDependencies?.includes("@types/hast"), `${name} 直接引用 hast 类型`);
	}
});

test("组件及 process/ 子组件的落点保留独立目录层级", () => {
	assert.equal(
		componentDestPath("src/components/process/sub-agent-card/index.tsx"),
		"process/sub-agent-card/index.tsx",
	);
	assert.equal(componentDestPath("src/components/message/index.tsx"), "message/index.tsx");
});
