import { lstat, rm } from "node:fs/promises";
import { join } from "node:path";
import { KitError, ProjectResourceBindingSchema } from "@openagentkit/sdk/protocol";
import { z } from "zod";
import { KitResourceDraftDocumentsEntity } from "../../../../entity/tables/kit-resource-draft-documents.entity.ts";
import { KitResourceDraftsEntity } from "../../../../entity/tables/kit-resource-drafts.entity.ts";
import { initialDraftYaml } from "../../../../gateway/shared/resource-draft/yaml-draft-document.ts";
import type { ResourceDraftGateway } from "../../../../gateway/types.ts";
import type { ResourceDraftPublishedBinding } from "../../../../resource-draft-types.ts";
import type { StoreDatabase } from "../../../../store/database.ts";

const ResourceDraftProofSchema = z
	.object({
		draft_id: z.string(),
		owner: z.string(),
		project_revision: z.string(),
		cleanup_started: z.boolean().optional(),
		required: z
			.array(
				ProjectResourceBindingSchema.pick({ id: true }).extend({
					type: z.enum(["agent", "environment", "file", "memory_store", "vault", "skill"]),
				}),
			)
			.min(1),
		resources: z
			.array(
				z.union([
					ProjectResourceBindingSchema,
					z.object({ type: z.literal("skill"), id: z.string(), remote_id: z.string(), version: z.string().optional() }),
				]),
			)
			.optional(),
	})
	.strict();
type ResourceDraftProof = z.infer<typeof ResourceDraftProofSchema>;

interface DraftRecoveryContext {
	draft_id: string;
	owner: string;
	expected_revision: string | null;
}

/** 以数据库中的完整成功证明收尾；本地只保留本批次的受控上传文件。 */
export class ResourceDraftRecovery {
	constructor(
		private readonly dataDir: string,
		private readonly db: StoreDatabase,
		private readonly releaseDocument: (id: string) => void,
	) {}

	assetRoot(id: string) {
		if (!/^draft_[a-f0-9]{32}$/.test(id)) throw new KitError("not_found", "资源发布批次不存在");
		return join(this.dataDir, "resource-draft-uploads", id);
	}

	async assertSafe(id: string) {
		for (const path of [join(this.dataDir, "resource-draft-uploads"), this.assetRoot(id)]) {
			const info = await lstat(path).catch((error: NodeJS.ErrnoException) => {
				if (error.code === "ENOENT") return undefined;
				throw error;
			});
			if (info && (!info.isDirectory() || info.isSymbolicLink())) throw new KitError("conflict", "上传暂存目录不安全");
		}
	}

	async initialize(id: string) {
		await this.assertSafe(id);
		await this.db.insertEntityIfAbsent(KitResourceDraftDocumentsEntity, { draft_id: id, yaml: initialDraftYaml }, [
			"draft_id",
		]);
	}

	async readDocument(id: string) {
		const row = await this.db.read((manager) => manager.findOneBy(KitResourceDraftDocumentsEntity, { draft_id: id }));
		return row ? { ...row, draft_id: id } : undefined;
	}

	async writeProof(proof: ResourceDraftProof) {
		const value = JSON.stringify(ResourceDraftProofSchema.parse(proof));
		const result = await this.db.write((manager) =>
			manager.update(KitResourceDraftDocumentsEntity, { draft_id: proof.draft_id }, { proof_json: value }),
		);
		if (!result.affected) throw new KitError("conflict", "发布批次已关闭");
	}

	private async readProof(id: string, owner: string): Promise<ResourceDraftProof | null> {
		const text = (await this.readDocument(id))?.proof_json;
		if (!text) return null;
		const result = ResourceDraftProofSchema.safeParse(JSON.parse(text));
		if (!result.success || result.data.draft_id !== id || result.data.owner !== owner)
			throw new KitError("conflict", "发布成功证明无效");
		return result.data;
	}

	async hasSuccessProof(row: DraftRecoveryContext) {
		try {
			const proof = await this.readProof(row.draft_id, row.owner);
			return proof !== null && proof.project_revision === row.expected_revision;
		} catch {
			// 读取结果时，无效或缺失证明只能继续核对。
			return false;
		}
	}

	async recordReceipt(
		row: DraftRecoveryContext,
		scoped: ResourceDraftGateway,
		onPhase?: (phase: "bindings" | "receipt") => void,
	) {
		const proof = await this.readProof(row.draft_id, row.owner);
		if (!proof || proof.project_revision !== row.expected_revision)
			throw new KitError("conflict", "尚无已确认的发布成功凭证，不能清理或自动重新发布");
		onPhase?.("bindings");
		const resources = proof.resources ?? (await this.bindings(proof, scoped));
		onPhase?.("receipt");
		if (!proof.resources) await this.writeProof({ ...proof, resources });
		await this.saveReceipt(row.draft_id, resources);
	}

	async clearDocument(id: string, beforeRemove?: () => Promise<void>) {
		await this.assertSafe(id);
		await beforeRemove?.();
		await rm(this.assetRoot(id), { recursive: true, force: true });
		await this.db.write((manager) => manager.delete(KitResourceDraftDocumentsEntity, { draft_id: id }));
		this.releaseDocument(id);
	}

	private async bindings(proof: ResourceDraftProof, scoped: ResourceDraftGateway) {
		if ((await scoped.overview()).project_revision !== proof.project_revision)
			throw new KitError("conflict", "发布后的批次配置已变化，保留批次等待核对");
		const resources = await scoped.publicationBindings();
		const keys = new Set(resources.map((resource) => `${resource.type}:${resource.id}`));
		if (
			resources.length !== proof.required.length ||
			proof.required.some((resource) => !keys.has(`${resource.type}:${resource.id}`))
		)
			throw new KitError("conflict", "发布结果缺少资源绑定，已保留批次");
		return resources;
	}

	async cleanPublished(row: DraftRecoveryContext, scoped: ResourceDraftGateway) {
		if (await this.readDocument(row.draft_id)) {
			const proof = await this.readProof(row.draft_id, row.owner);
			if (!proof || proof.project_revision !== row.expected_revision || !proof.resources)
				throw new KitError("conflict", "发布成功凭证不完整，不能清理批次");
			await this.clearDocument(row.draft_id, async () => {
				if (proof.cleanup_started) return;
				if ((await scoped.overview()).project_revision !== row.expected_revision)
					throw new KitError("conflict", "发布后的批次配置已变化，保留批次等待核对");
				await this.writeProof({ ...proof, cleanup_started: true });
			});
		}
		await this.finishCleanup(row.draft_id);
	}

	private async saveReceipt(id: string, resources: ResourceDraftPublishedBinding[]) {
		await this.db.write((manager) =>
			manager.update(
				KitResourceDraftsEntity,
				{ draft_id: id },
				{
					status: "published",
					phase: "succeeded",
					resources_json: JSON.stringify(resources),
					cleanup_pending: 1,
					updated_at: new Date().toISOString(),
				},
			),
		);
	}
	private async finishCleanup(id: string) {
		await this.db.write((manager) =>
			manager.update(
				KitResourceDraftsEntity,
				{ draft_id: id, status: "published" },
				{ cleanup_pending: 0, updated_at: new Date().toISOString() },
			),
		);
	}
}
