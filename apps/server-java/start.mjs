import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { loadJavaToolchain } from "./toolchain.mjs";

const packagedJar = fileURLToPath(new URL("./kit-server.jar", import.meta.url));
const packaged = existsSync(packagedJar);
const jar = packaged ? packagedJar : fileURLToPath(new URL("./target/kit-server-1.0.0-SNAPSHOT.jar", import.meta.url));
const gateway = fileURLToPath(new URL("../server/dist/sdk-gateway.js", import.meta.url));
const configRoot = fileURLToPath(new URL(packaged ? "../" : "../../", import.meta.url));
const envFile = join(configRoot, ".env");
const runtimeEnv = { ...process.env };
if (!process.argv.includes("--isolated") && existsSync(envFile)) {
	const local = parseEnv(readFileSync(envFile, "utf8"));
	const addressKeys = ["BAILIAN_BASE_URL", "BAILIAN_WORKSPACE_ID"];
	const hasAddress = addressKeys.some((key) => local[key]?.trim());
	for (const [key, value] of Object.entries(local)) {
		if (value || (hasAddress && addressKeys.includes(key))) runtimeEnv[key] = value;
	}
}

function port(env, name, fallback) {
	const value = Number(env[name] || fallback);
	if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error(`${name} 配置无效`);
	return value;
}

function token(env, name) {
	const value = env[name] || randomBytes(32).toString("base64url");
	if (!/^[A-Za-z0-9_-]{32,256}$/.test(value)) throw new Error(`${name} 必须是专用服务令牌`);
	return value;
}

function start(executable, args, options, children, signalHandler) {
	const child = spawn(executable, args, { ...options, stdio: ["ignore", "inherit", "inherit"] });
	children.add(child);
	child.on("error", () => {
		console.error("[kit-java] 无法启动后端进程");
		signalHandler("SIGTERM", 1);
	});
	child.on("exit", (code, signal) => {
		children.delete(child);
		signalHandler("SIGTERM", code || (signal ? 1 : 0));
	});
	return child;
}

function javaCommand(env) {
	if (!existsSync(jar) || !existsSync(gateway)) throw new Error("缺少 Java 或 Node 产物，请先执行 pnpm build:java");
	const java = env.JAVA_HOME ? join(env.JAVA_HOME, "bin", process.platform === "win32" ? "java.exe" : "java") : "java";
	const version = spawnSync(java, ["-version"], { encoding: "utf8" });
	if (version.status !== 0 || !/version "11(?:[."-])/.test(version.stderr)) throw new Error("Kit 必须以 JDK 11 启动");
	return java;
}

function settings(env) {
	const sdkPort = port(env, "KIT_SDK_PORT", 8791);
	const callbackPort = port(env, "KIT_SDK_CALLBACK_PORT", 8792);
	const publicPort = port(env, "PORT", 8787);
	if (new Set([publicPort, sdkPort, callbackPort]).size !== 3) throw new Error("Kit 公开、网关和回写端口必须各自独立");
	const sdkUrl = `http://127.0.0.1:${sdkPort}`;
	const secrets = {
		KIT_SDK_GATEWAY_TOKEN: token(env, "KIT_SDK_GATEWAY_TOKEN"),
		KIT_SDK_CALLBACK_TOKEN: token(env, "KIT_SDK_CALLBACK_TOKEN"),
		KIT_SDK_CALLBACK_PORT: String(callbackPort),
	};
	const dataDir = resolve(configRoot, env.KIT_DATA_DIR?.trim() || ".data");
	const nodeEnv = {};
	for (const key of [
		"PATH",
		"HOME",
		"TMPDIR",
		"TEMP",
		"TMP",
		"SystemRoot",
		"LANG",
		"KIT_GATEWAY",
		"BAILIAN_API_KEY",
		"BAILIAN_BASE_URL",
		"BAILIAN_WORKSPACE_ID",
		"KIT_UPLOAD_MAX_BYTES",
		"KIT_BODY_LIMIT_BYTES",
		"KIT_MOCK_FILE_SCAN_DELAY_MS",
	]) {
		if (env[key] !== undefined) nodeEnv[key] = env[key];
	}
	const javaEnv = { ...env, ...secrets, PORT: String(publicPort), KIT_SDK_URL: sdkUrl, KIT_DATA_DIR: dataDir };
	for (const key of Object.keys(javaEnv)) {
		if (key.startsWith("BAILIAN_") && key !== "BAILIAN_WORKSPACE_ID") delete javaEnv[key];
	}
	const sdkEnv = {
		...nodeEnv,
		...secrets,
		KIT_SDK_PORT: String(sdkPort),
		KIT_SDK_TEMP_DIR: join(dataDir, "sdk-gateway-temp"),
		KIT_SDK_ASSET_DIR: join(dataDir, "resource-draft-uploads"),
	};
	return { javaEnv, sdkEnv, sdkUrl };
}

async function sdkReady(url, token, stopping) {
	const deadline = Date.now() + 15_000;
	while (!stopping() && Date.now() < deadline) {
		const response = await fetch(`${url}/internal/sdk/v1/health`, {
			headers: { authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(1000),
		}).catch(() => null);
		if (response?.ok) return true;
		await delay(100);
	}
	return false;
}

async function launch() {
	const { env, node } = loadJavaToolchain(configRoot, runtimeEnv);
	const java = javaCommand(env);
	const { javaEnv, sdkEnv, sdkUrl } = settings(env);
	const children = new Set();
	let stopping = false;
	function shutdown(signal, code = 0) {
		if (stopping) return;
		stopping = true;
		process.exitCode = code;
		for (const child of children) child.kill(signal);
		const force = setTimeout(() => {
			for (const child of children) child.kill("SIGKILL");
		}, 5000);
		force.unref();
	}
	for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => shutdown("SIGTERM"));

	start(node, [gateway], { env: sdkEnv, cwd: configRoot }, children, shutdown);
	const ready = await sdkReady(sdkUrl, sdkEnv.KIT_SDK_GATEWAY_TOKEN, () => stopping);
	if (stopping) return;
	if (!ready) {
		shutdown("SIGTERM", 1);
		throw new Error("Node SDK 网关未就绪");
	}
	start(java, ["-jar", jar], { env: javaEnv, cwd: configRoot }, children, shutdown);
}

await launch().catch((error) => {
	console.error(`[kit-java] ${error.message}`);
	process.exitCode = 1;
});
