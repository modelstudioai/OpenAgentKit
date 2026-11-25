import { readFileSync, statSync } from "node:fs";
import { dirname, posix, relative, resolve } from "node:path";
import ts from "typescript";
import {
	componentDestPath,
	componentSourceFiles,
	componentTarget,
	exampleTarget,
	readRegistry,
	sdkTarget,
} from "../kit/copy-in.mjs";
import { modules } from "./api-model.mjs";
import { filesUnder, portablePath } from "./validate.mjs";

const uiName = modules["chat-ui"].name;

function sourceFile(file, path) {
	return { path: `assets/kit/${path}`, content: readFileSync(file), mtimeMs: statSync(file).mtimeMs };
}

function jsonFile(path, value, mtimeMs) {
	return { path: `assets/kit/${path}`, content: `${JSON.stringify(value, null, 2)}\n`, mtimeMs };
}

function sdkSourceAssets(root) {
	const directory = resolve(root, "packages/sdk");
	const sourceDirectory = resolve(directory, "src");
	const manifestPath = resolve(directory, "package.json");
	const sdk = JSON.parse(readFileSync(manifestPath, "utf8"));
	const source = filesUnder(sourceDirectory).filter(
		(file) => /\.tsx?$/.test(file) && !/\.(?:test|spec)\.tsx?$/.test(file),
	);
	const paths = new Set(source);
	const modulePaths = new Map(Object.values(modules).map(({ name, path }) => [name, resolve(root, path)]));
	const publicEntries = new Map(
		Object.keys(sdk.exports).map((key) => {
			const specifier = `${sdk.name}${key.slice(1)}`;
			const file = modulePaths.get(specifier);
			if (!file || !paths.has(file)) throw new Error(`SDK 公开入口 ${key} 缺少可复制的源码。`);
			return [specifier, `${sdkTarget}/${portablePath(relative(sourceDirectory, file))}`];
		}),
	);
	return {
		name: sdk.name,
		publicEntries,
		files: [
			jsonFile("sdk/copy-in.json", { name: sdk.name, dependencies: sdk.dependencies }, statSync(manifestPath).mtimeMs),
			...source.map((file) => sourceFile(file, `sdk/src/${portablePath(relative(sourceDirectory, file))}`)),
		],
	};
}

function relativeImport(from, to) {
	const path = posix.relative(posix.dirname(from), to);
	return path.startsWith("../") ? path : `./${path}`;
}

function rewriteSdkImports(content, target, { name, publicEntries }) {
	const references = ts.preProcessFile(content, true, true).importedFiles;
	for (const { fileName, pos, end } of references.reverse()) {
		if (fileName !== name && !fileName.startsWith(`${name}/`)) continue;
		const entry = publicEntries.get(fileName);
		if (!entry) throw new Error(`${target} 导入了未公开的 Kit SDK 入口 ${fileName}。`);
		if (content.slice(pos + 1, end + 1) !== fileName) throw new Error(`无法转换 ${target} 的 SDK 导入 ${fileName}。`);
		content = `${content.slice(0, pos + 1)}${relativeImport(target, entry)}${content.slice(end + 1)}`;
	}
	return content;
}

function uiExports(root, directory, registry) {
	const barrel = resolve(root, modules["chat-ui"].path);
	const source = ts.createSourceFile(barrel, readFileSync(barrel, "utf8"), ts.ScriptTarget.Latest, true);
	const components = new Map(
		Object.entries(registry.components).flatMap(([name, entry]) =>
			componentSourceFiles(entry).map((file) => [
				resolve(directory, file),
				{ name, target: `${componentTarget}/${componentDestPath(file)}` },
			]),
		),
	);
	const exports = new Map();
	for (const statement of source.statements) {
		if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier) continue;
		const component = components.get(resolve(dirname(barrel), statement.moduleSpecifier.text));
		const { exportClause } = statement;
		if (!component || !exportClause || !ts.isNamedExports(exportClause)) {
			throw new Error(`组件公开入口缺少对应的 registry 条目：${statement.getText(source)}`);
		}
		for (const { name, propertyName } of exportClause.elements) {
			exports.set(name.text, { ...component, exportName: (propertyName ?? name).text });
		}
	}
	return exports;
}

function formatUiImports(clause, target, publicUi, components) {
	if (clause?.name || !clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) {
		throw new Error(`${target} 必须以具名方式导入 Kit 组件。`);
	}
	const imports = new Map();
	for (const binding of clause.namedBindings.elements) {
		const name = (binding.propertyName ?? binding.name).text;
		const entry = publicUi.get(name);
		if (!entry) throw new Error(`${target} 导入的组件 ${name} 缺少可复制的公开入口。`);
		components.add(entry.name);
		const local = binding.name.text;
		const specifier = entry.exportName === local ? local : `${entry.exportName} as ${local}`;
		const specifiers = imports.get(entry.target) ?? [];
		specifiers.push(clause.isTypeOnly || binding.isTypeOnly ? `type ${specifier}` : specifier);
		imports.set(entry.target, specifiers);
	}
	return [...imports]
		.map(([file, names]) => `import { ${names.join(", ")} } from ${JSON.stringify(relativeImport(target, file))};`)
		.join("\n");
}

function rewriteExampleUiImports(content, target, publicUi) {
	const source = ts.createSourceFile(target, content, ts.ScriptTarget.Latest, true);
	const components = new Set();
	for (const statement of [...source.statements].reverse()) {
		if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.text !== uiName) continue;
		const imports = formatUiImports(statement.importClause, target, publicUi, components);
		content = `${content.slice(0, statement.getStart(source))}${imports}${content.slice(statement.end)}`;
	}
	return { content, components: [...components] };
}

function buildExampleAssets(skill, source, sdk, publicUi) {
	const sources = filesUnder(source).filter((file) => /\.tsx?$/.test(file));
	const paths = new Set(sources);
	const options = { module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler };
	const examples = {};
	const assets = sources.map((file) => {
		const name = portablePath(relative(source, file));
		const asset = sourceFile(file, `examples/${name}`);
		const target = `${exampleTarget(skill)}/${name}`;
		const withSdk = rewriteSdkImports(asset.content.toString("utf8"), target, sdk);
		const { content, components } = rewriteExampleUiImports(withSdk, target, publicUi);
		const companions = new Set();
		for (const { fileName } of ts.preProcessFile(asset.content.toString("utf8"), true, true).importedFiles) {
			if (!fileName.startsWith("./") && !fileName.startsWith("../")) continue;
			const resolved = ts.resolveModuleName(fileName, file, options, ts.sys).resolvedModule?.resolvedFileName;
			if (!paths.has(resolved)) throw new Error(`示例 ${name} 缺少随附文件 ${fileName}。`);
			companions.add(portablePath(relative(source, resolved)));
		}
		examples[name] = { companions: [...companions], components };
		return { ...asset, content };
	});
	const modificationTime = Math.max(...assets.map(({ mtimeMs }) => mtimeMs), 0);
	return [jsonFile("examples/copy-in.json", { skill, examples }, modificationTime), ...assets];
}

export function buildCopyInAssets(root) {
	const directory = resolve(root, "packages/chat-ui");
	const registry = readRegistry(directory);
	const manifestPath = resolve(directory, "package.json");
	const { dependencies } = JSON.parse(readFileSync(manifestPath, "utf8"));
	const sdk = sdkSourceAssets(root);
	const components = new Set(Object.values(registry.components).flatMap(componentSourceFiles));
	const publicUi = uiExports(root, directory, registry);
	return {
		shared: [
			...sdk.files,
			sourceFile(resolve(root, "LICENSE"), "LICENSE"),
			jsonFile("chat-ui/dependencies.json", dependencies, statSync(manifestPath).mtimeMs),
			...["registry.json", registry.theme].map((path) => sourceFile(resolve(directory, path), `chat-ui/${path}`)),
			...[...components].map((path) => {
				const asset = sourceFile(resolve(directory, path), `chat-ui/${path}`);
				const target = `${componentTarget}/${componentDestPath(path)}`;
				const content = rewriteSdkImports(asset.content.toString("utf8"), target, sdk);
				return { ...asset, content };
			}),
		],
		examples: (skill, directory) => buildExampleAssets(skill, directory, sdk, publicUi),
	};
}
