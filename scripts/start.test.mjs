import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseEnv } from "node:util";
import { initializeEnv } from "./start.mjs";

// 保护首次配置、既有凭据不变与中断恢复；只在临时目录使用虚构凭据。
function fixture(t, answers = []) {
	const root = mkdtempSync(join(tmpdir(), "kit-start-test-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	copyFileSync(new URL("../.env.example", import.meta.url), join(root, ".env.example"));
	const questions = [];
	let closed = false;
	return {
		root,
		questions,
		get closed() {
			return closed;
		},
		createPrompt: () => ({
			async ask(question, options) {
				questions.push({ question, ...options });
				assert.ok(answers.length, "不应请求额外输入");
				const answer = answers.shift();
				if (answer instanceof Error) throw answer;
				return typeof answer === "function" ? answer(root) : answer;
			},
			close() {
				closed = true;
			},
		}),
	};
}

test("首次选择 Mock 后生成管理员令牌与成员登录配置，无需云凭据", async (t) => {
	const config = fixture(t, [""]);
	assert.equal(await initializeEnv(config.root, config), true);
	const path = join(config.root, ".env");
	const env = parseEnv(readFileSync(path, "utf8"));
	assert.equal(env.KIT_GATEWAY, "mock");
	assert.equal(env.KIT_AUTH_MODE, "member");
	assert.equal(env.KIT_DATA_DIR, ".scratch/local-demo/data");
	assert.match(env.ADMIN_TOKEN, /^[a-f0-9]{64}$/);
	assert.equal(env.BAILIAN_API_KEY, "");
	assert.equal(env.PORT, "8787");
	if (process.platform !== "win32") assert.equal(statSync(path).mode & 0o777, 0o600);
	assert.equal(config.questions.length, 1);
	assert.equal(config.closed, true);
});

for (const [address, value, field, unusedField] of [
	["1", "workspace-test", "BAILIAN_WORKSPACE_ID", "BAILIAN_BASE_URL"],
	["2", "https://example.com/workspaces/test", "BAILIAN_BASE_URL", "BAILIAN_WORKSPACE_ID"],
]) {
	test(`真实百炼通过 ${field} 配置，API Key 的特殊字符原样保留`, async (t) => {
		const apiKey = "test-key#with 'quotes' and spaces";
		const config = fixture(t, ["2", apiKey, address, value]);
		assert.equal(await initializeEnv(config.root, config), true);
		const env = parseEnv(readFileSync(join(config.root, ".env"), "utf8"));
		assert.equal(env.KIT_GATEWAY, "sdk");
		assert.equal(env.KIT_AUTH_MODE, "member");
		assert.equal(env.KIT_DATA_DIR, ".data");
		assert.equal(env.BAILIAN_API_KEY, apiKey);
		assert.equal(env[field], value);
		assert.equal(env[unusedField], "");
		assert.match(env.ADMIN_TOKEN, /^[a-f0-9]{64}$/);
		assert.equal(config.questions[1].secret, true);
		assert.ok(config.questions.every(({ question }) => !question.includes(apiKey)));
		assert.equal(config.closed, true);
	});
}

test("已有 .env 连同注释、空值、换行与文件权限原样复用，不进入引导", async (t) => {
	const config = fixture(t);
	const path = join(config.root, ".env");
	const original = "# 自定义配置\r\nADMIN_TOKEN=existing-token\r\nBAILIAN_API_KEY=\r\nEXTRA=keep";
	writeFileSync(path, original, { mode: 0o640 });
	const before = statSync(path);
	assert.equal(
		await initializeEnv(config.root, {
			createPrompt: () => assert.fail("已有配置不应打开终端或生成令牌"),
		}),
		false,
	);
	assert.equal(readFileSync(path, "utf8"), original);
	assert.equal(statSync(path).mode, before.mode);
	assert.equal(statSync(path).mtimeMs, before.mtimeMs);
});

test("拒绝空凭据、换行注入与无效地址后，完成引导才创建配置", async (t) => {
	const config = fixture(t, [
		"invalid",
		"2",
		"",
		"test-key\nKIT_AUTH_MODE=anonymous",
		"test-key",
		"2",
		"not-a-url",
		"https://user:password@example.com/?secret=value",
		(root) => {
			assert.equal(existsSync(join(root, ".env")), false);
			return "https://example.com/agents";
		},
	]);
	assert.equal(await initializeEnv(config.root, config), true);
	const env = parseEnv(readFileSync(join(config.root, ".env"), "utf8"));
	assert.equal(env.KIT_AUTH_MODE, "member");
	assert.equal(env.BAILIAN_API_KEY, "test-key");
	assert.equal(env.BAILIAN_BASE_URL, "https://example.com/agents");
	assert.equal(config.closed, true);
});

test("引导取消后不留下半份 .env，并关闭输入", async (t) => {
	const config = fixture(t, ["2", "test-key", new Error("cancelled")]);
	await assert.rejects(initializeEnv(config.root, config), /cancelled/);
	assert.equal(existsSync(join(config.root, ".env")), false);
	assert.equal(config.closed, true);
});

test("引导期间其他进程创建 .env 时，保留新出现的配置", async (t) => {
	const original = "ADMIN_TOKEN=another-process-token\nKIT_GATEWAY=mock\n";
	const config = fixture(t, [
		(root) => {
			writeFileSync(join(root, ".env"), original);
			return "1";
		},
	]);
	assert.equal(await initializeEnv(config.root, config), false);
	assert.equal(readFileSync(join(config.root, ".env"), "utf8"), original);
	assert.equal(config.closed, true);
});
