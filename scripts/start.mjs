#!/usr/bin/env node
/** KIT_ENV=production 构建并启动服务端；development 时引导开发配置并接续 dev。未设置则退出。 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { encodeEnvValue as encodeEnv, loadLocalEnv, requestedKitEnv, resolveMode } from "./load-env.mjs";

function createTerminalPrompt() {
	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		throw new Error("首次配置需要交互式终端，请在终端运行 pnpm start:dev；或先手动创建 .env.development 后重试。");
	}
	let muted = false;
	const output = new Writable({
		write(chunk, encoding, callback) {
			if (!muted) process.stdout.write(chunk, encoding);
			callback();
		},
	});
	const terminal = createInterface({ input: process.stdin, output, terminal: true, historySize: 0 });
	const controller = new AbortController();
	terminal.on("SIGINT", () => controller.abort());
	terminal.on("close", () => controller.abort());
	return {
		async ask(question, { secret = false } = {}) {
			try {
				if (controller.signal.aborted) throw new Error("cancelled");
				if (secret) {
					process.stdout.write(question);
					muted = true;
				}
				return await terminal.question(secret ? "" : question, { signal: controller.signal });
			} catch {
				throw new Error("配置已取消，未生成 .env.development。");
			} finally {
				muted = false;
				if (secret) process.stdout.write("\n");
			}
		},
		close() {
			terminal.close();
			output.end();
		},
	};
}

async function choose(ask, question, choices) {
	while (true) {
		const answer = (await ask(question)).trim().toLowerCase();
		if (!answer) return choices[0];
		const choice = choices[Number(answer) - 1] ?? choices.find((value) => value === answer);
		if (choice) return choice;
		question = `请输入 1 或 2。\n${question}`;
	}
}

async function required(ask, question, { secret = false, validate = () => true } = {}) {
	while (true) {
		const value = (await ask(question, { secret })).trim();
		if (value && !/[\r\n\0]/.test(value) && encodeEnv(value) && validate(value)) return value;
		question = `输入无效，请重新填写。\n${question}`;
	}
}

function isBaseUrl(value) {
	try {
		const url = new URL(value);
		return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
	} catch {
		return false;
	}
}

/** 返回是否新建；测试使用隔离目录和输入，不读取开发者凭据。 */
export async function initializeEnv(root, { createPrompt = createTerminalPrompt } = {}) {
	const envFile = join(root, ".env.development");
	// 旧 .env 留给启动加载时复制，引导本身不改写、不合并。
	if (existsSync(envFile) || existsSync(join(root, ".env"))) return false;
	const template = readFileSync(join(root, ".env.example"), "utf8");
	const prompt = createPrompt();
	const ask = prompt.ask.bind(prompt);
	try {
		const mode = await choose(ask, "运行模式：\n  1. Mock（无需百炼凭据）\n  2. 真实百炼\n请选择 [1]：", [
			"mock",
			"sdk",
		]);
		const values = {
			KIT_GATEWAY: mode,
			KIT_DATA_DIR: mode === "mock" ? ".scratch/local-demo/data" : ".data",
			ADMIN_TOKEN: randomBytes(32).toString("hex"),
		};
		if (mode === "sdk") {
			values.BAILIAN_API_KEY = await required(ask, "百炼 API Key（输入不回显）：", { secret: true });
			const address = await choose(ask, "百炼地址：\n  1. Workspace ID\n  2. Base URL\n请选择 [1]：", [
				"workspace",
				"url",
			]);
			if (address === "workspace") {
				values.BAILIAN_WORKSPACE_ID = await required(ask, "Workspace ID：", {
					validate: (value) => /^[\w-]+$/.test(value),
				});
			} else {
				values.BAILIAN_BASE_URL = await required(ask, "Base URL（http/https，不含账号、查询参数或片段）：", {
					validate: isBaseUrl,
				});
			}
		}
		const content = template.replace(/^([A-Z0-9_]+)=.*$/gm, (line, key) =>
			Object.hasOwn(values, key) ? `${key}=${encodeEnv(values[key])}` : line,
		);
		try {
			// wx 防止引导期间另一个进程新建的配置被覆盖；仅当前用户可读写新文件。
			writeFileSync(envFile, content, { flag: "wx", mode: 0o600 });
			return true;
		} catch (error) {
			if (error.code === "EEXIST") return false;
			throw error;
		}
	} finally {
		prompt.close();
	}
}

function terminate(child, group, signal) {
	if (!child.pid) return;
	if (!group) {
		child.kill(signal);
		return;
	}
	try {
		process.kill(-child.pid, signal);
	} catch (error) {
		if (error.code === "ESRCH") return;
		if (error.code !== "EPERM") throw error;
		child.kill(signal);
	}
}

function waitForServer(child, group) {
	return new Promise((resolve) => {
		let stopping = false;
		const stop = () => {
			if (stopping) return;
			stopping = true;
			terminate(child, group, "SIGTERM");
			setTimeout(() => {
				terminate(child, group, "SIGKILL");
				resolve(0);
			}, 12_000).unref();
		};
		process.on("SIGINT", stop);
		process.on("SIGTERM", stop);
		child.on("exit", (code) => resolve(stopping ? 0 : (code ?? 1)));
		child.on("error", (error) => {
			console.error(`[start] 无法启动服务端：${error.message}`);
			resolve(1);
		});
	});
}

async function startProduction(root) {
	if (process.argv.length > 2) {
		throw new Error("生产启动不接受参数。开发进程请使用 pnpm start:dev。");
	}
	// 生产启动不复制旧 .env，避免用过期凭据写出 .env.production 或 .env.development。
	if (!existsSync(join(root, ".env.production"))) {
		throw new Error(
			"缺少 .env.production。请复制 .env.example 为 .env.production 后填写。已有旧 .env 时，先运行 pnpm start:dev 完成一次性复制并核对生产文件。",
		);
	}
	const { env, filename } = loadLocalEnv({
		root,
		defaultMode: "production",
		env: process.env,
		migrate: false,
	});
	if (!filename) {
		throw new Error("缺少 .env.production。请复制 .env.example 为 .env.production 后填写。");
	}
	console.log("[start] 使用 .env.production 启动已构建的服务端。");
	const build = spawnSync("pnpm", ["exec", "turbo", "run", "build", "--filter=@openagentpack/kit-server"], {
		cwd: root,
		env,
		stdio: "inherit",
	});
	if (build.error) console.error(`[start] 无法启动服务端构建：${build.error.message}`);
	if (build.status !== 0) process.exit(build.status ?? 1);
	const detached = process.platform !== "win32";
	const child = spawn("pnpm", ["--filter", "@openagentpack/kit-server", "start"], {
		cwd: root,
		env,
		detached,
		stdio: "inherit",
	});
	process.exitCode = await waitForServer(child, detached);
}

async function main() {
	if (Number(process.versions.node.split(".")[0]) < 24) {
		throw new Error(`需要 Node.js >=24，当前为 ${process.version}。请切换到 Node.js 24 后重试。`);
	}
	const root = dirname(dirname(fileURLToPath(import.meta.url)));
	const requested = requestedKitEnv();
	if (!requested) throw new Error("请使用 pnpm start 或 pnpm start:dev。");
	const mode = resolveMode("development");
	if (mode === "production") {
		await startProduction(root);
		return;
	}
	const created = await initializeEnv(root);
	console.log(
		created ? "[start] 已生成 .env.development 和随机管理员令牌。" : "[start] 复用已有环境配置，未修改配置。",
	);
	console.log(
		"[start] 管理端登录请使用 .env.development 中的 ADMIN_TOKEN。员工 SSO 登录需要绑定 Keycloak 用户和 Kit 成员。",
	);
	// 同一进程接续现有依赖构建、日志与退出流程，不另起一套服务编排。
	if (!process.argv.slice(2).length) process.argv.push("server", "web", "console");
	await import("./dev.mjs");
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((error) => {
		console.error(`[start] ${error.message}`);
		process.exitCode = 1;
	});
}
