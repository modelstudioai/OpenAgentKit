import { randomUUID } from "node:crypto";
import {
	type DeclarationPreviewInput,
	KitError,
	type ProjectAgentCreateInput,
	ProjectAgentCreateInputSchema,
	type ProjectEnvironmentCreateInput,
	ProjectEnvironmentCreateInputSchema,
	type ProjectFileUploadInput,
	type ProjectMemoryStoreCreateInput,
	ProjectMemoryStoreCreateInputSchema,
	type ProjectResourceBindingInput,
	ProjectResourceBindingInputSchema,
	type ProjectSkillUploadInput,
	type ProjectVaultCreateInput,
	ProjectVaultCreateInputSchema,
	type RemoteSkillReference,
} from "@openagentkit/sdk/protocol";
import type { ProjectExecutionPlan, ProviderGateway, ResourceDraftGateway } from "../../../gateway/types.ts";
import type { AuditService } from "../../shared/audit.ts";
import type { ConfirmGate } from "../../shared/confirm-gate.ts";
import type { OperationService } from "../../shared/operations.ts";
import { ProjectFileUploads } from "./project-file-uploads.ts";
import { ProjectSkillUploads } from "./project-skill-uploads.ts";

export type DraftResourceActions = Pick<DraftResourceService, keyof DraftResourceService>;

export class DraftResourceService {
	private readonly uploads;
	private readonly skillUploads;
	private readonly gateway;
	private activeMutation: string | null;
	private mutationRevision;
	private readonly remote;
	private readonly audit;
	private readonly plans;
	private readonly gate;
	private readonly runner;
	private readonly id;

	constructor({
		id,
		gateway,
		remote,
		gate,
		runner,
		audit,
		uploadMaxBytes,
	}: {
		id: string;
		gateway: ResourceDraftGateway;
		remote: ProviderGateway;
		gate: ConfirmGate;
		runner: Pick<OperationService, "run">;
		audit: AuditService;
		uploadMaxBytes: number;
	}) {
		this.gateway = gateway;
		this.remote = remote;
		this.audit = audit;
		this.gate = gate;
		this.runner = runner;
		this.id = id;
		this.plans = new Map<string, { subject: string; expiresAt: number; expected: ProjectExecutionPlan }>();
		this.uploads = new ProjectFileUploads(uploadMaxBytes);
		this.skillUploads = new ProjectSkillUploads(uploadMaxBytes);
		this.activeMutation = null;
		this.mutationRevision = 0;
	}

	clearTransientState() {
		this.invalidate();
		this.uploads.clear();
		this.skillUploads.clear();
	}

	async overview(_name: string) {
		return { ...(await this.gateway.overview()), active_mutation: this.activeMutation };
	}

	declarations(_name: string) {
		return this.gateway.declarations();
	}

	async resourceBindings(_name: string) {
		if (this.activeMutation) throw new KitError("conflict", "批次正在修改，请完成后重新读取资源绑定");
		const revision = this.mutationRevision;
		const result = await this.gateway.resourceBindings();
		if (this.activeMutation || revision !== this.mutationRevision)
			throw new KitError("conflict", "批次已修改，请重新读取资源绑定");
		return result;
	}

	resolveResourceBindings(_name: string, input: ProjectResourceBindingInput) {
		const parsed = ProjectResourceBindingInputSchema.safeParse(input);
		if (!parsed.success) throw new KitError("invalid_request", "资源绑定查询参数无效");
		if (this.activeMutation) throw new KitError("conflict", "批次正在修改，请完成后重新读取资源绑定");
		return this.gateway.resolveResourceBindings(parsed.data);
	}

	agentOptions(_name: string) {
		return this.gateway.agentOptions();
	}

	createAgent(name: string, input: ProjectAgentCreateInput, subject: string) {
		const parsed = ProjectAgentCreateInputSchema.safeParse(input);
		if (!parsed.success) throw new KitError("invalid_request", parsed.error.issues[0]?.message ?? "智能体配置无效");
		this.requireDraft(name);
		return this.mutate("agent", async () => {
			await this.assertRevision(parsed.data.base_revision);
			await this.validateRemoteSkillReferences((parsed.data.skills ?? []).filter((skill) => typeof skill !== "string"));
			const result = await this.gateway.createAgent(parsed.data);
			await this.audit.append({ subject, action: "resourceDraft.agents.create", target: `${name}/${result.agent.id}` });
			return result;
		});
	}

	/** 创建草稿前复核远端 Skill 的来源、精确版本和可用状态。 */
	private async validateRemoteSkillReferences(references: readonly RemoteSkillReference[]) {
		for (const reference of references) {
			const detail = await this.remote.getRemoteSkillVersion(reference.skill_id, reference.version);
			if (!detail) throw new KitError("not_found", "所选 Skill 或版本不存在，请重新选择");
			if (
				detail.skill_id !== reference.skill_id ||
				detail.version !== reference.version ||
				detail.source !== reference.type
			)
				throw new KitError("invalid_request", "所选 Skill 的来源或版本不匹配，请重新选择");
			if (!detail.available) throw new KitError("invalid_request", "所选 Skill 版本尚未生效或已不可用");
		}
	}

	async memoryStoreConfiguration(_name: string, id: string) {
		if (this.activeMutation) throw new KitError("conflict", "批次正在修改，请稍后读取记忆库");
		const revision = this.mutationRevision;
		const result = await this.gateway.memoryStoreConfiguration(id);
		if (this.activeMutation || this.mutationRevision !== revision)
			throw new KitError("conflict", "批次已修改，请重新读取记忆库");
		return result;
	}

	createMemoryStore(name: string, input: ProjectMemoryStoreCreateInput, subject: string) {
		const parsed = ProjectMemoryStoreCreateInputSchema.safeParse(input);
		if (!parsed.success) throw new KitError("invalid_request", parsed.error.issues[0]?.message ?? "记忆库配置无效");
		this.requireDraft(name);
		return this.mutate("memory_store", async () => {
			const result = await this.gateway.createMemoryStore(parsed.data);
			await this.audit.append({
				subject,
				action: "resourceDraft.memoryStores.create",
				target: `${name}/${result.memory_store.id}`,
			});
			return result;
		});
	}

	createVault(name: string, input: ProjectVaultCreateInput, subject: string) {
		const parsed = ProjectVaultCreateInputSchema.safeParse(input);
		if (!parsed.success) throw new KitError("invalid_request", parsed.error.issues[0]?.message ?? "密钥库配置无效");
		this.requireDraft(name);
		return this.mutate("vault", async () => {
			const result = await this.gateway.createVault(parsed.data);
			await this.audit.append({ subject, action: "resourceDraft.vaults.create", target: `${name}/${result.vault.id}` });
			return result;
		});
	}

	createEnvironment(name: string, input: ProjectEnvironmentCreateInput, subject: string) {
		const parsed = ProjectEnvironmentCreateInputSchema.safeParse(input);
		if (!parsed.success) throw new KitError("invalid_request", parsed.error.issues[0]?.message ?? "环境配置无效");
		this.requireDraft(name);
		return this.mutate("environment", async () => {
			const result = await this.gateway.createEnvironment(parsed.data);
			await this.audit.append({
				subject,
				action: "resourceDraft.environments.create",
				target: `${name}/${result.environment.id}`,
			});
			return result;
		});
	}

	declaration(_name: string, type: string, id: string) {
		return this.gateway.declaration(type, id);
	}

	declarationPreview(_name: string, type: string, id: string, input: DeclarationPreviewInput) {
		return this.gateway.declarationPreview(type, id, input);
	}

	async stageFileUpload(
		name: string,
		baseRevision: string,
		subject: string,
		input: { filename: string; bytes: Uint8Array },
	) {
		this.requireDraft(name);
		await this.assertRevision(baseRevision);
		const result = this.uploads.stage({ name, baseRevision, subject }, input.filename, input.bytes);
		await this.audit.append({
			subject,
			action: "resourceDraft.file.stage",
			target: name,
			detail: { upload_id: result.upload_id, filename: result.filename, size: result.size },
		});
		return result;
	}

	cancelFileUpload(name: string, uploadId: string, subject: string) {
		this.requireDraft(name);
		return this.uploads.cancel({ name, subject }, uploadId);
	}

	previewFileUploads(name: string, input: ProjectFileUploadInput, subject: string) {
		this.requireDraft(name);
		const files = this.uploads.resolve({ subject, name, baseRevision: input.base_revision }, input.upload_ids);
		return this.gateway.previewFileUploads(input, files);
	}

	commitFileUploads(name: string, input: ProjectFileUploadInput, subject: string) {
		this.requireDraft(name);
		return this.mutate("files", async () => {
			const claim = this.uploads.claim({ subject, name, baseRevision: input.base_revision }, input.upload_ids);
			let committed = false;
			try {
				const result = await this.gateway.commitFileUploads(input, claim.uploads);
				committed = true;
				this.invalidate();
				await this.audit.append({
					subject,
					action: "resourceDraft.files.commit",
					target: name,
					detail: { revision: result.new_revision, file_keys: result.files.map((file) => file.file_key) },
				});
				return result;
			} finally {
				claim.finish(committed);
			}
		});
	}

	async stageSkillUpload(
		name: string,
		baseRevision: string,
		subject: string,
		input: { filename: string; bytes: Uint8Array },
	) {
		this.requireDraft(name);
		await this.assertRevision(baseRevision);
		const result = await this.skillUploads.stage({ name, baseRevision, subject }, input.filename, input.bytes);
		try {
			await this.assertRevision(baseRevision);
		} catch (error) {
			this.skillUploads.cancel({ name, subject }, result.upload_id);
			throw error;
		}
		await this.audit.append({
			subject,
			action: "resourceDraft.skill.stage",
			target: name,
			detail: { upload_id: result.upload_id, filename: result.filename, size: result.size },
		});
		return result;
	}

	cancelSkillUpload(name: string, uploadId: string, subject: string) {
		this.requireDraft(name);
		return this.skillUploads.cancel({ name, subject }, uploadId);
	}

	previewSkillUploads(name: string, input: ProjectSkillUploadInput, subject: string) {
		this.requireDraft(name);
		const skills = this.skillUploads.resolve({ subject, name, baseRevision: input.base_revision }, input.upload_ids);
		return this.gateway.previewSkillUploads(input, skills);
	}

	commitSkillUploads(name: string, input: ProjectSkillUploadInput, subject: string) {
		this.requireDraft(name);
		return this.mutate("skills", async () => {
			const claim = this.skillUploads.claim({ subject, name, baseRevision: input.base_revision }, input.upload_ids);
			let committed = false;
			try {
				const result = await this.gateway.commitSkillUploads(input, claim.uploads);
				committed = true;
				this.invalidate();
				await this.audit.append({
					subject,
					action: "resourceDraft.skills.commit",
					target: name,
					detail: { revision: result.new_revision, skill_keys: result.skills.map((skill) => skill.skill_key) },
				});
				return result;
			} finally {
				claim.finish(committed);
			}
		});
	}

	declarationPut(
		name: string,
		type: string,
		id: string,
		input: { base_revision: string; declaration: Record<string, unknown> },
		subject: string,
	) {
		this.requireDraft(name);
		return this.mutate("declaration", async () => {
			const result = await this.gateway.putDeclaration(type, id, input);
			await this.audit.append({
				subject,
				action: `resourceDraft.declaration.put:${type}`,
				target: `${name}/${id}`,
				detail: { revision: result.new_revision },
			});
			return result;
		});
	}

	declarationDelete(name: string, type: string, id: string, baseRevision: string, subject: string) {
		this.requireDraft(name);
		return this.mutate("declaration", async () => {
			const result = await this.gateway.deleteDeclaration(type, id, baseRevision);
			await this.audit.append({
				subject,
				action: `resourceDraft.declaration.delete:${type}`,
				target: `${name}/${id}`,
				detail: { revision: result.new_revision },
			});
			return result;
		});
	}

	validate(_name: string) {
		return this.gateway.validate();
	}

	async plan(name: string, subject: string) {
		this.requireDraft(name);
		if (this.activeMutation) throw new KitError("conflict", "批次有正在执行的操作，请完成后重新预览");
		const expected = await this.gateway.plan();
		for (const [key, record] of this.plans) if (record.expiresAt <= Date.now()) this.plans.delete(key);
		const planId = `plan_${randomUUID()}`;
		const { confirmToken, expiresAt } = await this.gate.issue({ planId, action: "resourceDraft.publish", subject });
		this.plans.set(planId, { subject, expiresAt, expected });
		return {
			plan_id: planId,
			confirm_token: confirmToken,
			expires_at: expiresAt,
			destructive: expected.diff.some((entry) => entry.destructive),
			...expected,
		};
	}

	async execute(name: string, body: { plan_id: string; confirm_token: string }, subject: string) {
		this.requireDraft(name);
		const record = this.plans.get(body.plan_id);
		if (!record || record.subject !== subject || record.expiresAt <= Date.now())
			throw new KitError("confirmation_required", "发布计划不存在、已过期或与管理员不匹配");
		const release = this.reserve("publish");
		try {
			await this.assertRevision(record.expected.project_revision);
			await this.gate.consume({
				planId: body.plan_id,
				action: "resourceDraft.publish",
				subject,
				token: body.confirm_token,
			});
			this.plans.delete(body.plan_id);
			const operationId = await this.runner.run({
				kind: "resourceDraft.publish",
				subject,
				fn: async (logger) => {
					try {
						logger.progress(0.1, "executing");
						const result = await this.gateway.execute(record.expected, logger);
						this.invalidate();
						return result;
					} finally {
						release();
					}
				},
			});
			return { operation_id: operationId };
		} catch (error) {
			release();
			throw error;
		}
	}

	private requireDraft(name: string) {
		if (name !== this.id) throw new KitError("not_found", "资源批次不存在");
		return this.id;
	}

	private reserve(action: string) {
		if (this.activeMutation) throw new KitError("conflict", "批次正在修改或发布，请稍后重试");
		this.activeMutation = action;
		this.mutationRevision++;
		return () => {
			this.activeMutation = null;
		};
	}

	private invalidate() {
		this.plans.clear();
	}

	private async mutate<T>(action: string, execute: () => Promise<T>): Promise<T> {
		const release = this.reserve(action);
		try {
			const result = await execute();
			this.invalidate();
			return result;
		} finally {
			release();
		}
	}

	private async assertRevision(expected: string) {
		if ((await this.gateway.overview()).project_revision !== expected)
			throw new KitError("conflict", "批次配置已变化，请重新预览计划");
	}
}
