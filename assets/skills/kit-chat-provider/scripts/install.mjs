import {
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
	componentDestPath,
	componentSourceFiles,
	componentTarget,
	exampleTarget,
	readRegistry,
	resolveComponentClosure,
	sdkTarget,
} from "./copy-in.mjs";

const legacySdkName = "@openagentpack/kit-sdk";
const assetRoot = fileURLToPath(new URL("../assets/kit/", import.meta.url));
const usage = "用法：node <Skill>/scripts/install.mjs --dir <项目目录> [--example <文件> ...] [组件名 ...]";

function addTree(plan, source, target) {
	for (const entry of readdirSync(source, { withFileTypes: true })) {
		const input = join(source, entry.name);
		const output = join(target, entry.name);
		if (entry.isDirectory()) addTree(plan, input, output);
		else if (entry.isFile()) plan.set(output, readFileSync(input));
		else throw new Error(`无效的 Skill 资产：${entry.name}`);
	}
}

function planExamples(plan, selected, project) {
	if (!selected.length) return { components: [] };
	const source = join(assetRoot, "examples");
	const { skill, examples } = JSON.parse(readFileSync(join(source, "copy-in.json"), "utf8"));
	const directory = exampleTarget(skill);
	const pending = [...selected];
	const visited = new Set();
	const components = new Set();
	while (pending.length) {
		const file = pending.pop();
		if (visited.has(file)) continue;
		visited.add(file);
		if (!Object.hasOwn(examples, file)) throw new Error(`未知示例 ${file}，可选：${Object.keys(examples).join("、")}`);
		const example = examples[file];
		plan.set(join(project, directory, file), readFileSync(join(source, file)));
		pending.push(...example.companions);
		for (const component of example.components) components.add(component);
	}
	return { components: [...components], directory };
}

function planComponents(plan, selected, project, sdkName) {
	if (!selected.length) return {};
	const source = join(assetRoot, "chat-ui");
	const registry = readRegistry(source);
	const versions = JSON.parse(readFileSync(join(source, "dependencies.json"), "utf8"));
	const components = new Set();
	for (const name of selected) {
		const closure = Object.hasOwn(registry.components, name) && resolveComponentClosure(registry, name);
		if (!closure) throw new Error(`未知组件 ${name}，可选：${Object.keys(registry.components).join("、")}`);
		for (const component of closure) components.add(component);
	}
	const target = join(project, componentTarget);
	const entries = [...components].map((component) => registry.components[component]);
	for (const file of entries.flatMap(componentSourceFiles)) {
		plan.set(join(target, componentDestPath(file)), readFileSync(join(source, file)));
	}
	const dependencies = {};
	for (const name of new Set(entries.flatMap((entry) => entry.npmDependencies ?? []))) {
		if (name === sdkName) continue;
		if (!versions[name]) throw new Error(`组件清单缺少依赖 ${name} 的版本。`);
		dependencies[name] = versions[name];
	}
	plan.set(join(target, "theme.css"), readFileSync(join(source, registry.theme)));
	plan.set(join(target, "LICENSE"), readFileSync(join(assetRoot, "LICENSE")));
	return dependencies;
}

function mergeDependencies(manifest, dependencies, sdkName) {
	const groups = [
		manifest.dependencies,
		manifest.devDependencies,
		manifest.optionalDependencies,
		manifest.peerDependencies,
	];
	const existingSdk = [sdkName, legacySdkName].find((name) =>
		groups.some((group) => group && Object.hasOwn(group, name)),
	);
	if (existingSdk) {
		throw new Error(`项目已声明 ${existingSdk} 包依赖。切换源码接入时，请按 Skill 指引迁移导入并移除此依赖。`);
	}
	const additions = Object.fromEntries(
		Object.entries(dependencies).filter(([name]) => !groups.some((group) => group && Object.hasOwn(group, name))),
	);
	return { ...manifest, dependencies: { ...manifest.dependencies, ...additions } };
}

function checkDestinations(project, plan) {
	const pending = new Map();
	const conflicts = [];
	for (const [file, content] of plan) {
		const path = relative(project, file);
		const segments = path.split(sep);
		if (segments[0] === "..") throw new Error(`目标文件越出项目目录：${path}`);
		let parent = project;
		for (const segment of segments.slice(0, -1)) {
			parent = join(parent, segment);
			const stat = lstatSync(parent, { throwIfNoEntry: false });
			if (stat && !stat.isDirectory()) throw new Error(`目标目录不可用：${relative(project, parent)}`);
		}
		const stat = lstatSync(file, { throwIfNoEntry: false });
		if (!stat) pending.set(file, content);
		else if (!stat.isFile() || !readFileSync(file).equals(content)) conflicts.push(path);
	}
	if (conflicts.length)
		throw new Error(`以下文件与 Skill 资产有差异，请先合并或保留现有版本：\n${conflicts.join("\n")}`);
	return pending;
}

function updateManifest(file, previous, manifest) {
	if (JSON.stringify(JSON.parse(previous)) === JSON.stringify(manifest)) return;
	const indent = previous.match(/^([\t ]+)"/m)?.[1] ?? "  ";
	const lineEnding = previous.includes("\r\n") ? "\r\n" : "\n";
	const next = `${JSON.stringify(manifest, null, indent)}\n`.replaceAll("\n", lineEnding);
	const directory = mkdtempSync(join(dirname(file), ".kit-copy-in-"));
	try {
		const staging = join(directory, "package.json");
		writeFileSync(staging, next, { mode: lstatSync(file).mode });
		if (readFileSync(file, "utf8") !== previous) throw new Error("并行修改了 package.json，请检查后重试。");
		renameSync(staging, file);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

function install(directory, components, examples) {
	const project = realpathSync(resolve(directory));
	const packagePath = join(project, "package.json");
	if (!lstatSync(packagePath, { throwIfNoEntry: false })?.isFile()) {
		throw new Error("--dir 必须指向包含 package.json 的应用目录。");
	}
	const previous = readFileSync(packagePath, "utf8");
	const manifest = JSON.parse(previous);
	const sdk = join(assetRoot, "sdk");
	const sdkMetadata = join(sdk, "copy-in.json");
	if (!lstatSync(sdkMetadata, { throwIfNoEntry: false })?.isFile()) {
		throw new Error("缺少 Kit SDK 资产。请解压完整的 Skill 离线包并使用其中的目录。");
	}
	const { name: sdkName, dependencies } = JSON.parse(readFileSync(sdkMetadata, "utf8"));
	const plan = new Map();
	addTree(plan, join(sdk, "src"), join(project, sdkTarget));
	plan.set(join(project, sdkTarget, "LICENSE"), readFileSync(join(assetRoot, "LICENSE")));
	const examplePlan = planExamples(plan, examples, project);
	const selected = [...components, ...examplePlan.components];
	const nextManifest = mergeDependencies(
		manifest,
		{ ...dependencies, ...planComponents(plan, selected, project, sdkName) },
		sdkName,
	);
	const pending = checkDestinations(project, plan);
	for (const [file, content] of pending) {
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, content, { flag: "wx" });
	}
	updateManifest(packagePath, previous, nextManifest);
	process.stdout.write(`已就绪：${sdkTarget}。\n`);
	if (selected.length) process.stdout.write(`已就绪：${componentTarget}，包括组件依赖和 theme.css。\n`);
	if (examplePlan.directory) process.stdout.write(`已就绪：${examplePlan.directory}，包括示例依赖。\n`);
	process.stdout.write("请使用目标项目的包管理器安装依赖并更新锁文件。\n");
}

try {
	const { values, positionals } = parseArgs({
		options: { dir: { type: "string" }, example: { type: "string", multiple: true }, help: { type: "boolean" } },
		allowPositionals: true,
	});
	if (values.help) process.stdout.write(`${usage}\n`);
	else {
		if (!values.dir) throw new Error(usage);
		install(values.dir, positionals, values.example ?? []);
	}
} catch (error) {
	process.stderr.write(`${error.message}\n`);
	process.exitCode = 1;
}
