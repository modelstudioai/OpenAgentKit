import { Inject, Injectable } from "@nestjs/common";
import {
	KitError,
	type TemplateInput,
	TemplateInputSchema,
	type TemplatesQuery,
	TemplatesQuerySchema,
	type TemplateUpdateInput,
	TemplateUpdateInputSchema,
	TemplateVersionSummarySchema,
	type TemplateVersionsPage,
	type TemplateVersionsQuery,
	TemplateVersionsQuerySchema,
	type TemplateVersionView,
	TemplateVersionViewSchema,
	type TemplateView,
} from "@openagentkit/sdk/protocol";
import { LessThan, Not } from "typeorm";
import type { z } from "zod";
import { redactSecrets } from "../../../config.ts";
import { KitTemplateVersionsEntity } from "../../../entity/tables/kit-template-versions.entity.ts";
import { KitTemplatesEntity } from "../../../entity/tables/kit-templates.entity.ts";
import type { ProviderGateway } from "../../../gateway/types.ts";
import { StoreDatabase } from "../../../store/database.ts";
import { KIT_PROVIDER_GATEWAY } from "../../../utils/injection-tokens.ts";
import { AuditService } from "../../shared/audit.ts";
import { CatalogService } from "../../shared/catalog.ts";
import { CatalogResourceService } from "../../shared/catalog-resources.ts";
import { TemplateCatalogService, type TemplateRecord } from "../../shared/templates.ts";
import { TemplateDeletionService } from "./template-deletion.ts";
import { TemplateListingService } from "./template-listing.ts";

function versionCursor(token: string | undefined, templateId: string): number | undefined {
	if (!token) return undefined;
	try {
		if (!/^[A-Za-z0-9_-]+$/.test(token)) throw new Error("invalid cursor encoding");
		const value: unknown = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
		if (
			value &&
			typeof value === "object" &&
			"template_id" in value &&
			value.template_id === templateId &&
			"before" in value &&
			typeof value.before === "number" &&
			Number.isSafeInteger(value.before) &&
			value.before > 0
		)
			return value.before;
	} catch {
		/* 游标只用于当前模版的历史分页，不回显原始内容。 */
	}
	throw new KitError("invalid_request", "版本分页游标无效或不属于当前模版，请重新查询");
}

function validated<T>(schema: z.ZodType<T>, input: unknown): T {
	const result = schema.safeParse(input);
	if (!result.success) throw new KitError("invalid_request", result.error.issues[0]?.message ?? "模版参数无效");
	return result.data;
}

@Injectable()
export class TemplateService {
	constructor(
		@Inject(TemplateCatalogService) private readonly templates: TemplateCatalogService,
		@Inject(KIT_PROVIDER_GATEWAY) private readonly gateway: ProviderGateway,
		@Inject(CatalogResourceService) private readonly resources: CatalogResourceService,
		@Inject(AuditService) private readonly audit: AuditService,
		@Inject(CatalogService) private readonly catalog: CatalogService,
		@Inject(TemplateListingService) private readonly listingState: TemplateListingService,
		@Inject(TemplateDeletionService) private readonly deletion: TemplateDeletionService,
		@Inject(StoreDatabase) private readonly db: StoreDatabase,
	) {}

	planListing(...args: Parameters<typeof this.listingState.planListing>) {
		return this.listingState.planListing(...args);
	}

	listing(...args: Parameters<typeof this.listingState.listing>) {
		return this.listingState.listing(...args);
	}

	planDelete(...args: Parameters<typeof this.deletion.planDelete>) {
		return this.deletion.planDelete(...args);
	}

	remove(...args: Parameters<typeof this.deletion.remove>) {
		return this.deletion.remove(...args);
	}

	get(templateId: string) {
		return this.templates.get(templateId);
	}

	private async currentVersion(templateId: string): Promise<number> {
		const row = await this.db.read((manager) =>
			manager.findOne(KitTemplatesEntity, { where: { template_id: templateId }, select: { version: true } }),
		);
		if (!row) throw new KitError("not_found", "模版不存在");
		return row.version;
	}

	async versions(templateId: string, input: TemplateVersionsQuery): Promise<TemplateVersionsPage> {
		const query = validated(TemplateVersionsQuerySchema, input);
		const version = await this.currentVersion(templateId);
		const before = versionCursor(query.page_token, templateId);
		const rows = await this.db.read((manager) =>
			manager.find(KitTemplateVersionsEntity, {
				where: { template_id: templateId, ...(before === undefined ? {} : { version: LessThan(before) }) },
				order: { version: "DESC" },
				take: query.limit + 1,
			}),
		);
		const data = rows.slice(0, query.limit).map((row) =>
			TemplateVersionSummarySchema.strip().parse({
				...JSON.parse(row.config_json),
				version: row.version,
				created_at: row.created_at,
			}),
		);
		const last = data.at(-1);
		return {
			data,
			current_version: version,
			...(rows.length > query.limit && last
				? {
						next_page_token: Buffer.from(JSON.stringify({ template_id: templateId, before: last.version })).toString(
							"base64url",
						),
					}
				: {}),
		};
	}

	async version(templateId: string, value: number): Promise<TemplateVersionView> {
		const version = validated(TemplateVersionViewSchema.shape.version, value);
		await this.currentVersion(templateId);
		const row = await this.db.read((manager) =>
			manager.findOneBy(KitTemplateVersionsEntity, { template_id: templateId, version }),
		);
		if (!row) throw new KitError("not_found", "模版版本不存在");
		return TemplateVersionViewSchema.parse({
			...JSON.parse(row.config_json),
			template_id: row.template_id,
			version: row.version,
			created_at: row.created_at,
		});
	}

	async list(query: TemplatesQuery) {
		return await this.templates.list(validated(TemplatesQuerySchema, query));
	}

	async create(input: TemplateInput, subject: string) {
		const config = validated(TemplateInputSchema, input);
		const template = await this.templates.createInitialVersion(await this.prepareConfig(config));
		await this.audit.append({
			subject,
			action: "templates.create",
			target: template.template_id,
			detail: { name: redactSecrets(template.name), version: template.version },
		});
		return template;
	}

	async update(templateId: string, input: TemplateUpdateInput, subject: string) {
		const { base_version: baseVersion, ...config } = validated(TemplateUpdateInputSchema, input);
		if ((await this.templates.get(templateId)).version !== baseVersion) {
			throw new KitError("conflict", "模版已有新版本，请刷新后重新编辑");
		}
		const prepared = await this.prepareConfig(config);
		const template = await this.db.transaction(async () => {
			const current = await this.templates.get(templateId);
			if (current.version !== baseVersion) throw new KitError("conflict", "模版已有新版本，请刷新后重新编辑");
			const duplicate = await this.db.read((manager) =>
				manager.existsBy(KitTemplatesEntity, { name: prepared.name, template_id: Not(templateId) }),
			);
			if (duplicate) throw new KitError("conflict", "模版名称已存在，请使用其他名称");
			const version = current.version + 1;
			const now = new Date().toISOString();
			const updated = await this.db.write((manager) =>
				manager.update(
					KitTemplatesEntity,
					{ template_id: templateId, version: baseVersion },
					{
						name: prepared.name,
						remote_agent_id: prepared.remote_agent_id,
						remote_agent_name: prepared.remote_agent_name,
						config_json: JSON.stringify(prepared),
						updated_at: now,
						version,
					},
				),
			);
			if (!updated.affected) throw new KitError("conflict", "模版已有新版本，请刷新后重新编辑");
			await this.templates.appendVersion(templateId, version, prepared, now);
			await this.syncListing(await this.templates.get(templateId));
			return await this.templates.get(templateId);
		});
		await this.audit.append({
			subject,
			action: "templates.update",
			target: templateId,
			detail: { name: redactSecrets(template.name), version: template.version },
		});
		return template;
	}

	private async prepareConfig(config: TemplateInput): Promise<TemplateRecord> {
		const [agents, environments] = await Promise.all([
			this.gateway.listRemoteAgents(),
			config.remote_environment_id ? this.gateway.listRemoteEnvironments() : Promise.resolve([]),
		]);
		const agent = agents.find((item) => item.agent_id === config.remote_agent_id);
		const environment = environments.find((item) => item.environment_id === config.remote_environment_id);
		if (!agent) throw new KitError("invalid_request", "所选智能体不存在，请返回选择配置重新选择");
		if (environment?.environment_id !== config.remote_environment_id)
			throw new KitError("invalid_request", "所选环境不存在，请返回选择配置重新选择");
		const resources = await this.resources.prepare(config);
		const version = config.agent_version ?? agent.version;
		return {
			...resources,
			description: config.description?.trim() || undefined,
			opening_remarks: config.opening_remarks?.trim() || undefined,
			suggested_prompts: config.suggested_prompts.map((prompt) => prompt.trim()).filter(Boolean),
			remote_agent_name: agent.name || agent.agent_id,
			...(version !== undefined ? { remote_agent_version: version } : {}),
			...(environment ? { remote_environment_name: environment.name || environment.environment_id } : {}),
		};
	}

	private async syncListing(current: TemplateView) {
		if (!current.listing) return;
		const entry = await this.catalog.get(current.listing.catalog_id);
		if (!entry) throw new KitError("conflict", "关联的上架条目已变化，请刷新后重试");
		const updated = await this.catalog.update(
			entry.id,
			this.resources.catalogInputFromTemplate(current, entry.slug, current.name.slice(0, 60).trimEnd()),
		);
		if (!updated) throw new KitError("conflict", "关联的上架条目已变化，请刷新后重试");
	}
}
