import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { openKitServices } from "./services/index.ts";

type EnvLoader = {
	loadLocalEnv(options: { root: string; defaultMode: "development" | "production"; env: NodeJS.ProcessEnv }): {
		env: NodeJS.ProcessEnv;
	};
};

function isMissingLoader(error: unknown) {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "ERR_MODULE_NOT_FOUND" &&
		"message" in error &&
		typeof error.message === "string" &&
		error.message.includes("load-env.mjs")
	);
}

/** 仓库内启动时读取 .env.production。发行包没有 scripts/ 时沿用平台注入的环境。 */
async function loadMonorepoEnv() {
	if (process.env.KIT_ENV_LOADED === "1") return;
	const loaderUrl = new URL("../../../scripts/load-env.mjs", import.meta.url);
	try {
		const loader = (await import(loaderUrl.href)) as EnvLoader;
		const root = fileURLToPath(new URL("../../..", import.meta.url));
		const loaded = loader.loadLocalEnv({ root, defaultMode: "production", env: process.env });
		Object.assign(process.env, loaded.env);
	} catch (error) {
		if (!isMissingLoader(error)) throw error;
	}
}

await loadMonorepoEnv();
const config = loadConfig();
const services = await openKitServices(config);
const app = createApp(services);

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
	console.warn(
		`[kit-server] http://localhost:${info.port} gateway=${config.resolvedGateway} db=${config.database.driver} data=${config.dataDir}`,
	);
});
server.once("close", () => {
	void services.close().catch(() => console.error("[kit-server] 关闭数据库连接失败"));
});
