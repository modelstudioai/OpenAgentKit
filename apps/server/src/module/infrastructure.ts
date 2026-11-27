import type { ServerConfig } from "../config.ts";
import { StartupService } from "../service/shared/startup.ts";
import { openDatabaseConnection } from "../store/connect.ts";
import type { StoreDatabase } from "../store/database.ts";
import { createEventBufferRegistry } from "../utils/event-buffer.ts";
import { createMetrics } from "../utils/metrics.ts";
import { createRateLimiter } from "../utils/rate-limit.ts";

export async function connectDatabase(config: Pick<ServerConfig, "database" | "dataDir" | "quotaDefaultMonthly">) {
	const database = await openDatabaseConnection(config);
	try {
		await new StartupService(database).initialize(config.quotaDefaultMonthly);
		return database;
	} catch (error) {
		await database.close().catch(() => undefined);
		throw error;
	}
}

export function createInfrastructure(config: ServerConfig, database: StoreDatabase) {
	let closing: Promise<void> | undefined;
	return {
		config,
		database,
		buffers: createEventBufferRegistry(),
		limiter: createRateLimiter({ rps: config.rateLimitRps, burst: config.rateLimitBurst }),
		metrics: createMetrics(),
		close: () => (closing ??= Promise.resolve().then(() => database.close())),
	};
}

export type Infrastructure = ReturnType<typeof createInfrastructure>;
