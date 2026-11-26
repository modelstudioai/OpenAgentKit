import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";

const config = loadConfig();
const app = await createApp(config);
app.enableShutdownHooks(["SIGINT", "SIGTERM"]);
try {
	await app.listen(config.port);
	const { port } = app.getHttpServer().address();
	console.warn(
		`[kit-server] http://localhost:${port} gateway=${config.resolvedGateway} db=${config.database.driver} data=${config.dataDir}`,
	);
} catch (error) {
	await app.close();
	throw error;
}
