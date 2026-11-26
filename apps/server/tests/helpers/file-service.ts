import type { DatabaseSync } from "node:sqlite";
import type { ProviderGateway } from "../../src/gateway/types.ts";
import { AuditService } from "../../src/service/shared/audit.ts";
import { FileService } from "../../src/service/shared/session/files.ts";
import { SessionHistoryService } from "../../src/service/shared/session/session-history.ts";
import { SessionIndexService } from "../../src/service/shared/session/session-index.ts";
import { createSqliteDatabase } from "../../src/store/sqlite.ts";
import { createMetrics } from "../../src/utils/metrics.ts";

export function createFileService(db: DatabaseSync, gateway: ProviderGateway) {
	const store = createSqliteDatabase(db);
	return new FileService(
		gateway,
		new SessionHistoryService(gateway),
		new SessionIndexService(store),
		store,
		new AuditService(store),
		createMetrics(),
	);
}
