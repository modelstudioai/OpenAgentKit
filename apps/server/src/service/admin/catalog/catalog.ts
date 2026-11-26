import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { type ApplyRequest, type CatalogAgentInput, KitError } from "@openagentkit/sdk/protocol";
import { redactSecrets } from "../../../config.ts";
import { AuditService } from "../../shared/audit.ts";
import { CatalogService } from "../../shared/catalog.ts";
import { CatalogResourceService } from "../../shared/catalog-resources.ts";
import { ConfirmGate } from "../../shared/confirm-gate.ts";

type ListingStatus = "listed" | "unlisted";
type CatalogAction = { action: "listing"; status: ListingStatus } | { action: "delete" };
const LISTING_ACTION = "catalog.listing";
const DELETE_ACTION = "catalog.delete";

@Injectable()
export class AdminCatalogService {
	constructor(
		@Inject(CatalogService) private readonly catalog: CatalogService,
		@Inject(CatalogResourceService) private readonly resources: CatalogResourceService,
		@Inject(AuditService) private readonly audit: AuditService,
		@Inject(ConfirmGate) private readonly gate: ConfirmGate,
	) {}

	listAll() {
		return this.catalog.all();
	}

	async create(subject: string, input: CatalogAgentInput) {
		const { catalog, resources, audit } = this;
		const entry = await catalog.create(await resources.prepare(input));
		await audit.append({
			subject,
			action: "catalog.create",
			target: entry.slug,
			detail: { name: redactSecrets(entry.display_name) },
		});
		return entry;
	}

	async plan(subject: string, slug: string, input: CatalogAction) {
		const { catalog, gate } = this;
		const entry = await catalog.getBySlug(slug);
		if (!entry) throw new KitError("not_found", "agent 不存在");
		const isDelete = input.action === "delete";
		// 同一条目可以反复上下架，每次确认使用独立的计划。
		const planId = `catalog_${slug}_${isDelete ? "delete" : input.status}_${randomUUID().slice(0, 8)}`;
		const issued = await gate.issue({ planId, action: isDelete ? DELETE_ACTION : LISTING_ACTION, subject });
		return {
			plan_id: planId,
			confirm_token: issued.confirmToken,
			destructive: true,
			expires_at: issued.expiresAt,
			diff: [
				{
					resource: `catalog:${slug}`,
					action: isDelete ? "delete" : input.status === "listed" ? "list" : "unlist",
					destructive: true,
					summary: isDelete
						? `${entry.display_name}：删除上架条目（当前 ${entry.status}；Provider 上的 Agent 不受影响）`
						: `${entry.display_name}：${entry.status} → ${input.status}`,
				},
			],
		};
	}

	async setListing(subject: string, slug: string, input: ApplyRequest & { status: ListingStatus }) {
		const { catalog, gate, audit } = this;
		await gate.consume({ planId: input.plan_id, action: LISTING_ACTION, subject, token: input.confirm_token });
		const entry = await catalog.setStatus(slug, input.status);
		if (!entry) throw new KitError("not_found", "agent 不存在");
		await audit.append({
			subject,
			action: `catalog.${input.status === "listed" ? "list" : "unlist"}`,
			target: slug,
			detail: { name: redactSecrets(entry.display_name) },
		});
		return entry;
	}

	async update(subject: string, slug: string, patch: Partial<Omit<CatalogAgentInput, "slug">>) {
		const { catalog, resources, audit } = this;
		// 校验完整绑定，写入前复核智能体与版本，且只更新本次提交的字段。
		const current = await catalog.getBySlug(slug);
		if (!current) throw new KitError("not_found", "agent 不存在");
		const changedAgent = patch.remote_agent_id !== undefined && patch.remote_agent_id !== current.remote_agent_id;
		const versionPatch = patch.agent_version === undefined && changedAgent ? null : patch.agent_version;
		const prepared = await resources.prepare({
			...patch,
			remote_agent_id: patch.remote_agent_id ?? current.remote_agent_id,
			agent_version: versionPatch === undefined ? current.agent_version : versionPatch,
		});
		const latest = await catalog.getBySlug(slug);
		if (
			latest?.id !== current.id ||
			latest.remote_agent_id !== current.remote_agent_id ||
			latest.agent_version !== current.agent_version
		)
			throw new KitError("conflict", "智能体或版本绑定已变更，请刷新后重试");
		const entry = await catalog.updateBySlug(slug, {
			...prepared,
			remote_agent_id: patch.remote_agent_id,
			agent_version: versionPatch,
		});
		if (!entry) throw new KitError("not_found", "agent 不存在");
		await audit.append({
			subject,
			action: "catalog.update",
			target: slug,
			detail: { name: redactSecrets(entry.display_name), fields: Object.keys(patch) },
		});
		return entry;
	}

	async remove(subject: string, slug: string, input: ApplyRequest) {
		const { catalog, gate, audit } = this;
		const entry = await catalog.getBySlug(slug);
		if (!entry) throw new KitError("not_found", "agent 不存在");
		await gate.consume({ planId: input.plan_id, action: DELETE_ACTION, subject, token: input.confirm_token });
		const deleted = await catalog.remove(entry.id);
		await audit.append({
			subject,
			action: "catalog.delete",
			target: slug,
			detail: { name: redactSecrets(entry.display_name), remote_agent_id: entry.remote_agent_id },
		});
		return { deleted };
	}
}
