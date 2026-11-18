import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

// 通过真实启动入口保护冷启动顺序与失败隔离；替身只替代构建器/服务，不加载用户 .env。
function runDev(t, targets = [], { buildExit = 0, nodeVersion, entry = "dev", envContent, inheritedEnv = {} } = {}) {
	const root = mkdtempSync(join(tmpdir(), "kit-dev-test-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	mkdirSync(join(root, "scripts"));
	mkdirSync(join(root, "bin"));
	copyFileSync(new URL("./dev.mjs", import.meta.url), join(root, "scripts/dev.mjs"));
	if (entry === "start") {
		copyFileSync(new URL("./start.mjs", import.meta.url), join(root, "scripts/start.mjs"));
		copyFileSync(new URL("../.env.example", import.meta.url), join(root, ".env.example"));
	}
	if (envContent !== undefined) writeFileSync(join(root, ".env"), envContent);
	const executable = join(root, "bin/pnpm");
	writeFileSync(
		executable,
		`#!/usr/bin/env node
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
if (process.env.TEST_EXPECT_ENV) {
  const expected = JSON.parse(process.env.TEST_EXPECT_ENV);
  if (Object.entries(expected).some(([key, value]) => process.env[key] !== value)) process.exit(94);
}
const record = (stage, target) => appendFileSync("trace.jsonl", JSON.stringify({ stage, target }) + "\\n");
if (args[0] === "exec") {
  record("build-start");
  if (process.env.TEST_BUILD_EXIT !== "0") process.exit(Number(process.env.TEST_BUILD_EXIT));
  writeFileSync("dependencies-ready", "");
  record("build-ready");
} else {
  if (!existsSync("dependencies-ready")) process.exit(91);
  record("dev", args[1]);
  const timer = setInterval(() => {
    const started = readFileSync("trace.jsonl", "utf8").trim().split("\\n")
      .map((line) => JSON.parse(line)).filter((entry) => entry.stage === "dev");
    if (started.length === Number(process.env.TEST_TARGET_COUNT)) {
      clearInterval(timer);
      process.exit(0);
    }
  }, 10);
  setTimeout(() => process.exit(93), 3000).unref();
}
`,
	);
	chmodSync(executable, 0o755);
	// 无扩展名的可执行 fixture 使用 ESM，不依赖宿主目录的 package.json。
	writeFileSync(join(root, "bin/package.json"), '{"type":"module"}');
	const args = [];
	if (nodeVersion) {
		const preload = join(root, "node-version.cjs");
		writeFileSync(
			preload,
			`Object.defineProperty(process.versions, "node", { value: ${JSON.stringify(nodeVersion)} });
Object.defineProperty(process, "version", { value: ${JSON.stringify(`v${nodeVersion}`)} });`,
		);
		args.push("--require", preload);
	}
	const result = spawnSync(process.execPath, [...args, join(root, "scripts", `${entry}.mjs`), ...targets], {
		cwd: root,
		env: {
			PATH: `${join(root, "bin")}:${dirname(process.execPath)}:${process.env.PATH}`,
			TEST_BUILD_EXIT: String(buildExit),
			TEST_TARGET_COUNT: String(targets.length || (entry === "start" ? 3 : 4)),
			...inheritedEnv,
		},
		encoding: "utf8",
		timeout: 10_000,
	});
	assert.ifError(result.error);
	let trace = [];
	try {
		trace = readFileSync(join(root, "trace.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	return {
		...result,
		trace,
		envContent: existsSync(join(root, ".env")) ? readFileSync(join(root, ".env"), "utf8") : null,
	};
}

test("冷启动先完成依赖构建，再启动默认四个服务", (t) => {
	const result = runDev(t);
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(
		result.trace.slice(0, 2).map((entry) => entry.stage),
		["build-start", "build-ready"],
	);
	assert.deepEqual(
		result.trace
			.slice(2)
			.map((entry) => entry.target)
			.sort(),
		["@openagentpack/kit-server", "console", "storybook", "web"],
	);
});

test("依赖构建失败时保留退出码，不启动任何服务", (t) => {
	const result = runDev(t, [], { buildExit: 17 });
	assert.equal(result.status, 17);
	assert.deepEqual(result.trace, [{ stage: "build-start" }]);
});

test("指定 server 和 web 时，只启动所选应用", (t) => {
	const result = runDev(t, ["server", "web"]);
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(
		result.trace
			.slice(2)
			.map((entry) => entry.target)
			.sort(),
		["@openagentpack/kit-server", "web"],
	);
});

test("Node 23 在启动构建和服务前返回可执行提示", (t) => {
	const result = runDev(t, [], { nodeVersion: "23.11.1" });
	assert.equal(result.status, 1);
	assert.match(result.stderr, /需要 Node\.js >=24，当前为 v23\.11\.1/);
	assert.deepEqual(result.trace, []);
});

test("pnpm start 复用已有配置，并通过真实 dev 入口构建后启动三个应用", (t) => {
	const apiKey = "test-key#with spaces";
	const envContent = `# 保留已有配置\nKIT_GATEWAY=mock\nADMIN_TOKEN=existing-token\nBAILIAN_API_KEY='${apiKey}'\n`;
	const result = runDev(t, [], {
		entry: "start",
		envContent,
		inheritedEnv: {
			BAILIAN_API_KEY: "shell-key",
			TEST_EXPECT_ENV: JSON.stringify({ BAILIAN_API_KEY: apiKey, ADMIN_TOKEN: "existing-token" }),
		},
	});
	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.envContent, envContent);
	assert.match(result.stdout, /复用已有根 \.env/);
	assert.ok(!result.stdout.includes(apiKey));
	assert.ok(!result.stdout.includes("existing-token"));
	assert.deepEqual(
		result.trace
			.slice(2)
			.map((entry) => entry.target)
			.sort(),
		["@openagentpack/kit-server", "console", "web"],
	);
});

const shellAddresses = {
	BAILIAN_BASE_URL: "https://shell.example.invalid/agentstudio",
	BAILIAN_WORKSPACE_ID: "workspace-shell",
};

for (const [label, baseUrl, workspaceId, expected] of [
	["Workspace ID", "", "workspace-local", { BAILIAN_BASE_URL: "", BAILIAN_WORKSPACE_ID: "workspace-local" }],
	[
		"Base URL",
		"https://local.example.invalid/agentstudio",
		"",
		{ BAILIAN_BASE_URL: "https://local.example.invalid/agentstudio", BAILIAN_WORKSPACE_ID: "" },
	],
	["shell 地址", "", "", shellAddresses],
]) {
	test(`pnpm start 使用 ${label} 启动服务`, (t) => {
		const envContent = `KIT_GATEWAY=sdk\nBAILIAN_BASE_URL=${baseUrl}\nBAILIAN_WORKSPACE_ID=${workspaceId}\n`;
		const result = runDev(t, ["server"], {
			entry: "start",
			envContent,
			inheritedEnv: { ...shellAddresses, TEST_EXPECT_ENV: JSON.stringify(expected) },
		});
		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(result.trace.at(-1), { stage: "dev", target: "@openagentpack/kit-server" });
		assert.equal(result.envContent, envContent);
	});
}

test("pnpm start 支持指定目标，依赖构建失败时不启动服务且保留配置", (t) => {
	const envContent = "KIT_GATEWAY=mock\nADMIN_TOKEN=existing-token\n";
	const result = runDev(t, ["server"], { entry: "start", envContent, buildExit: 17 });
	assert.equal(result.status, 17);
	assert.equal(result.envContent, envContent);
	assert.deepEqual(result.trace, [{ stage: "build-start" }]);
});

test("首次在非交互环境启动时给出配置提示，不创建 .env 或启动服务", (t) => {
	const result = runDev(t, [], { entry: "start" });
	assert.equal(result.status, 1);
	assert.match(result.stderr, /首次配置需要交互式终端/);
	assert.equal(result.envContent, null);
	assert.deepEqual(result.trace, []);
});

test("pnpm start 的 Node 版本检查先于配置生成与构建", (t) => {
	const result = runDev(t, [], { entry: "start", nodeVersion: "23.11.1" });
	assert.equal(result.status, 1);
	assert.match(result.stderr, /需要 Node\.js >=24/);
	assert.equal(result.envContent, null);
	assert.deepEqual(result.trace, []);
});
