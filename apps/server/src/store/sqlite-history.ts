import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { run as rebuildUsageDays } from "./schema/history/022_usage_limit_days_rebuild.ts";
import { run as bindCatalogAgentVersion } from "./schema/history/023_catalog_agent_version_binding.ts";
import { run as restoreDraftCleanupOwnership } from "./schema/history/026_resource_draft_cleanup_ownership.ts";
import { run as addDailyUsageLimits } from "./schema/history/027_usage_limit_daily.ts";
import { run as addResourceDraftAssets } from "./schema/history/030_resource_draft_assets.ts";
import { run as retireDirectoryDrafts } from "./schema/history/031_retire_directory_drafts.ts";
import manifest from "./schema/manifest.json" with { type: "json" };

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
			const sql = readFileSync(new URL(`./schema/history/${id}.sql`, import.meta.url), "utf8");
			return { id, sql };
		}
		const run = runs[id];
		if (source === "run" && run) return { id, run };
		throw new Error(`缺少 SQLite 历史迁移实现：${id}`);
	});
