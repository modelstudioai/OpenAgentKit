import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import manifest from "./migration-manifest.json" with { type: "json" };
import { run as rebuildUsageDays } from "./migrations/history/022_usage_limit_days_rebuild.ts";
import { run as bindCatalogAgentVersion } from "./migrations/history/023_catalog_agent_version_binding.ts";
import { run as restoreDraftCleanupOwnership } from "./migrations/history/026_resource_draft_cleanup_ownership.ts";
import { run as addDailyUsageLimits } from "./migrations/history/027_usage_limit_daily.ts";
import { run as addResourceDraftAssets } from "./migrations/history/030_resource_draft_assets.ts";
import { run as retireDirectoryDrafts } from "./migrations/history/031_retire_directory_drafts.ts";

const runs: Partial<Record<string, (db: DatabaseSync) => void>> = {
	"022_usage_limit_days_rebuild": rebuildUsageDays,
	"023_catalog_agent_version_binding": bindCatalogAgentVersion,
	"026_resource_draft_cleanup_ownership": restoreDraftCleanupOwnership,
	"027_usage_limit_daily": addDailyUsageLimits,
	"030_resource_draft_assets": addResourceDraftAssets,
	"031_retire_directory_drafts": retireDirectoryDrafts,
};

export const sqliteHistory = manifest
	.filter(({ source }) => source !== "version")
	.map(({ id, source }) => {
		if (!/^\d{3}_[a-z0-9_]+$/.test(id)) throw new Error("无效的 SQLite 历史迁移 ID");
		if (source === "sql") {
			return {
				id,
				get sql() {
					return readFileSync(new URL(`./migrations/history/${id}.sql`, import.meta.url), "utf8");
				},
			};
		}
		const run = runs[id];
		if (source === "run" && run) return { id, run };
		throw new Error(`缺少 SQLite 历史迁移实现：${id}`);
	});
