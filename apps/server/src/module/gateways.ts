import type { BailianCredentials, ServerConfig } from "../config.ts";
import { createSdkGateway as createSdkAdapter } from "../gateway/bailian/sdk.ts";
import { createMockGateway as createMockAdapter } from "../gateway/mock/mock.ts";
import type { ProviderGateway } from "../gateway/types.ts";
import { ResourceDraftAssets } from "../service/admin/resource-draft/uploads/resource-draft-assets.ts";
import type { SessionUsageSnapshotService } from "../service/shared/usage/session-usage-snapshot.ts";

const createAssets = (assetRoot: string) => new ResourceDraftAssets(assetRoot);

export function createSdkGateway(credentials: BailianCredentials) {
	return createSdkAdapter(credentials, createAssets);
}

export function createMockGateway(options?: Parameters<typeof createMockAdapter>[1]) {
	return createMockAdapter(createAssets, options);
}

export function createGateway(config: ServerConfig, snapshots: SessionUsageSnapshotService): ProviderGateway {
	if (config.resolvedGateway === "sdk" && config.bailian) return createSdkGateway(config.bailian);
	return createMockGateway({
		fileScanDelayMs: config.mockFileScanDelayMs,
		telemetry: {
			byAgent: () => snapshots.telemetryByAgent(),
			bySession: (id) => snapshots.telemetryBySession(id),
		},
	});
}
