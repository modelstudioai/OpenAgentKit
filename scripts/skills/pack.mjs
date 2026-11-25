import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createArchive } from "./archive.mjs";
import { buildCopyInAssets } from "./copy-in-assets.mjs";
import { filesUnder, repositoryRoot, skillNames, skillOutputRoot, syncSkills } from "./generate.mjs";
import { portablePath } from "./validate.mjs";

export function packSkills({ root = repositoryRoot, output = resolve(root, "assets/skills/dist"), docs = false } = {}) {
	syncSkills({ root });
	const names = skillNames(root);
	let copyInAssets;
	const bundles = names.map((name) => {
		const directory = skillOutputRoot(root, name);
		const files = filesUnder(directory).map((source) => {
			const path = portablePath(relative(directory, source));
			if (/^agents\/openai\.ya?ml$/i.test(path))
				throw new Error(`Skill ${name} 包含客户端专用文件 ${path}，无法打包。`);
			return { path: `${name}/${path}`, source, content: readFileSync(source), mtimeMs: statSync(source).mtimeMs };
		});
		if (existsSync(resolve(directory, "scripts/install.mjs"))) {
			copyInAssets ??= buildCopyInAssets(root);
			const assets = [...copyInAssets.shared, ...copyInAssets.examples(name, resolve(directory, "examples"))];
			for (const asset of assets) files.push({ ...asset, path: `${name}/${asset.path}` });
		}
		return { name, files };
	});
	const allFiles = bundles.flatMap(({ files }) => files);
	mkdirSync(output, { recursive: true });
	for (const { name, files } of bundles) {
		writeFileSync(resolve(output, `${name}.tgz`), createArchive(files));
	}
	writeFileSync(resolve(output, "kit-skills.tgz"), createArchive(allFiles));
	if (docs) {
		const publicDirectory = resolve(root, "apps/storybook/public/skills");
		rmSync(publicDirectory, { recursive: true, force: true });
		mkdirSync(publicDirectory, { recursive: true });
		for (const { path, source, content, mtimeMs } of allFiles) {
			const target = resolve(publicDirectory, path);
			mkdirSync(dirname(target), { recursive: true });
			if (source) cpSync(source, target, { preserveTimestamps: true });
			else {
				writeFileSync(target, content);
				utimesSync(target, mtimeMs / 1000, mtimeMs / 1000);
			}
		}
		for (const name of [...names, "kit-skills"])
			cpSync(resolve(output, `${name}.tgz`), resolve(publicDirectory, `${name}.tgz`));
	}
	return { skills: names.length, output };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		const result = packSkills({ docs: process.argv.includes("--docs") });
		process.stdout.write(`Packed ${result.skills} Skills into ${relative(repositoryRoot, result.output)}.\n`);
	} catch (error) {
		process.stderr.write(`${error.message}\n`);
		process.exitCode = 1;
	}
}
