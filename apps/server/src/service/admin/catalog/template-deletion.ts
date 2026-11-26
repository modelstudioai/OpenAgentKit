import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
	type ApplyRequest,
	type CatalogAgentView,
	KitError,
	type PlanResponse,
	type TemplateView,
} from "@openagentkit/sdk/protocol";
import { redactSecrets } from "../../../config.ts";
import { KitTemplateListingsEntity } from "../../../entity/tables/kit-template-listings.entity.ts";
import { KitTemplateVersionsEntity } from "../../../entity/tables/kit-template-versions.entity.ts";
import { KitTemplatesEntity } from "../../../entity/tables/kit-templates.entity.ts";
import { StoreDatabase } from "../../../store/database.ts";
import { AuditService } from "../../shared/audit.ts";
import { CatalogService } from "../../shared/catalog.ts";
import { ConfirmGate } from "../../shared/confirm-gate.ts";
import { TemplateCatalogService } from "../../shared/templates.ts";

function fingerprint(template: TemplateView, entry: CatalogAgentView | null): string {
	return createHash("sha256").update(JSON.stringify({ template, entry })).digest("hex");
}

/** 只删除本地配置目录和关联条目，不依赖 Provider，也不触碰既有 Session。 */
@Injectable()
export class TemplateDeletionService {
	constructor(
		@Inject(TemplateCatalogService) private readonly templates: TemplateCatalogService,
		@Inject(AuditService) private readonly audit: AuditService,
		@Inject(CatalogService) private readonly catalog: CatalogService,
		@Inject(ConfirmGate) private readonly gate: ConfirmGate,
		@Inject(StoreDatabase) private readonly db: StoreDatabase,
	) {}

	async planDelete(templateId: string, subject: string): Promise<PlanResponse> {
		const template = await this.templates.get(templateId);
		const entry = await this.catalogFor(template);
		const planId = `template_delete:${fingerprint(template, entry)}:${randomUUID()}`;
		const issued = await this.gate.issue({ planId, action: `templates.delete:${templateId}`, subject });
		return {
			plan_id: planId,
			confirm_token: issued.confirmToken,
			expires_at: issued.expiresAt,
			destructive: true,
			diff: [
				{
					resource: `template:${templateId}`,
					action: "delete",
					destructive: true,
					summary: `删除模版「${template.name}」的当前配置和全部历史版本，此操作不可恢复。`,
				},
				...(entry
					? [
							{
								resource: `catalog:${entry.slug}`,
								action: "delete" as const,
								destructive: true,
								summary: `同时移除${entry.status === "listed" ? "已上架" : "未上架"}条目「${entry.display_name}」，员工不能再通过该条目新建会话。`,
							},
						]
					: []),
				{
					resource: `template:${templateId}/retained-resources`,
					action: "noop",
					destructive: false,
					summary: "已有会话、远端智能体、环境、文件、记忆库和密钥库将保留。",
				},
			],
		};
	}

	async remove(templateId: string, input: Partial<ApplyRequest>, subject: string) {
		const planId = input?.plan_id ?? "";
		await this.gate.consume({
			planId,
			action: `templates.delete:${templateId}`,
			subject,
			token: input?.confirm_token ?? "",
		});
		const parts = planId.split(":");
		if (parts.length !== 3 || parts[0] !== "template_delete" || !/^[a-f0-9]{64}$/.test(parts[1] ?? "")) {
			throw new KitError("confirmation_required", "删除确认计划无效，请重试并再次确认删除");
		}
		let catalogId: string | undefined;
		let name = "";
		await this.db.transaction(async () => {
			const current = await this.templates.get(templateId);
			const entry = await this.catalogFor(current);
			if (fingerprint(current, entry) !== parts[1]) {
				throw new KitError("conflict", "模版或关联条目已变更，请重试并再次确认删除");
			}
			name = current.name;
			if (entry) {
				if (!(await this.catalog.remove(entry.id)))
					throw new KitError("conflict", "关联条目已变更，请重试并再次确认删除");
				catalogId = entry.id;
			}
			const removed = await this.db.write(async (manager) => {
				const key = { template_id: templateId };
				await manager.delete(KitTemplateVersionsEntity, key);
				await manager.delete(KitTemplateListingsEntity, key);
				return manager.delete(KitTemplatesEntity, key);
			});
			if (!removed.affected) throw new KitError("conflict", "模版已变更，请重试并再次确认删除");
		});
		await this.audit.append({
			subject,
			action: "templates.delete",
			target: templateId,
			detail: { name: redactSecrets(name), ...(catalogId ? { catalog_id: catalogId } : {}) },
		});
		return { deleted: true as const };
	}

	private async catalogFor(template: TemplateView): Promise<CatalogAgentView | null> {
		return template.listing ? await this.catalog.get(template.listing.catalog_id) : null;
	}
}
