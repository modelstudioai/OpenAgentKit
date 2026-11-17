import { cpSync, mkdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createArchive } from "./archive.mjs";
import { buildCopyInAssets } from "./copy-in-assets.mjs";
import { filesUnder, repositoryRoot, skillNames, skillOutputRoot, syncSkills } from "./generate.mjs";
import { portablePath } from "./validate.mjs";

export function packSkills({ root = repositoryRoot, output = resolve(root, "assets/skills/dist"), docs = false } = {}) {
	syncSkills({ root });
	const copyInAssets = buildCopyInAssets(root);
	mkdirSync(output, { recursive: true });
	const distributions = skillNames(root).map((name) => {
		const directory = skillOutputRoot(root, name);
		const assets = [...copyInAssets.shared, ...copyInAssets.examples(name, resolve(directory, "examples"))];
		return { name, directory, assets };
	});
	const allFiles = [];
	for (const { name, directory, assets } of distributions) {
		const files = [
			...filesUnder(directory).map((file) => ({
				path: `${name}/${portablePath(relative(directory, file))}`,
				content: readFileSync(file),
				mtimeMs: statSync(file).mtimeMs,
			})),
			...assets.map((file) => ({ ...file, path: `${name}/${file.path}` })),
		];
		allFiles.push(...files);
		writeFileSync(resolve(output, `${name}.tgz`), createArchive(files));
	}
	writeFileSync(resolve(output, "kit-skills.tgz"), createArchive(allFiles));
	if (docs) {
		const publicDirectory = resolve(root, "apps/storybook/public/skills");
		rmSync(publicDirectory, { recursive: true, force: true });
		mkdirSync(publicDirectory, { recursive: true });
		for (const { name, directory, assets } of distributions) {
			cpSync(directory, resolve(publicDirectory, name), {
				recursive: true,
				preserveTimestamps: true,
			});
			for (const asset of assets) {
				const file = resolve(publicDirectory, name, asset.path);
				mkdirSync(dirname(file), { recursive: true });
				writeFileSync(file, asset.content);
				utimesSync(file, asset.mtimeMs / 1000, asset.mtimeMs / 1000);
			}
		}
		for (const name of [...distributions.map(({ name }) => name), "kit-skills"])
			cpSync(resolve(output, `${name}.tgz`), resolve(publicDirectory, `${name}.tgz`));
	}
	return { skills: distributions.length, output };
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
