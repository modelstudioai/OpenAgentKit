import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { resolveWebDevPort } from "../../../scripts/dev-web-port.ts";
import { loadLocalEnv, requestedKitEnv } from "../../../scripts/load-env.mjs";
import { createKeycloakAdmin, provisionKeycloak, readKeycloakAdmin } from "./keycloak-dev.mjs";
import { prepareKeycloakHome, prepareKeycloakJava } from "./keycloak-runtime.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const serverDir = fileURLToPath(new URL("../", import.meta.url));
// 仓库根启动器已经合并过环境时不再解析，避免把绝对数据目录再拼一次。
const requestedMode = requestedKitEnv();
if (process.env.KIT_ENV_LOADED !== "1" && requestedMode && requestedMode !== "development") {
	console.error(`[dev] 只读取 .env.development。当前 KIT_ENV=${requestedMode}。生产配置请使用 pnpm start。`);
	process.exit(1);
}
const env =
	process.env.KIT_ENV_LOADED === "1"
		? process.env
		: loadLocalEnv({ root, defaultMode: "development", env: process.env }).env;
const shutdown = new AbortController();
const { signal } = shutdown;
const children = [];
let stopTimer;

function parseLocalIssuer(issuer) {
	const url = URL.parse(issuer);
	const realm = url?.pathname.match(/^(.*)\/realms\/([A-Za-z0-9._-]+)$/);
	const loopback = ["127.0.0.1", "localhost", "[::1]"];
	if (
		!url ||
		!realm ||
		url.protocol !== "http:" ||
		!loopback.includes(url.hostname) ||
		issuer !== url.origin + url.pathname
	) {
		throw new Error("本地 Keycloak 联动启动需要回环地址的 HTTP Realm issuer");
	}
	return { url, prefix: realm[1], realm: realm[2] };
}

function shouldManageKeycloak(home, configuredIssuer, mode) {
	if (!home && (configuredIssuer || (mode && mode !== "oidc"))) return false;
	if (["darwin", "linux"].includes(process.platform)) return true;
	if (home || mode) throw new Error("本地 Keycloak 联动启动支持 macOS 和 Linux。当前平台请设置已部署的 OIDC issuer");
	return false;
}

function managedKeycloak() {
	if (env.KIT_KEYCLOAK_ENABLED?.trim() === "false") return undefined;
	const home = env.KIT_KEYCLOAK_HOME?.trim();
	const configuredIssuer = env.KIT_OIDC_ISSUER?.trim();
	const mode = env.KIT_AUTH_MODE?.trim();
	if (!shouldManageKeycloak(home, configuredIssuer, mode)) return undefined;
	const issuer = configuredIssuer || "http://127.0.0.1:8180/realms/kit";
	const { url, prefix, realm } = parseLocalIssuer(issuer);
	const clientId = env.KIT_OIDC_CLIENT_ID?.trim() || "kit-web";
	const audience = env.KIT_OIDC_AUDIENCE?.trim() || "kit-api";
	if (clientId === audience) throw new Error("KIT_OIDC_AUDIENCE 必须与 KIT_OIDC_CLIENT_ID 不同");
	const base = url.origin + prefix;
	const adminFile = env.KIT_KEYCLOAK_ADMIN_FILE?.trim();
	return {
		base,
		issuer,
		realm,
		clientId,
		audience,
		webPort: resolveWebDevPort(env.KIT_WEB_DEV_PORT),
		adminFile: resolve(root, adminFile || ".scratch/keycloak-bootstrap-admin.json"),
		usesExistingAdmin: Boolean(adminFile),
		home: home ? resolve(root, home) : undefined,
		cache: resolve(root, ".scratch/keycloak"),
		serverEnv: {
			KIT_AUTH_MODE: mode || "oidc",
			KIT_OIDC_ISSUER: issuer,
			KIT_OIDC_CLIENT_ID: clientId,
			KIT_OIDC_AUDIENCE: audience,
		},
		args: [
			"start-dev",
			`--http-host=${url.hostname === "[::1]" ? "::1" : "127.0.0.1"}`,
			`--http-port=${url.port || "80"}`,
			`--hostname=${base}`,
			`--http-relative-path=${prefix || "/"}`,
		],
	};
}

function selectEnv(keys) {
	return Object.fromEntries(keys.filter((key) => env[key] !== undefined).map((key) => [key, env[key]]));
}

function launch(name, file, args, options) {
	const child = spawn(file, args, { stdio: "inherit", ...options });
	const closed = new Promise((done) => {
		child.once("error", (error) => console.error(`[${name}] 启动失败：${error.message}`));
		child.once("close", (code) => done({ name, code: code ?? 1 }));
	});
	const service = { child, closed };
	children.push(service);
	return service;
}

function terminate(child, reason) {
	if (child.pid && child.exitCode === null && child.signalCode === null) child.kill(reason);
}

function stop() {
	if (signal.aborted) return;
	shutdown.abort();
	for (const { child } of children) terminate(child, "SIGTERM");
	stopTimer = setTimeout(() => {
		for (const { child } of children) terminate(child, "SIGKILL");
	}, 10_000).unref();
}

async function issuerReady(issuer) {
	try {
		const response = await fetch(`${issuer}/.well-known/openid-configuration`, {
			signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]),
			redirect: "error",
		});
		return response.ok && (await response.json()).issuer === issuer;
	} catch {
		signal.throwIfAborted();
		return false;
	}
}

async function waitForIssuer(issuer) {
	const deadline = performance.now() + 60_000;
	while (performance.now() < deadline) {
		if (await issuerReady(issuer)) return;
		await wait(400, undefined, { signal });
	}
	throw new Error("本地 Keycloak Realm 在 60 秒内未就绪，请检查 Keycloak 日志与 Realm 配置");
}

async function startKeycloak(config) {
	const masterIssuer = `${config.base}/realms/master`;
	const running = await issuerReady(masterIssuer);
	let admin = readKeycloakAdmin(config.adminFile);
	if (!admin && config.usesExistingAdmin) throw new Error("KIT_KEYCLOAK_ADMIN_FILE 指定的管理员文件不存在");
	if (running) {
		if (admin) await ensureRealm(config, admin);
		else if (!config.home || !(await issuerReady(config.issuer)))
			throw new Error("请用 KIT_KEYCLOAK_ADMIN_FILE 指定已运行实例的管理员");
		else process.stdout.write(`[keycloak] 复用已运行的 Realm ${config.issuer}\n`);
		return;
	}
	const baseEnv = selectEnv(["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR"]);
	const proxyEnv = selectEnv([
		"http_proxy",
		"https_proxy",
		"all_proxy",
		"no_proxy",
		"HTTPS_PROXY",
		"ALL_PROXY",
		"NO_PROXY",
		"SSL_CERT_FILE",
		"SSL_CERT_DIR",
		"CURL_CA_BUNDLE",
	]);
	const options = { env: { ...baseEnv, ...proxyEnv }, signal };
	const home = await prepareKeycloakHome(config.home, config.cache, options);
	const java = env.KIT_KEYCLOAK_JAVA_HOME?.trim();
	const javaHome = env.JAVA_HOME?.trim();
	const runtime = await prepareKeycloakJava(
		java ? resolve(root, java) : undefined,
		javaHome ? resolve(root, javaHome) : undefined,
		config.cache,
		options,
	);
	signal.throwIfAborted();
	if (!admin) {
		admin = createKeycloakAdmin(config.adminFile);
		process.stdout.write(`[keycloak] 本地管理员凭据已保存到 ${config.adminFile}\n`);
	}
	const keycloak = launch("keycloak", resolve(home, "bin/kc.sh"), config.args, {
		cwd: home,
		env: {
			...baseEnv,
			...(runtime ? { JAVA_HOME: runtime } : {}),
			KC_BOOTSTRAP_ADMIN_USERNAME: admin.username,
			KC_BOOTSTRAP_ADMIN_PASSWORD: admin.password,
		},
	});
	await Promise.race([
		(async () => {
			await waitForIssuer(masterIssuer);
			await ensureRealm(config, admin);
		})(),
		keycloak.closed.then(({ code }) => {
			throw new Error(`本地 Keycloak 在 Realm 就绪前退出（退出码 ${code}）`);
		}),
	]);
}

async function ensureRealm(config, admin) {
	const { createdRealm, createdClient } = await provisionKeycloak(config, admin, signal);
	await waitForIssuer(config.issuer);
	const realm = createdRealm ? "创建" : "复用";
	const client = createdClient ? "创建" : "复用";
	process.stdout.write(`[keycloak] ${realm} Realm ${config.realm}，${client}客户端 ${config.clientId}\n`);
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
try {
	const local = managedKeycloak();
	if (local) await startKeycloak(local);
	signal.throwIfAborted();
	const tsx = fileURLToPath(import.meta.resolve("tsx/cli"));
	launch("server", process.execPath, [tsx, "watch", "src/bin.ts"], {
		cwd: serverDir,
		env: { ...env, ...local?.serverEnv },
	});
	const exit = await Promise.race(children.map(({ closed }) => closed));
	if (!signal.aborted && exit.name === "keycloak") throw new Error("联动启动的 Keycloak 已退出");
	if (!signal.aborted) process.exitCode = exit.code;
} catch (error) {
	if (!signal.aborted) {
		console.error(`[dev] ${error instanceof Error ? error.message : String(error)}`);
		process.exitCode = 1;
	}
} finally {
	stop();
	await Promise.all(children.map(({ closed }) => closed));
	clearTimeout(stopTimer);
}
