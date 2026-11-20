import { randomUUID } from "node:crypto";
import {
	KitError,
	PresetPackSummarySchema,
	type PresetPacksPage,
	type PresetPacksQuery,
	type PresetPackView,
	PresetPackViewSchema,
} from "@openagentkit/sdk/protocol";
import type { StoreDatabase } from "./database.ts";
import { jsonText, likePattern } from "./sql.ts";

export function createPresetPackStore(db: StoreDatabase) {
	const searchWhere = `LOWER(${jsonText(db, "config_json", "remote_agent_name")}) LIKE LOWER(?) ESCAPE '!'
		OR LOWER(${jsonText(db, "config_json", "remote_agent_id")}) LIKE LOWER(?) ESCAPE '!'
		OR LOWER(preset_pack_id) LIKE LOWER(?) ESCAPE '!'`;
	return {
		async list(query: PresetPacksQuery): Promise<PresetPacksPage> {
			const pattern = likePattern(query.search);
			const search = [pattern, pattern, pattern];
			const rows = (await db.all(
				`SELECT config_json FROM kit_preset_packs WHERE ${searchWhere}
                ORDER BY created_at DESC, preset_pack_id DESC LIMIT ? OFFSET ?`,
				...search,
				query.limit,
				query.offset,
			)) as unknown as { config_json: string }[];
			const total = (await db.get(
				`SELECT count(*) AS count FROM kit_preset_packs WHERE ${searchWhere}`,
				...search,
			)) as { count: number };
			return {
				data: rows.map((row) => {
					const preset = PresetPackViewSchema.parse(JSON.parse(row.config_json));
					return PresetPackSummarySchema.strip().parse({
						...preset,
						resource_count:
							Number(Boolean(preset.remote_environment_id)) +
							preset.files.length +
							preset.memory_stores.length +
							preset.vault_ids.length,
					});
				}),
				total: total.count,
			};
		},
		async create(config: Omit<PresetPackView, "preset_pack_id" | "created_at">): Promise<PresetPackView> {
			const preset = PresetPackViewSchema.parse({
				...config,
				preset_pack_id: `preset_${randomUUID()}`,
				created_at: new Date().toISOString(),
			});
			await db.run(
				"INSERT INTO kit_preset_packs (preset_pack_id, config_json, created_at) VALUES (?, ?, ?)",
				preset.preset_pack_id,
				JSON.stringify(preset),
				preset.created_at,
			);
			return preset;
		},
		async get(id: string): Promise<PresetPackView> {
			const row = (await db.get("SELECT config_json FROM kit_preset_packs WHERE preset_pack_id=?", id)) as
				| { config_json: string }
				| undefined;
			if (!row) throw new KitError("not_found", "预设包不存在");
			return PresetPackViewSchema.parse(JSON.parse(row.config_json));
		},
	};
}
export type PresetPackStore = ReturnType<typeof createPresetPackStore>;
