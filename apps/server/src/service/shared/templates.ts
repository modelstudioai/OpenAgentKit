import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
	KitError,
	type TemplatesPage,
	type TemplatesQuery,
	type TemplateView,
	TemplateViewSchema,
} from "@openagentkit/sdk/protocol";
import type { EntityManager } from "typeorm";
import { CatalogAgentsEntity } from "../../entity/tables/catalog-agents.entity.ts";
import { KitTemplateListingsEntity } from "../../entity/tables/kit-template-listings.entity.ts";
import { KitTemplateVersionsEntity } from "../../entity/tables/kit-template-versions.entity.ts";
import { KitTemplatesEntity } from "../../entity/tables/kit-templates.entity.ts";
import { StoreDatabase } from "../../store/database.ts";
import { jsonText, likePattern } from "../../store/sql.ts";

export type TemplateRecord = Omit<TemplateView, "template_id" | "created_at" | "updated_at" | "version" | "listing">;
interface TemplateRow {
	template_id: string;
	name: string;
	config_json: string;
	created_at: string;
	updated_at: string;
	version: number;
	catalog_id: string | null;
	catalog_slug: string | null;
	catalog_display_name: string | null;
	catalog_status: string | null;
	catalog_listed_at: string | null;
}
function templateRows(manager: EntityManager) {
	const query = manager
		.createQueryBuilder(KitTemplatesEntity, "t")
		.leftJoin(KitTemplateListingsEntity, "l", "l.template_id = t.template_id")
		.leftJoin(CatalogAgentsEntity, "c", "c.id = l.catalog_id")
		.select([]);
	for (const field of ["template_id", "name", "config_json", "created_at", "updated_at", "version"] as const) {
		query.addSelect(`t.${field}`, field);
	}
	for (const field of ["id", "slug", "display_name", "status", "listed_at"] as const) {
		query.addSelect(`c.${field}`, `catalog_${field}`);
	}
	return query;
}

interface Cursor {
	id: string;
	created_at: string;
	search: string;
	status?: TemplatesQuery["status"];
	category?: TemplatesQuery["category"];
}
function cursorFor(
	token: string | undefined,
	search: string,
	status: TemplatesQuery["status"],
	category: TemplatesQuery["category"],
): Cursor | undefined {
	if (!token) return undefined;
	try {
		const value: unknown = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
		if (
			value &&
			typeof value === "object" &&
			"search" in value &&
			value.search === search &&
			("status" in value ? value.status === status : status === undefined) &&
			("category" in value ? value.category === category : category === undefined) &&
			"id" in value &&
			typeof value.id === "string" &&
			/^template_[0-9a-f-]{36}$/.test(value.id) &&
			"created_at" in value &&
			typeof value.created_at === "string" &&
			/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.created_at)
		) {
			return { id: value.id, created_at: value.created_at, search, status, category };
		}
	} catch {
		/* 不回显不可信游标。 */
	}
	throw new KitError("invalid_request", "分页游标无效或与当前查询不匹配，请重新查询");
}

function asTemplate(row: TemplateRow): TemplateView {
	return TemplateViewSchema.parse({
		...JSON.parse(row.config_json),
		template_id: row.template_id,
		name: row.name,
		created_at: row.created_at,
		updated_at: row.updated_at,
		version: row.version,
		...(row.catalog_id
			? {
					listing: {
						catalog_id: row.catalog_id,
						slug: row.catalog_slug,
						display_name: row.catalog_display_name,
						status: row.catalog_status,
						...(row.catalog_listed_at ? { listed_at: row.catalog_listed_at } : {}),
					},
				}
			: {}),
	});
}

/** 模版只保存管理员选择的资源引用和展示配置，不保存事件正文或 Provider 凭据。 */
@Injectable()
export class TemplateCatalogService {
	constructor(@Inject(StoreDatabase) private readonly db: StoreDatabase) {}

	async appendVersion(templateId: string, version: number, input: TemplateRecord, createdAt: string) {
		await this.db.write((manager) =>
			manager.insert(KitTemplateVersionsEntity, {
				template_id: templateId,
				version,
				config_json: JSON.stringify(input),
				created_at: createdAt,
			}),
		);
	}

	async get(templateId: string): Promise<TemplateView> {
		const row = await this.db.read((manager) =>
			templateRows(manager).where("t.template_id = :templateId", { templateId }).getRawOne<TemplateRow>(),
		);
		if (!row) throw new KitError("not_found", "模版不存在");
		return asTemplate(row);
	}

	async linkCatalog(templateId: string, catalogId: string) {
		await this.db.write(async (manager) => {
			const key = { template_id: templateId };
			if (await manager.existsBy(KitTemplateListingsEntity, key)) {
				await manager.update(KitTemplateListingsEntity, key, { catalog_id: catalogId });
			} else {
				await manager.insert(KitTemplateListingsEntity, { ...key, catalog_id: catalogId });
			}
		});
	}

	async createInitialVersion(input: TemplateRecord): Promise<TemplateView> {
		return await this.db.transaction(async () => {
			const id = `template_${randomUUID()}`;
			const now = new Date().toISOString();
			const inserted = await this.db.insertEntityIfAbsent(
				KitTemplatesEntity,
				{
					template_id: id,
					name: input.name,
					remote_agent_id: input.remote_agent_id,
					remote_agent_name: input.remote_agent_name,
					config_json: JSON.stringify(input),
					created_at: now,
					updated_at: now,
					version: 1,
				},
				["name"],
			);
			if (!inserted) throw new KitError("conflict", "模版名称已存在，请使用其他名称");
			await this.appendVersion(id, 1, input, now);
			return await this.get(id);
		});
	}

	async list(query: TemplatesQuery): Promise<TemplatesPage> {
		const search = (query.search ?? "").toLowerCase();
		const cursor = cursorFor(query.page_token, search, query.status, query.category);
		const rows = await this.db.read((manager) => {
			const templates = templateRows(manager)
				.where(
					"(LOWER(t.name) LIKE :pattern ESCAPE '!' OR LOWER(t.remote_agent_id) LIKE :pattern ESCAPE '!' OR LOWER(t.remote_agent_name) LIKE :pattern ESCAPE '!')",
					{ pattern: likePattern(search) },
				)
				.orderBy("t.created_at", "DESC")
				.addOrderBy("t.template_id", "DESC")
				.limit(query.limit + 1);
			if (query.status) templates.andWhere("COALESCE(c.status, 'unlisted') = :status", { status: query.status });
			if (query.category)
				templates.andWhere(`COALESCE(${jsonText(this.db, "t.config_json", "category")}, 'general') = :category`, {
					category: query.category,
				});
			if (cursor)
				templates.andWhere(
					"(t.created_at < :created_at OR (t.created_at = :created_at AND t.template_id < :id))",
					cursor,
				);
			return templates.getRawMany<TemplateRow>();
		});
		const data = rows.slice(0, query.limit).map(asTemplate);
		const last = data.at(-1);
		return {
			data,
			...(rows.length > query.limit && last
				? {
						next_page_token: Buffer.from(
							JSON.stringify({
								id: last.template_id,
								created_at: last.created_at,
								search,
								status: query.status,
								category: query.category,
							}),
						).toString("base64url"),
					}
				: {}),
		};
	}
}
