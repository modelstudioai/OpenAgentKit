#!/usr/bin/env node
/**
 * 并行起本地开发进程，带前缀输出与统一退出。
 *
 * 用法：
 *   pnpm dev                        # server + web + web-vue + console（默认）
 *   pnpm dev server web console     # 只起指定目标
 *   pnpm dev server web-vue         # 只启动 Vue 版体验页及其依赖
 *   pnpm dev storybook              # 文档站按需单独启动
 *
 * 目标：server(:8787) web(:5173) web-vue(:5175) console(:5174)；storybook(:3000) 需显式指定
 * 开发配置来自 .env.development。KIT_ENV 不是 development 时退出。合并结果只传给子进程。
 */
import { spawn, spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnv, requestedKitEnv } from "./load-env.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
if (Number(process.versions.node.split(".")[0]) < 24) {
	console.error(`[dev] 需要 Node.js >=24，当前为 ${process.version}。请切换到 Node.js 24 后重试。`);
	process.exit(1);
}

const requestedMode = requestedKitEnv();
if (requestedMode && requestedMode !== "development") {
	console.error(`[dev] 只读取 .env.development。当前 KIT_ENV=${requestedMode}。生产配置请使用 pnpm start。`);
	process.exit(1);
}

const { env } = loadLocalEnv({ root, defaultMode: "development", env: process.env });

const ALL_TARGETS = {
	server: { args: ["--filter", "@openagentpack/kit-server", "dev"] },
	web: { args: ["--filter", "web", "dev"] },
	"web-vue": { args: ["--filter", "web-vue", "dev"] },
	console: { args: ["--filter", "console", "dev"] },
	storybook: { args: ["--filter", "storybook", "dev"] },
};

const requested = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const unknown = requested.filter((name) => !ALL_TARGETS[name]);
if (unknown.length) {
	console.error(`未知目标：${unknown.join(", ")}（可选：${Object.keys(ALL_TARGETS).join(" ")}）`);
	process.exit(1);
}
const names = requested.length ? requested : ["server", "web", "web-vue", "console"];

// workspace 包的公开入口指向 dist；必须先按依赖图构建，再启动消费它们的进程。
// Turbo 缓存会恢复缺失产物，也会在源码变化时重建，不能只检查 dist 是否存在。
const buildTargets = new Set(names.map((name) => ALL_TARGETS[name].args[1]));
console.log("[dev] 先构建所选目标的工作区依赖…");
const dependencies = spawnSync(
	"pnpm",
	["exec", "turbo", "run", "build", ...[...buildTargets].map((name) => `--filter=${name}^...`)],
	{ cwd: root, env, stdio: "inherit" },
);
if (dependencies.error) console.error(`[dev] 无法启动依赖构建：${dependencies.error.message}`);
if (dependencies.status !== 0) process.exit(dependencies.status ?? 1);

const detached = process.platform !== "win32";
let stopping = false;

const children = names.map((name) => {
	const target = ALL_TARGETS[name];
	const child = spawn("pnpm", target.args, {
		cwd: root,
		env,
		detached,
		stdio: ["ignore", "pipe", "pipe"],
	});
	const prefix = `[${name}]`;
	const pipe = (stream) => {
		stream.setEncoding("utf8");
		stream.on("data", (chunk) => {
			for (const line of chunk.split("\n")) if (line.trim()) console.log(`${prefix} ${line}`);
		});
	};
	pipe(child.stdout);
	pipe(child.stderr);
	child.on("exit", (code) => {
		console.log(`${prefix} exited(${code})`);
		stop(code ?? 0);
	});
	child.on("error", (error) => {
		console.error(`${prefix} ${error.message}`);
		stop(1);
	});
	return { child, group: detached };
});

console.log(`[dev] 已启动：${names.join(" ")}`);

function terminate({ child, group }, signal) {
	if (!group || !child.pid) {
		child.kill(signal);
		return;
	}
	// pnpm 与 shell 位于同一专用进程组，让停止信号到达 Kit 和 JVM。
	try {
		process.kill(-child.pid, signal);
	} catch (error) {
		if (error.code === "ESRCH") return;
		if (error.code !== "EPERM") throw error;
		child.kill(signal);
	}
}

function stop(code) {
	if (stopping) return;
	stopping = true;
	for (const service of children) terminate(service, "SIGTERM");
	if (!detached) process.exit(code);
	process.exitCode = code;
	setTimeout(() => {
		for (const service of children) terminate(service, "SIGKILL");
		process.exit(code);
	}, 12_000).unref();
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
