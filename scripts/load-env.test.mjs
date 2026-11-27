import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadLocalEnv } from "./load-env.mjs";

function fixture(t) {
	const root = mkdtempSync(join(tmpdir(), "kit-env-test-"));
	t.after(() => {
		const legacy = join(root, ".env");
		if (existsSync(legacy)) chmodSync(legacy, 0o600);
		rmSync(root, { recursive: true, force: true });
	});
	return root;
}

function read(root, name) {
	return readFileSync(join(root, name), "utf8");
}

test("旧 .env 按原字节复制到两个缺失的模式文件，之后不再读取", (t) => {
	const root = fixture(t);
	const original = "# 保留注释\r\nADMIN_TOKEN=existing-token\r\nBAILIAN_API_KEY=\r\n";
	writeFileSync(join(root, ".env"), original, { mode: 0o640 });
	const before = statSync(join(root, ".env"));
	const first = loadLocalEnv({
		root,
		defaultMode: "development",
		env: { ADMIN_TOKEN: "shell-token" },
	});
	assert.deepEqual(first.created, [".env.development", ".env.production"]);
	assert.equal(read(root, ".env"), original);
	assert.equal(read(root, ".env.development"), original);
	assert.equal(read(root, ".env.production"), original);
	assert.equal(statSync(join(root, ".env")).mtimeMs, before.mtimeMs);
	if (process.platform !== "win32") {
		assert.equal(statSync(join(root, ".env.development")).mode & 0o777, 0o600);
		assert.equal(statSync(join(root, ".env.production")).mode & 0o777, 0o600);
	}
	assert.equal(first.env.ADMIN_TOKEN, "existing-token");
	writeFileSync(join(root, ".env"), "ADMIN_TOKEN=changed-later\n");
	const second = loadLocalEnv({ root, defaultMode: "development", env: {} });
	assert.deepEqual(second.created, []);
	assert.equal(second.env.ADMIN_TOKEN, "existing-token");
	assert.equal(read(root, ".env.development"), original);
});

test("已有模式文件不被覆盖，只补缺失的那一份", (t) => {
	const root = fixture(t);
	writeFileSync(join(root, ".env"), "ADMIN_TOKEN=from-legacy\n");
	writeFileSync(join(root, ".env.production"), "ADMIN_TOKEN=keep-production\n");
	const loaded = loadLocalEnv({ root, defaultMode: "production", env: {} });
	assert.deepEqual(loaded.created, [".env.development"]);
	assert.equal(read(root, ".env.production"), "ADMIN_TOKEN=keep-production\n");
	assert.equal(read(root, ".env.development"), "ADMIN_TOKEN=from-legacy\n");
	assert.equal(loaded.env.ADMIN_TOKEN, "keep-production");
});

test("两个模式文件都存在时不打开 .env", (t) => {
	const root = fixture(t);
	writeFileSync(join(root, ".env.development"), "ADMIN_TOKEN=from-dev\n");
	writeFileSync(join(root, ".env.production"), "ADMIN_TOKEN=from-prod\n");
	writeFileSync(join(root, ".env"), "ADMIN_TOKEN=from-legacy\n");
	chmodSync(join(root, ".env"), 0o000);
	const loaded = loadLocalEnv({ root, defaultMode: "development", env: { KIT_ENV: "production" } });
	assert.deepEqual(loaded.created, []);
	assert.equal(loaded.mode, "production");
	assert.equal(loaded.env.ADMIN_TOKEN, "from-prod");
	assert.equal(read(root, ".env.development"), "ADMIN_TOKEN=from-dev\n");
});

test("模式文件里的空值不清掉 shell，百炼地址组的显式空值仍然生效", (t) => {
	const root = fixture(t);
	writeFileSync(
		join(root, ".env.development"),
		"ADMIN_TOKEN=\nBAILIAN_BASE_URL=\nBAILIAN_WORKSPACE_ID=workspace-local\n",
	);
	const loaded = loadLocalEnv({
		root,
		defaultMode: "development",
		env: {
			ADMIN_TOKEN: "shell-token",
			BAILIAN_BASE_URL: "https://shell.example.invalid/agentstudio",
			BAILIAN_WORKSPACE_ID: "workspace-shell",
		},
	});
	assert.equal(loaded.env.ADMIN_TOKEN, "shell-token");
	assert.equal(loaded.env.BAILIAN_BASE_URL, "");
	assert.equal(loaded.env.BAILIAN_WORKSPACE_ID, "workspace-local");
});

test("相对数据目录只相对仓库根拼接一次", (t) => {
	const root = fixture(t);
	writeFileSync(
		join(root, ".env.development"),
		"KIT_DATA_DIR=.data\nKIT_EVAL_WORKSPACES=workspaces/a, /tmp/kit-eval\n",
	);
	const first = loadLocalEnv({ root, defaultMode: "development", env: {} });
	assert.equal(first.env.KIT_DATA_DIR, join(root, ".data"));
	assert.equal(first.env.KIT_EVAL_WORKSPACES, `${join(root, "workspaces/a")},/tmp/kit-eval`);
	const second = loadLocalEnv({ root, defaultMode: "development", env: first.env });
	assert.equal(second.env.KIT_DATA_DIR, first.env.KIT_DATA_DIR);
	assert.equal(second.env.KIT_EVAL_WORKSPACES, first.env.KIT_EVAL_WORKSPACES);
});

test("未配置数据目录时使用仓库根 .data，再次加载不重复拼接", (t) => {
	const root = fixture(t);
	writeFileSync(join(root, ".env.development"), "ADMIN_TOKEN=token\n");
	const first = loadLocalEnv({ root, defaultMode: "development", env: {} });
	assert.equal(first.env.KIT_DATA_DIR, join(root, ".data"));
	const second = loadLocalEnv({ root, defaultMode: "development", env: first.env });
	assert.equal(second.env.KIT_DATA_DIR, first.env.KIT_DATA_DIR);
});

test("migrate 为 false 时不从旧 .env 复制", (t) => {
	const root = fixture(t);
	writeFileSync(join(root, ".env"), "ADMIN_TOKEN=from-legacy\n");
	writeFileSync(join(root, ".env.production"), "ADMIN_TOKEN=from-prod\n");
	const loaded = loadLocalEnv({
		root,
		defaultMode: "production",
		env: { KIT_ENV: "production" },
		migrate: false,
	});
	assert.deepEqual(loaded.created, []);
	assert.equal(loaded.env.ADMIN_TOKEN, "from-prod");
	assert.throws(() => read(root, ".env.development"), { code: "ENOENT" });
	assert.equal(read(root, ".env"), "ADMIN_TOKEN=from-legacy\n");
});

test("非法 KIT_ENV 在复制前失败", (t) => {
	const root = fixture(t);
	writeFileSync(join(root, ".env"), "ADMIN_TOKEN=existing-token\n");
	assert.throws(
		() => loadLocalEnv({ root, defaultMode: "development", env: { KIT_ENV: "staging" } }),
		/KIT_ENV 只接受 development 或 production/,
	);
	assert.equal(readFileSync(join(root, ".env"), "utf8"), "ADMIN_TOKEN=existing-token\n");
	assert.throws(() => read(root, ".env.development"), { code: "ENOENT" });
	assert.throws(() => read(root, ".env.production"), { code: "ENOENT" });
});

test("日志只包含文件名和变量名", (t) => {
	const root = fixture(t);
	const secret = "secret-value";
	writeFileSync(join(root, ".env"), `BAILIAN_API_KEY=${secret}\n`);
	const lines = [];
	loadLocalEnv({
		root,
		defaultMode: "development",
		env: { BAILIAN_API_KEY: "shell-key" },
		log: (line) => lines.push(line),
	});
	const output = lines.join("\n");
	assert.match(output, /已从 \.env 复制到 \.env\.development、\.env\.production/);
	assert.match(output, /BAILIAN_API_KEY/);
	assert.equal(output.includes(secret), false);
	assert.equal(output.includes("shell-key"), false);
});
