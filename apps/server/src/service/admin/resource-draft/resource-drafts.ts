import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
	KitError,
	type OperationView,
	type ProjectResourceBinding,
	type ResourceDraftDiscardResult,
	type ResourceDraftView,
} from "@openagentkit/sdk/protocol";
import { Not } from "typeorm";
import type { ServerConfig } from "../../../config.ts";
import { KitResourceDraftDocumentsEntity } from "../../../entity/tables/kit-resource-draft-documents.entity.ts";
import { KitResourceDraftsEntity } from "../../../entity/tables/kit-resource-drafts.entity.ts";
import type { ProjectExecutionPlan, ProviderGateway, ResourceDraftGateway } from "../../../gateway/types.ts";
import { PublicationError } from "../../../publication-error.ts";
import type { ResourceDraftPublishedBinding } from "../../../resource-draft-types.ts";
import { StoreDatabase } from "../../../store/database.ts";
import { KIT_CONFIG, KIT_PROVIDER_GATEWAY } from "../../../utils/injection-tokens.ts";
import { AuditService } from "../../shared/audit.ts";
import { ConfirmGate } from "../../shared/confirm-gate.ts";
import { type OperationLogger, OperationService } from "../../shared/operations.ts";
import { DraftResourceService } from "./draft-resources.ts";
import { DraftRuntime } from "./draft-runtime.ts";
import { ResourceDraftRecovery } from "./recovery/resource-draft-recovery.ts";

interface ResourceDraftRecord {
	draft_id: string;
	owner: string;
	cleanup_key_hash: string | null;
	status: ResourceDraftView["status"];
	phase: "editable" | "executing" | "uncertain" | "succeeded";
	resources_json: string;
	cleanup_pending: number;
	operation_id: string | null;
	expected_revision: string | null;
	created_at: string;
	updated_at: string;
}

function cleanupHash(key?: string) {
	return key ? createHash("sha256").update(key).digest("hex") : null;
}

function failedBeforePublication(error: unknown): boolean {
	if (error instanceof PublicationError) return !error.errorDetails.mutation_started;
	const details = error instanceof KitError ? error.details : undefined;
	return Boolean(
		details &&
			typeof details === "object" &&
			"publication_outcome" in details &&
			details.publication_outcome === "not_started",
	);
}

function completionFailure(phase: "receipt" | "bindings" | "cleanup") {
	return new PublicationError(
		{ code: `publication.${phase}_failed`, phase, retryable: false, mutation_started: true },
		phase === "cleanup"
			? "资源已发布，临时文件清理失败，请重试清理"
			: "资源已发布，成功证明或回执保存失败，已保留批次等待核对",
	);
}

/** 一次性发布批次：声明与 state 仅属于本批次，成功 receipt 永不还原为后续批次的 state。 */
@Injectable()
export class ResourceDraftService {
	private readonly creating;
	private readonly discarding;
	private readonly recovery;
	private readonly runtimes;
	private readonly loadingRuntimes;
	private readonly documents;
	private readonly busy;

	constructor(
		@Inject(KIT_CONFIG) private readonly config: ServerConfig,
		@Inject(KIT_PROVIDER_GATEWAY) private readonly gateway: ProviderGateway,
		@Inject(StoreDatabase) private readonly db: StoreDatabase,
		@Inject(ConfirmGate) private readonly gate: ConfirmGate,
		@Inject(OperationService) private readonly operations: OperationService,
		@Inject(AuditService) private readonly audit: AuditService,
	) {
		this.documents = new Map<string, ResourceDraftGateway>();
		this.recovery = new ResourceDraftRecovery(config.dataDir, db, (id) => this.releaseDocument(id));
		this.runtimes = new Map<string, DraftRuntime>();
		this.loadingRuntimes = new Map<string, Promise<DraftRuntime>>();
		this.creating = new Map<string, Promise<ResourceDraftView>>();
		this.discarding = new Map<string, Promise<ResourceDraftDiscardResult>>();
		this.busy = new Set<string>();
	}

	async canReadOperation(id: string, owner: string) {
		return (await this.operations.get(id))?.kind !== "resourceDraft.publish" || (await this.operations.owns(id, owner));
	}

	getOperation(...args: Parameters<typeof this.operations.get>) {
		return this.operations.get(...args);
	}

	async listOperations(owner: string, options: { sessionId?: string; limit?: number }) {
		const data: OperationView[] = [];
		for (const row of await this.operations.list(options)) {
			if (await this.canReadOperation(row.operation_id, owner)) data.push(row);
		}
		return data;
	}

	subscribeOperation(...args: Parameters<typeof this.operations.subscribe>) {
		return this.operations.subscribe(...args);
	}

	async active(owner: string, cleanupKey?: string) {
		const row = await this.findActiveDraft(owner);
		if (row && cleanupKey) this.requireCleanupOwner(row, cleanupKey);
		return row ? await this.view(row) : null;
	}

	async get(id: string, owner: string) {
		return await this.view(await this.owned(id, owner));
	}

	create(owner: string, cleanupKey?: string) {
		const pending = this.creating.get(owner);
		if (pending)
			return pending.then(async (result) => {
				this.requireCleanupOwner(await this.owned(result.draft_id, owner), cleanupKey);
				return result;
			});
		const task = (async () => {
			let row = await this.findActiveDraft(owner);
			if (row) this.requireCleanupOwner(row, cleanupKey);
			if (row && this.discarding.has(row.draft_id))
				throw new KitError("conflict", "上一个批次正在丢弃，请稍后重新创建");
			if (!row) {
				row = await this.createDraftRecord(owner, cleanupKey);
				await this.audit.append({ subject: owner, action: "resourceDraft.create", target: row.draft_id });
			}
			if (row.phase === "editable") await this.recovery.initialize(row.draft_id);
			return await this.view(row);
		})();
		this.creating.set(owner, task);
		void task.finally(() => this.creating.delete(owner)).catch(() => undefined);
		return task;
	}

	async discard(id: string, owner: string, cleanupKey?: string): Promise<ResourceDraftDiscardResult> {
		const existing = await this.readDraft(id);
		if (!existing) return Promise.resolve({ discarded: false });
		await this.owned(id, owner);
		this.requireCleanupOwner(existing, cleanupKey);
		if (existing.status === "published") return Promise.resolve({ discarded: false });
		await this.assertDiscardable(existing);
		const pending = this.discarding.get(id);
		if (pending) return pending;
		const task = (async () => {
			// 初始化、上传和本地变更可能晚于退出请求完成；封锁新调用后等待它们结束。
			await this.creating.get(owner)?.catch(() => undefined);
			const scoped = await this.runtimeFor(existing);
			await scoped.waitForPending();
			const current = await this.owned(id, owner);
			if (current.status === "published") return { discarded: false };
			await this.assertDiscardable(current);
			return this.exclusive(id, async () => {
				scoped.clearTransientState();
				await this.recovery.clearDocument(id, async () => await this.assertDiscardable(await this.owned(id, owner)));
				await this.deleteEditableDraft(id, owner);
				scoped.retire("discarded");
				this.runtimes.delete(id);
				this.loadingRuntimes.delete(id);
				await this.audit.append({ subject: owner, action: "resourceDraft.discard", target: id });
				return { discarded: true };
			});
		})();
		this.discarding.set(id, task);
		void task.finally(() => this.discarding.delete(id)).catch(() => undefined);
		return task;
	}

	async finalize(id: string, owner: string) {
		const row = await this.owned(id, owner);
		if (row.status === "published" && !row.cleanup_pending) return await this.view(row);
		return this.exclusive(id, async () => {
			const scoped = this.runtimes.get(id)?.gateway ?? this.scopedGateway(row);
			return this.finish(row, scoped);
		});
	}

	async resourcesFor(name: string, owner: string, method: string, tail: string) {
		const row = await this.owned(name, owner);
		this.assertNotDiscarding(name);
		const read = method === "GET" || method === "HEAD";
		if (row.status === "published") {
			if (tail !== "/resource-bindings" || !read)
				throw new KitError("conflict", "此批次已发布并关闭，请创建新的发布批次");
			return { published: { resources: this.storedView(row).resources } };
		}
		if (!read && row.phase !== "editable")
			throw new KitError("conflict", "此批次发布中或结果待核对，不能修改或重新发布");
		await this.recovery.assertSafe(name);
		return (await this.runtimeFor(row)).actions;
	}

	private storedView(row: ResourceDraftRecord): ResourceDraftView {
		return {
			draft_id: row.draft_id,
			project_name: row.draft_id,
			status: row.status,
			resources: (JSON.parse(row.resources_json) as ResourceDraftPublishedBinding[]).filter(
				(resource): resource is ProjectResourceBinding => resource.type !== "skill",
			),
			cleanup_pending: Boolean(row.cleanup_pending),
			recovery_action:
				row.status === "published"
					? row.cleanup_pending
						? "finalize"
						: "none"
					: row.phase === "editable"
						? "replan"
						: "read_result",
			...(row.operation_id ? { operation_id: row.operation_id } : {}),
			created_at: row.created_at,
			updated_at: row.updated_at,
		};
	}

	private async view(row: ResourceDraftRecord): Promise<ResourceDraftView> {
		const result = this.storedView(row);
		if (row.phase === "uncertain" && (await this.recovery.hasSuccessProof(row))) result.recovery_action = "finalize";
		return result;
	}

	private scopedGateway(row: ResourceDraftRecord): ResourceDraftGateway {
		let document = this.documents.get(row.draft_id);
		if (!document) {
			document = this.gateway.resourceDraftDocument(row.draft_id, this.recovery.assetRoot(row.draft_id), {
				read: async () => {
					const value = await this.recovery.readDocument(row.draft_id);
					if (!value) throw new KitError("conflict", "发布批次声明已清理");
					return value;
				},
				write: async (revision, yaml, assets) => await this.updateDocument(row.draft_id, revision, yaml, assets),
				writeState: async (state) => await this.saveSdkState(row.draft_id, state),
			});
			this.documents.set(row.draft_id, document);
		}
		return document;
	}

	private async owned(id: string, owner: string) {
		const row = await this.readDraft(id);
		if (!row || row.owner !== owner) throw new KitError("not_found", "资源发布批次不存在");
		return row;
	}

	private async createDraftRecord(owner: string, key?: string) {
		return await this.insertDraft(`draft_${randomUUID().replaceAll("-", "")}`, owner, cleanupHash(key) ?? undefined);
	}

	private requireCleanupOwner(row: ResourceDraftRecord, key?: string) {
		// 未登记凭证的旧 API 批次仅接受旧客户端显式操作，不能被新页面自动接管。
		if (row.cleanup_key_hash !== cleanupHash(key))
			throw new KitError("conflict", "已有资源批次属于另一浏览器或页面，请先从原入口退出并完成清理。", {
				details: { reason: "draft_owned_elsewhere" },
			});
	}

	private async assertDiscardable(row: ResourceDraftRecord) {
		const operation = row.operation_id ? await this.operations.get(row.operation_id) : null;
		if (row.phase !== "editable" || (operation && !["succeeded", "failed"].includes(operation.status)))
			throw new KitError("conflict", "此批次已开始发布或发布结果待核对，不能丢弃", {
				details: { reason: "publication_unresolved" },
			});
	}

	private assertNotDiscarding(id: string) {
		if (this.discarding.has(id)) throw new KitError("conflict", "此批次正在丢弃，请稍后重试");
	}

	private async exclusive<T>(id: string, task: () => Promise<T>) {
		if (this.busy.has(id)) throw new KitError("conflict", "此批次正在发布或清理，请稍后重试");
		this.busy.add(id);
		try {
			return await task();
		} finally {
			this.busy.delete(id);
		}
	}

	private releaseDocument(id: string) {
		this.documents.get(id)?.clearSecrets();
		this.documents.delete(id);
	}

	private releaseDraft(id: string) {
		this.releaseDocument(id);
		this.runtimes.get(id)?.retire();
		this.runtimes.delete(id);
		this.loadingRuntimes.delete(id);
	}

	private async finish(
		row: ResourceDraftRecord,
		scoped: ResourceDraftGateway,
		onPhase?: (phase: "bindings" | "receipt" | "cleanup") => void,
	) {
		if (row.status !== "published") await this.recovery.recordReceipt(row, scoped, onPhase);
		try {
			onPhase?.("cleanup");
			await this.recovery.cleanPublished((await this.readDraft(row.draft_id))!, scoped);
		} finally {
			// 回执已持久化后批次不可再编辑；磁盘清理重试也不需要保留上传字节或旧计划。
			this.releaseDraft(row.draft_id);
		}
		return await this.view((await this.readDraft(row.draft_id))!);
	}

	private async publish(
		id: string,
		scoped: ResourceDraftGateway,
		expected: ProjectExecutionPlan,
		logger?: OperationLogger,
	) {
		return this.exclusive(id, async () => {
			const row = (await this.readDraft(id))!;
			if (row.phase !== "editable") throw new KitError("conflict", "发布结果待核对，不能再次发布");
			await this.assertReferencedSkills(scoped);
			const required = (await scoped.declarations()).map(({ type, id }) => ({ type, id }));
			if (!required.length) throw new KitError("invalid_request", "此批次没有需要发布的资源");
			await this.beginPublication(id, expected.project_revision);
			let remoteSucceeded = false;
			let phase: "receipt" | "bindings" | "cleanup" = "receipt";
			try {
				const result = await scoped.execute(expected, logger);
				remoteSucceeded = true;
				await this.recovery.writeProof({
					draft_id: id,
					owner: row.owner,
					project_revision: expected.project_revision,
					required,
				});
				logger?.progress(0.85, "saving_receipt");
				await this.finish((await this.readDraft(id))!, scoped, (value) => {
					phase = value;
				});
				return result;
			} catch (error) {
				await this.failPublication(id, !remoteSucceeded && failedBeforePublication(error));
				if (remoteSucceeded && !(error instanceof PublicationError)) throw completionFailure(phase);
				throw error;
			}
		});
	}

	private async assertReferencedSkills(scoped: ResourceDraftGateway) {
		const validation = await scoped.validate();
		if (validation.warnings?.includes("project.skill.unreferenced"))
			throw new KitError("invalid_request", "请先将本批次上传的 Skill 加入智能体，再发布本批次");
	}

	private async loadRuntime(row: ResourceDraftRecord) {
		const existing = this.runtimes.get(row.draft_id);
		if (existing) return existing;
		if ((await this.readDraft(row.draft_id))?.status === "published")
			throw new KitError("conflict", "此批次已发布并关闭，请创建新的发布批次");
		const scoped = this.scopedGateway(row);
		const lifecycleGateway: ResourceDraftGateway = {
			...scoped,
			execute: (expected, logger) => this.publish(row.draft_id, scoped, expected, logger),
		};
		const scopedRunner: Pick<OperationService, "run"> = {
			run: (input) =>
				this.operations.run({ ...input, onCreated: async (id) => await this.attachOperation(row.draft_id, id) }),
		};
		const service = new DraftResourceService({
			id: row.draft_id,
			gateway: lifecycleGateway,
			remote: this.gateway,
			gate: this.gate,
			runner: scopedRunner,
			audit: this.audit,
			uploadMaxBytes: this.config.uploadMaxBytes,
		});
		const entry = new DraftRuntime(
			() => this.getDraftStatus(row.draft_id),
			scoped,
			service,
			() => this.assertNotDiscarding(row.draft_id),
		);
		this.runtimes.set(row.draft_id, entry);
		return entry;
	}

	private runtimeFor(row: ResourceDraftRecord) {
		const existing = this.loadingRuntimes.get(row.draft_id);
		if (existing) return existing;
		const pending = this.loadRuntime(row);
		this.loadingRuntimes.set(row.draft_id, pending);
		void pending.catch(() => this.loadingRuntimes.delete(row.draft_id));
		return pending;
	}

	private async getDraftStatus(id: string) {
		const row = await this.db.read((manager) =>
			manager.findOne(KitResourceDraftsEntity, { where: { draft_id: id }, select: { status: true } }),
		);
		return row?.status;
	}

	private async readDraft(id: string): Promise<ResourceDraftRecord | null> {
		return (await this.db.read((manager) =>
			manager.findOneBy(KitResourceDraftsEntity, { draft_id: id }),
		)) as ResourceDraftRecord | null;
	}
	private async findActiveDraft(owner: string): Promise<ResourceDraftRecord | null> {
		return (await this.db.read((manager) =>
			manager.findOneBy(KitResourceDraftsEntity, [
				{ owner, status: Not("published") },
				{ owner, cleanup_pending: 1 },
			]),
		)) as ResourceDraftRecord | null;
	}
	private async insertDraft(id: string, owner: string, cleanupKeyHash?: string) {
		const now = new Date().toISOString();
		await this.db.write((manager) =>
			manager.insert(KitResourceDraftsEntity, {
				draft_id: id,
				owner,
				cleanup_key_hash: cleanupKeyHash ?? null,
				status: "draft",
				phase: "editable",
				created_at: now,
				updated_at: now,
				engine: "yaml",
			}),
		);
		return (await this.readDraft(id))!;
	}
	private async attachOperation(id: string, operationId: string) {
		await this.db.write((manager) =>
			manager.update(
				KitResourceDraftsEntity,
				{ draft_id: id },
				{ operation_id: operationId, updated_at: new Date().toISOString() },
			),
		);
	}
	private async updateDocument(id: string, expected: string, yaml: string, assets?: string) {
		return this.db.transaction(async () => {
			const result = await this.db.write((manager) => {
				const editable = manager
					.createQueryBuilder(KitResourceDraftsEntity, "draft")
					.select("1")
					.where("draft.draft_id = :id AND draft.phase = :phase AND draft.status <> :published");
				return manager
					.createQueryBuilder()
					.update(KitResourceDraftDocumentsEntity)
					.set({ yaml, ...(assets !== undefined ? { assets_json: assets } : {}), revision: () => "revision + 1" })
					.where("draft_id = :id AND TRIM(CAST(revision AS CHAR(32))) = :expected", { id, expected })
					.andWhere(`EXISTS (${editable.getQuery()})`, { phase: "editable", published: "published" })
					.execute();
			});
			if (!result.affected) throw new KitError("conflict", "批次配置已变化，请重新加载");
			return String((await this.recovery.readDocument(id))!.revision);
		});
	}
	private async saveSdkState(id: string, state: string) {
		const result = await this.db.write((manager) =>
			manager.update(KitResourceDraftDocumentsEntity, { draft_id: id }, { sdk_state_json: state }),
		);
		if (!result.affected) throw new KitError("conflict", "发布批次已关闭");
	}
	private async beginPublication(id: string, revision: string) {
		const result = await this.db.write((manager) =>
			manager.update(
				KitResourceDraftsEntity,
				{ draft_id: id, phase: "editable", status: Not("published") },
				{ status: "publishing", phase: "executing", expected_revision: revision, updated_at: new Date().toISOString() },
			),
		);
		if (!result.affected) throw new KitError("conflict", "此发布批次已完成或结果待核对，不能再次发布");
	}
	private async failPublication(id: string, retryable: boolean) {
		await this.db.write((manager) =>
			manager.update(
				KitResourceDraftsEntity,
				{ draft_id: id, status: Not("published") },
				{ status: "failed", phase: retryable ? "editable" : "uncertain", updated_at: new Date().toISOString() },
			),
		);
	}
	private async deleteEditableDraft(id: string, owner: string) {
		const result = await this.db.write((manager) =>
			manager.delete(KitResourceDraftsEntity, { draft_id: id, owner, phase: "editable", status: Not("published") }),
		);
		if (!result.affected) throw new KitError("conflict", "批次状态已变化，不能丢弃");
	}
}
