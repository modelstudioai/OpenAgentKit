import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, symlinkSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const server = "@openagentpack/kit-server";
const packageName = /^(?:@[a-z0-9_][a-z0-9_.-]*\/)?[a-z0-9_][a-z0-9_.-]*$/i;

function under(parent, path) {
	const child = relative(parent, path);
	return child && !isAbsolute(child) && child !== ".." && !child.startsWith(`..${sep}`);
}

function copyPackage(record, target, workspace) {
	mkdirSync(target, { recursive: true });
	if (workspace) {
		const files = [...(record.manifest.files ?? []), "package.json"];
		for (const file of files) {
			const entry = resolve(record.source, file);
			if (!under(record.source, entry) || !existsSync(entry)) throw new Error(`工作区产物缺失 ${record.manifest.name}`);
			cpSync(entry, join(target, file), { recursive: true });
		}
		return;
	}
	cpSync(record.source, target, {
		recursive: true,
		verbatimSymlinks: true,
		filter: (path) => !/^(?:node_modules|\.git|\.npmrc|\.env(?:\..*)?)$/.test(basename(path)),
	});
}

function installedPackage(source, node, workspace, modules) {
	const inStore = under(modules, source);
	if (!inStore && !/^(?:apps|packages)\/[^/]+$/.test(relative(workspace, source).split(sep).join("/"))) {
		throw new Error("生产依赖位于工作区之外");
	}
	const manifest = JSON.parse(readFileSync(join(source, "package.json"), "utf8"));
	if (!packageName.test(manifest.name) || (inStore && manifest.version !== node.version)) {
		throw new Error(`安装内容与 pnpm 依赖清单不符 ${node.from ?? ""}`);
	}
	return { manifest, workspace: !inStore };
}

export function packageJavaBackend(root, output) {
	const listing = spawnSync("pnpm", ["--filter", server, "list", "--prod", "--depth", "Infinity", "--json"], {
		cwd: root,
		encoding: "utf8",
		maxBuffer: 32 * 1024 * 1024,
	});
	if (listing.status !== 0) throw new Error("无法读取 pnpm 已安装的生产依赖，请先执行 pnpm install --frozen-lockfile");
	const [app] = JSON.parse(listing.stdout);
	if (app?.name !== server) throw new Error("无法识别 Kit Server 的生产依赖");
	const modules = realpathSync(join(root, "node_modules", ".pnpm"));
	const workspace = realpathSync(root);
	const packages = new Map();

	function visit(node) {
		const source = realpathSync(node.path);
		let record = packages.get(source);
		if (!record) {
			const installed = installedPackage(source, node, workspace, modules);
			const directory =
				packages.size === 0
					? output
					: join(output, "node_modules", ".runtime", String(packages.size), installed.manifest.name);
			record = { ...installed, source, directory, edges: new Map() };
			packages.set(source, record);
		}
		for (const [alias, dependency] of Object.entries({ ...node.dependencies, ...node.optionalDependencies })) {
			if (!packageName.test(alias) || !dependency.path) throw new Error(`生产依赖缺失 ${alias}`);
			record.edges.set(alias, visit(dependency));
		}
		return record;
	}

	visit(app);
	for (const record of packages.values()) {
		for (const name of Object.keys(record.manifest.dependencies ?? {})) {
			if (!record.edges.has(name) && !record.manifest.optionalDependencies?.[name]) {
				throw new Error(`生产依赖缺失 ${record.manifest.name} → ${name}`);
			}
		}
		copyPackage(record, record.directory, record.workspace);
	}
	for (const record of packages.values()) {
		for (const [alias, dependency] of record.edges) {
			const link = join(record.directory, "node_modules", alias);
			mkdirSync(dirname(link), { recursive: true });
			symlinkSync(relative(dirname(link), dependency.directory), link, "dir");
		}
	}
}
