import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { build } from "esbuild";
import { repositoryRoot } from "../generate.mjs";
import { packSkills } from "../pack.mjs";

function linkDependency(project, name, source) {
	const link = resolve(project, "node_modules", name);
	mkdirSync(dirname(link), { recursive: true });
	symlinkSync(source, link, "junction");
}

test("a standalone Skill copies local SDK entries and the selected UI closure into a project", async (t) => {
	const directory = mkdtempSync(resolve(tmpdir(), "kit-skill-copy-in-"));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	packSkills({ output: directory });
	execFileSync("tar", ["-xzf", resolve(directory, "use-kit-chat.tgz"), "-C", directory]);
	const installer = resolve(directory, "use-kit-chat/scripts/install.mjs");
	const project = resolve(directory, "external app");
	const packagePath = resolve(project, "package.json");
	const copy = (...components) => execFileSync(process.execPath, [installer, "--dir", project, ...components]);
	mkdirSync(project);
	writeFileSync(
		packagePath,
		JSON.stringify({
			name: "external-app",
			private: true,
			dependencies: { react: "^19", lowlight: "3.3.0" },
		}),
	);

	copy();
	const sdkPath = resolve(project, "src/sdk");
	const uiPath = resolve(project, "src/components/kit");
	const manifest = () => JSON.parse(readFileSync(packagePath, "utf8"));
	assert.ok(!Object.hasOwn(manifest(), "imports"));
	assert.ok(!manifest().dependencies["@openagentpack/kit-sdk"]);
	assert.ok(manifest().dependencies["@openagentpack/sdk"]);
	assert.ok(manifest().dependencies.zod);
	assert.ok(!existsSync(resolve(sdkPath, "lib")), "source copy-in must be usable without a prebuilt SDK");
	assert.ok(!existsSync(resolve(project, "vendor")), "SDK sources must be copied into the application's src directory");
	assert.ok(!existsSync(uiPath), "SDK-only use should leave the app's UI untouched");

	// Reuse the installed public dependencies to run without a registry, then edit the
	// app's copy to show that a Node consumer sees it on the next application build.
	for (const name of ["@openagentpack/sdk", "zod"]) {
		linkDependency(project, name, resolve(repositoryRoot, "packages/sdk/node_modules", name));
	}
	const requestSource = resolve(sdkPath, "request/index.ts");
	const originalRequest = readFileSync(requestSource, "utf8");
	writeFileSync(requestSource, `${originalRequest}\nexport const localEdit = "copied SDK source";\n`);
	const nodeBundle = await build({
		absWorkingDir: project,
		stdin: {
			contents:
				'import { createRequest, localEdit } from "./src/sdk/request/index.ts"; console.log(typeof createRequest, localEdit);',
			resolveDir: project,
		},
		bundle: true,
		packages: "external",
		platform: "node",
		format: "esm",
		write: false,
		logLevel: "silent",
	});
	const entry = resolve(project, "request-consumer.mjs");
	writeFileSync(entry, nodeBundle.outputFiles[0].text);
	assert.equal(execFileSync(process.execPath, [entry], { encoding: "utf8" }).trim(), "function copied SDK source");
	writeFileSync(requestSource, originalRequest);

	const unrelatedImports = { "#app-settings": "./src/settings.ts" };
	writeFileSync(packagePath, JSON.stringify({ ...manifest(), imports: unrelatedImports }));
	copy("--example", "experience.tsx");
	assert.equal(manifest().dependencies.lowlight, "3.3.0", "preserve the application's existing version");
	assert.deepEqual(manifest().imports, unrelatedImports);
	for (const name of ["react-markdown", "mermaid", "@radix-ui/react-dialog"]) {
		assert.ok(manifest().dependencies[name], `missing runtime dependency ${name}`);
	}
	for (const file of ["chat/index.tsx", "message-list/index.tsx", "process/sub-agent-card/index.tsx", "theme.css"]) {
		assert.ok(existsSync(resolve(uiPath, file)), `missing copied file ${file}`);
	}
	assert.ok(!existsSync(resolve(uiPath, "menu")), "an unrelated component should be absent");
	const examples = resolve(project, "src/kit-examples/use-kit-chat");
	for (const file of ["experience.tsx", "agent-resources-panel.tsx", "approval-list.tsx"]) {
		const code = readFileSync(resolve(examples, file), "utf8");
		assert.match(code, /from "\.\.\/\.\.\/sdk\//);
		assert.doesNotMatch(code, /#kit-sdk\/|@openagentpack\/kit-/);
	}
	const component = readFileSync(resolve(uiPath, "chat/index.tsx"), "utf8");
	assert.match(component, /from "\.\.\/\.\.\/\.\.\/sdk\//);

	for (const name of ["react-dom", ...Object.keys(manifest().dependencies)]) {
		if (!existsSync(resolve(project, "node_modules", name)))
			linkDependency(project, name, resolve(repositoryRoot, "packages/chat-ui/node_modules", name));
	}
	const bundled = await build({
		absWorkingDir: project,
		entryPoints: [resolve(examples, "experience.tsx")],
		bundle: true,
		jsx: "automatic",
		platform: "browser",
		write: false,
		metafile: true,
		logLevel: "silent",
	});
	assert.ok(
		Object.keys(bundled.metafile.inputs).some((file) => file.endsWith("src/sdk/chat/hooks/index.ts")),
		"the browser build must use the copied SDK",
	);

	const before = readFileSync(packagePath, "utf8");
	copy("--example", "experience.tsx");
	assert.equal(readFileSync(packagePath, "utf8"), before, "reapplying the same selection is safe");
	const chatPath = resolve(uiPath, "chat/index.tsx");
	writeFileSync(chatPath, "// 目标项目自定义的组件\n");
	const conflict = spawnSync(process.execPath, [installer, "--dir", project, "chat", "menu"], { encoding: "utf8" });
	assert.equal(conflict.status, 1);
	assert.match(conflict.stderr, /chat[/\\]index\.tsx/);
	assert.equal(readFileSync(chatPath, "utf8"), "// 目标项目自定义的组件\n");
	assert.equal(readFileSync(packagePath, "utf8"), before);
	assert.ok(!existsSync(resolve(uiPath, "menu")), "check conflicts before writing unrelated files");
});
