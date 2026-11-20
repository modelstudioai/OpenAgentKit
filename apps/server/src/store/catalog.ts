import { type CatalogAgentView, KitError } from "@openagentkit/sdk/protocol";
import type { StoreDatabase } from "./database.ts";

export interface CatalogRow {
	id: string;
	slug: string;
	display_name: string;
	description: string | null;
	icon: string | null;
	opening_remarks: string | null;
	suggested_prompts: string;
	capabilities: string;
	theme: string | null;
	remote_agent_id: string;
	remote_agent_version: number | null;
	agent_version: number | null;
	remote_environment_id: string | null;
	files_json: string;
	memory_stores_json: string;
	vault_ids_json: string;
	visibility: string;
	ordering: number;
	category: string;
	featured: number;
	status: string;
	deleted_at: string | null;
	created_at: string;
	updated_at: string;
}

/**
 * 上架条目的可写入参：slug 是身份（创建后不改），status 只经 plan → 确认，
 * 其余展示字段全部可选（创建时给默认值，更新时只改传进来的）。
 */
export type CatalogEntryInput = {
	slug: string;
	display_name: string;
	remote_agent_id: string;
} & Partial<
	Omit<CatalogAgentView, "id" | "slug" | "status" | "created_at" | "updated_at" | "display_name" | "remote_agent_id">
>;

/** 去掉 undefined 键：避免 `{...current, ...patch}` 把已有值抹成 undefined。 */
function definedOnly<T extends object>(input: T): Partial<T> {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(input)) if (value !== undefined) out[key] = value;
	return out as Partial<T>;
}

/** 历史版本快照与显式运行绑定分别保存；数据库的 null 在读取时归一为未设置。 */
function agentVersionFields(input: { remote_agent_version?: number | null; agent_version?: number | null }) {
	return {
		...(input.remote_agent_version != null ? { remote_agent_version: input.remote_agent_version } : {}),
		...(input.agent_version != null ? { agent_version: input.agent_version } : {}),
	};
}

/** 新条目的默认值：未上架、public、排序 100、能力全开（体验页按 capabilities 决定显示什么）。 */
function newEntry(input: CatalogEntryInput): CatalogAgentView {
	const now = new Date().toISOString();
	return {
		id: `cat_${Math.random().toString(36).slice(2, 10)}`,
		slug: input.slug,
		display_name: input.display_name,
		remote_agent_id: input.remote_agent_id,
		remote_environment_id: input.remote_environment_id ?? null,
		files: input.files ?? [],
		memory_stores: input.memory_stores ?? [],
		vault_ids: input.vault_ids ?? [],
		...(input.description ? { description: input.description } : {}),
		...(input.icon ? { icon: input.icon } : {}),
		...(input.opening_remarks ? { opening_remarks: input.opening_remarks } : {}),
		suggested_prompts: input.suggested_prompts ?? [],
		capabilities: input.capabilities ?? {
			streaming: true,
			fileUpload: true,
			artifacts: true,
			threads: true,
			reasoning: true,
		},
		...(input.theme ? { theme: input.theme } : {}),
		...agentVersionFields(input),
		visibility: input.visibility ?? "public",
		ordering: input.ordering ?? 100,
		category: input.category ?? "general",
		featured: input.featured ?? false,
		status: "unlisted",
		created_at: now,
		updated_at: now,
	};
}

function toView(row: CatalogRow): CatalogAgentView {
	return {
		id: row.id,
		slug: row.slug,
		display_name: row.display_name,
		...(row.description ? { description: row.description } : {}),
		...(row.icon ? { icon: row.icon } : {}),
		...(row.opening_remarks ? { opening_remarks: row.opening_remarks } : {}),
		suggested_prompts: JSON.parse(row.suggested_prompts) as string[],
		capabilities: JSON.parse(row.capabilities) as CatalogAgentView["capabilities"],
		...(row.theme ? { theme: JSON.parse(row.theme) } : {}),
		remote_agent_id: row.remote_agent_id,
		remote_environment_id: row.remote_environment_id,
		files: JSON.parse(row.files_json) as CatalogAgentView["files"],
		memory_stores: JSON.parse(row.memory_stores_json) as CatalogAgentView["memory_stores"],
		vault_ids: JSON.parse(row.vault_ids_json) as CatalogAgentView["vault_ids"],
		...agentVersionFields(row),
		visibility: row.visibility as CatalogAgentView["visibility"],
		ordering: row.ordering,
		category: row.category as CatalogAgentView["category"],
		featured: row.featured === 1,
		status: row.status as CatalogAgentView["status"],
		...(row.deleted_at ? { deleted: true as const } : {}),
		created_at: row.created_at,
		updated_at: row.updated_at,
	};
}

/** 写入失败归因：slug 被活动行占用 vs 展示名冲突；已删行不占用 slug。 */
function conflictReason(owner: CatalogAgentView | null): string {
	return owner && !owner.deleted ? "ID 已存在，请使用其他 ID" : "展示名已存在，请使用其他展示名";
}

function writableFields(view: CatalogAgentView) {
	return {
		slug: view.slug,
		display_name: view.display_name,
		description: view.description ?? null,
		icon: view.icon ?? null,
		opening_remarks: view.opening_remarks ?? null,
		suggested_prompts: JSON.stringify(view.suggested_prompts ?? []),
		capabilities: JSON.stringify(view.capabilities),
		theme: view.theme ? JSON.stringify(view.theme) : null,
		remote_agent_id: view.remote_agent_id,
		remote_agent_version: view.remote_agent_version ?? null,
		agent_version: view.agent_version ?? null,
		remote_environment_id: view.remote_environment_id ?? null,
		files_json: JSON.stringify(view.files ?? []),
		memory_stores_json: JSON.stringify(view.memory_stores ?? []),
		vault_ids_json: JSON.stringify(view.vault_ids ?? []),
		visibility: view.visibility,
		ordering: view.ordering,
		category: view.category,
		featured: view.featured ? 1 : 0,
		status: view.status,
		updated_at: view.updated_at,
	};
}

export function createCatalogStore(db: StoreDatabase) {
	return {
		async list(): Promise<CatalogAgentView[]> {
			const rows = (await db.all(
				"SELECT * FROM catalog_agents WHERE deleted_at IS NULL ORDER BY ordering ASC, created_at ASC",
			)) as unknown as CatalogRow[];
			return rows.map(toView);
		},
		async listed(): Promise<CatalogAgentView[]> {
			const rows = (await db.all(
				"SELECT * FROM catalog_agents WHERE status = 'listed' AND deleted_at IS NULL ORDER BY ordering ASC, created_at ASC",
			)) as unknown as CatalogRow[];
			return rows.map(toView);
		},
		async get(id: string): Promise<CatalogAgentView | null> {
			const row = (await db.get("SELECT * FROM catalog_agents WHERE id = ?", id)) as unknown as CatalogRow | undefined;
			return row ? toView(row) : null;
		},
		async getBySlug(slug: string): Promise<CatalogAgentView | null> {
			// slug 可被已删行与活动行复用；优先返回活动行，保证编辑/删除/上架流程不会命中已删行。
			const row = (await db.get(
				"SELECT * FROM catalog_agents WHERE slug = ? ORDER BY (deleted_at IS NOT NULL), updated_at DESC LIMIT 1",
				slug,
			)) as unknown as CatalogRow | undefined;
			return row ? toView(row) : null;
		},
		async insert(view: CatalogAgentView) {
			const row = {
				id: view.id,
				...writableFields(view),
				created_at: view.created_at,
				listed_at: view.status === "listed" ? new Date().toISOString() : null,
			};
			const columns = Object.keys(row);
			await db.transaction(async () => {
				// 已删行不占用 slug：仅活动行触发前置拒绝，软删复用交给部分唯一索引放行。
				const slugOwner = await this.getBySlug(view.slug);
				if (slugOwner && !slugOwner.deleted) throw new KitError("conflict", "ID 已存在，请使用其他 ID");
				if (
					await db.get("SELECT 1 FROM catalog_agents WHERE display_name = ? AND deleted_at IS NULL", view.display_name)
				)
					throw new KitError("conflict", "展示名已存在，请使用其他展示名");
				// slug 唯一性来自排除已删行的部分唯一索引，冲突目标用全量兜底；未写入时按活动行归因。
				const inserted = await db.insertIfAbsent(
					`INSERT INTO catalog_agents (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
					"",
					...Object.values(row),
				);
				if (!inserted.changes) throw new KitError("conflict", conflictReason(await this.getBySlug(view.slug)));
			});
		},
		async update(id: string, patch: Partial<CatalogAgentView>) {
			return db.transaction(async () => {
				const current = await this.get(id);
				if (!current) return null;
				const next: CatalogAgentView = { ...current, ...patch, id, updated_at: new Date().toISOString() };
				if (
					current.display_name !== next.display_name &&
					(await db.get(
						"SELECT 1 FROM catalog_agents WHERE display_name = ? AND id <> ? AND deleted_at IS NULL",
						next.display_name,
						id,
					))
				) {
					throw new KitError("conflict", "展示名已存在，请使用其他展示名");
				}
				const listedAt = current.status !== "listed" && next.status === "listed" ? next.updated_at : null;
				const row = writableFields(next);
				const assignments = Object.keys(row)
					.map((column) => `${column} = ?`)
					.join(", ");
				await db.run(
					`UPDATE catalog_agents SET ${assignments}, listed_at = COALESCE(?, listed_at) WHERE id = ?`,
					...Object.values(row),
					listedAt,
					id,
				);
				return next;
			});
		},
		async all(): Promise<CatalogAgentView[]> {
			return await this.list();
		},
		/** 仅创建新条目；数据库写入原子拒绝重复 ID 或展示名，不覆盖已有条目。 */
		async create(input: CatalogEntryInput): Promise<CatalogAgentView> {
			const view = newEntry(input);
			await this.insert(view);
			return view;
		},
		/**
		 * 创建条目，或按 slug 更新已存在条目的展示信息。
		 * **status 不在这里改**：上/下架必须走 plan → 确认令牌（AGENTS.md 红线）。
		 */
		async upsert(input: CatalogEntryInput) {
			return db.transaction(async () => {
				const { slug, ...display } = input;
				const existing = await this.getBySlug(slug);
				// 已删行不参与 upsert：slug 已被部分唯一索引释放，按创建新条目处理，不会"复活"已删行。
				if (existing && !existing.deleted)
					return (await this.update(existing.id, definedOnly(display))) as CatalogAgentView;
				return this.create(input);
			});
		},
		/** 按 slug 改展示信息（PUT /api/admin/agents/:slug）；不存在返回 null。 */
		async updateBySlug(
			slug: string,
			patch: Partial<Omit<CatalogEntryInput, "slug">>,
		): Promise<CatalogAgentView | null> {
			const existing = await this.getBySlug(slug);
			if (!existing) return null;
			return await this.update(existing.id, definedOnly(patch));
		},
		async setStatus(slug: string, status: "listed" | "unlisted") {
			const existing = await this.getBySlug(slug);
			if (!existing) return null;
			return await this.update(existing.id, { status });
		},
		/** 软删：仅标记 deleted_at，不改上下架 status；历史会话与用量账本保留，员工端按此列过滤。 */
		async markDeleted(id: string): Promise<boolean> {
			const now = new Date().toISOString();
			const result = await db.run(
				"UPDATE catalog_agents SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
				now,
				now,
				id,
			);
			return result.changes > 0;
		},
	};
}
export type CatalogStore = ReturnType<typeof createCatalogStore>;
