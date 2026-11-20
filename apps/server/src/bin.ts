import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { openKitServices } from "./services/index.ts";

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
