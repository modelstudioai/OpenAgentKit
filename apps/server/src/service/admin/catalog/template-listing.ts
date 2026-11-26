import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
	type CatalogAgentView,
	KitError,
	PLAZA_CATEGORY_LABELS,
	type PlanResponse,
	type TemplateListingInput,
	TemplateListingInputSchema,
	type TemplateListingRequest,
	type TemplateView,
} from "@openagentkit/sdk/protocol";
import { redactSecrets } from "../../../config.ts";
import type { ProviderGateway } from "../../../gateway/types.ts";
import { StoreDatabase } from "../../../store/database.ts";
import { KIT_PROVIDER_GATEWAY } from "../../../utils/injection-tokens.ts";
import { AuditService } from "../../shared/audit.ts";
import { type CatalogEntryInput, CatalogService } from "../../shared/catalog.ts";
import { CatalogResourceService } from "../../shared/catalog-resources.ts";
import { ConfirmGate } from "../../shared/confirm-gate.ts";
import { TemplateCatalogService } from "../../shared/templates.ts";

interface ListingTarget {
	template: TemplateView;
	entry: CatalogAgentView | null;
	slug: string;
}

function listingInput(input: TemplateListingInput): TemplateListingInput {
	const parsed = TemplateListingInputSchema.safeParse(input);
	if (!parsed.success) throw new KitError("invalid_request", parsed.error.issues[0]?.message ?? "上架参数无效");
	return parsed.data;
}

function fingerprint(target: ListingTarget, config: CatalogEntryInput): string {
	return createHash("sha256").update(JSON.stringify({ target, config })).digest("hex");
}

@Injectable()
export class TemplateListingService {
	constructor(
		@Inject(TemplateCatalogService) private readonly templates: TemplateCatalogService,
		@Inject(KIT_PROVIDER_GATEWAY) private readonly gateway: ProviderGateway,
		@Inject(CatalogResourceService) private readonly resources: CatalogResourceService,
		@Inject(AuditService) private readonly audit: AuditService,
		@Inject(CatalogService) private readonly catalog: CatalogService,
		@Inject(ConfirmGate) private readonly gate: ConfirmGate,
		@Inject(StoreDatabase) private readonly db: StoreDatabase,
	) {}

	async planListing(templateId: string, input: TemplateListingInput, subject: string): Promise<PlanResponse> {
		const { display_name: displayName } = listingInput(input);
		const target = await this.targetFor(templateId, displayName);
		const config = await this.configFor(target, displayName);
		const planId = `template_listing:${fingerprint(target, config)}:${randomUUID()}`;
		const issued = await this.gate.issue({ planId, action: `templates.listing:${templateId}`, subject });
		return {
			plan_id: planId,
			confirm_token: issued.confirmToken,
			expires_at: issued.expiresAt,
			destructive: true,
			diff: [
				{
					resource: `catalog:${target.slug}`,
					action: target.entry ? "update" : "create",
					destructive: Boolean(target.entry),
					summary: `${target.entry ? "覆盖现有条目的智能体、运行时配置和展示配置" : "使用模版配置创建上架条目"}：${displayName}。分类 ${PLAZA_CATEGORY_LABELS[target.template.category]}；智能体 ${config.remote_agent_id}，环境 ${config.remote_environment_id ?? "使用智能体默认环境"}；文件 ${config.files?.length ?? 0} 个、记忆库 ${config.memory_stores?.length ?? 0} 个、密钥库 ${config.vault_ids?.length ?? 0} 个；同步描述、开场白和示例问题。`,
				},
				{
					resource: `catalog:${target.slug}/status`,
					action: "update",
					destructive: true,
					summary: `「${displayName}」未上架 → 已上架，员工端可见并可创建会话。`,
				},
			],
		};
	}

	async listing(templateId: string, input: TemplateListingRequest, subject: string): Promise<CatalogAgentView> {
		const { display_name: displayName } = listingInput({ display_name: input.display_name });
		const planId = input.plan_id ?? "";
		await this.gate.consume({
			planId,
			action: `templates.listing:${templateId}`,
			subject,
			token: input.confirm_token ?? "",
		});
		const parts = planId.split(":");
		if (parts.length !== 3 || parts[0] !== "template_listing" || !/^[a-f0-9]{64}$/.test(parts[1] ?? "")) {
			throw new KitError("confirmation_required", "上架确认计划无效，请重新预览计划");
		}
		const target = await this.targetFor(templateId, displayName);
		const config = await this.configFor(target, displayName);
		const entry = await this.db.transaction(async () => {
			// Provider 校验和确认验签均会 await；事务内再次读取完整目标，拒绝期间的任何目录变化。
			const current = await this.targetFor(templateId, displayName);
			if (fingerprint(current, config) !== parts[1]) {
				throw new KitError("conflict", "模版、上架信息或资源已变更，请重新预览上架计划");
			}
			if (current.entry) {
				const updated = await this.catalog.update(current.entry.id, { ...config, status: "listed" });
				if (!updated) throw new KitError("conflict", "上架条目已变更，请重新预览上架计划");
				await this.templates.linkCatalog(templateId, updated.id);
				return updated;
			}
			const created = await this.catalog.create(config);
			const listed = await this.catalog.setStatus(created.slug, "listed");
			if (!listed) throw new KitError("conflict", "上架条目已变更，请重新预览上架计划");
			await this.templates.linkCatalog(templateId, listed.id);
			return listed;
		});
		await this.audit.append({
			subject,
			action: "templates.listing",
			target: templateId,
			detail: { name: redactSecrets(entry.display_name), catalog_id: entry.id },
		});
		return entry;
	}

	private async targetFor(templateId: string, displayName: string): Promise<ListingTarget> {
		const template = await this.templates.get(templateId);
		const entry = template.listing ? await this.catalog.get(template.listing.catalog_id) : null;
		if (entry?.status === "listed") throw new KitError("conflict", "该模版已上架，请刷新模版列表查看");
		const slug = entry?.slug ?? template.template_id;
		if (!entry && (await this.catalog.getBySlug(slug)))
			throw new KitError("conflict", "模版的上架 ID 已被其他条目占用");
		if ((await this.catalog.all()).some((item) => item.id !== entry?.id && item.display_name === displayName)) {
			throw new KitError("conflict", "展示名已存在，请使用其他展示名");
		}
		return { template, entry, slug };
	}

	private async configFor(target: ListingTarget, displayName: string): Promise<CatalogEntryInput> {
		const { template } = target;
		const [agents, environments] = await Promise.all([
			this.gateway.listRemoteAgents(),
			template.remote_environment_id ? this.gateway.listRemoteEnvironments() : Promise.resolve([]),
		]);
		if (!agents.some((agent) => agent.agent_id === template.remote_agent_id)) {
			throw new KitError("invalid_request", "模版的智能体不存在，请重新保存模版");
		}
		if (
			template.remote_environment_id &&
			!environments.some((environment) => environment.environment_id === template.remote_environment_id)
		) {
			throw new KitError("invalid_request", "模版的环境不存在，请重新保存模版");
		}
		return this.resources.prepare(this.resources.catalogInputFromTemplate(template, target.slug, displayName));
	}
}
