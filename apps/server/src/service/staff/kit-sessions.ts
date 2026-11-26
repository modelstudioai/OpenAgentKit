import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
	type ApplyRequest,
	type AttachmentRef,
	type CreateSessionRequest,
	KitError,
	type SendMessageRequest,
	type ToolApprovalDecision,
} from "@openagentkit/sdk/protocol";
import type { ProviderGateway } from "../../gateway/types.ts";
import { KIT_PROVIDER_GATEWAY } from "../../utils/injection-tokens.ts";
import { AuditService } from "../shared/audit.ts";
import { CatalogResourceService } from "../shared/catalog-resources.ts";
import { ConfirmGate } from "../shared/confirm-gate.ts";
import { FileService } from "../shared/session/files.ts";
import type { SessionDirectoryQuery } from "../shared/session/session-index.ts";
import { SessionIndexService } from "../shared/session/session-index.ts";
import { SessionService } from "../shared/session/sessions.ts";
import { QuotaService } from "../shared/usage/quota.ts";
import { UsageLimitService } from "../shared/usage/usage-limits.ts";
import { StaffCatalogService } from "./catalog.ts";

type SessionAction = "archive" | "delete";

function sessionPlanPrefix(sessionId: string, action: SessionAction) {
	return `sessplan_${sessionId}_${action}_`;
}

/** 员工端会话用例，复用共享运行时并约束体验会话归属。 */
@Injectable()
export class KitSessionService {
	constructor(
		@Inject(AuditService) private readonly audit: AuditService,
		@Inject(StaffCatalogService) private readonly catalog: StaffCatalogService,
		@Inject(FileService) private readonly files: FileService,
		@Inject(ConfirmGate) private readonly gate: ConfirmGate,
		@Inject(KIT_PROVIDER_GATEWAY) private readonly gateway: ProviderGateway,
		@Inject(QuotaService) private readonly quota: QuotaService,
		@Inject(SessionIndexService) private readonly sessionIndex: SessionIndexService,
		@Inject(SessionService) private readonly sessions: SessionService,
		@Inject(UsageLimitService) private readonly usageLimits: UsageLimitService,
		@Inject(CatalogResourceService) private readonly catalogResources: CatalogResourceService,
	) {}

	listAgents(subject: string) {
		return this.sessions.listAgents(subject);
	}

	async events(subject: string, sessionId: string, options: Parameters<SessionService["events"]>[1]) {
		const row = await this.requireSession(subject, sessionId);
		return this.sessions.events(row.session_id, options);
	}

	async threads(subject: string, sessionId: string, options: Parameters<SessionService["threads"]>[1]) {
		const row = await this.requireSession(subject, sessionId);
		return this.sessions.threads(row.session_id, options);
	}

	async threadEvents(
		subject: string,
		sessionId: string,
		threadId: string,
		options: Parameters<SessionService["threadEvents"]>[2],
	) {
		const row = await this.requireSession(subject, sessionId);
		return this.sessions.threadEvents(row.session_id, threadId, options);
	}

	openStream(sessionId: string, options: Parameters<SessionService["openStream"]>[1]) {
		return this.sessions.openStream(sessionId, options);
	}

	async requireSession(subject: string, sessionId: string) {
		const row = await this.sessionIndex.getForSubject(sessionId, subject);
		if (!row) throw new KitError("not_found", "会话不存在");
		return row;
	}

	async create(subject: string, input: CreateSessionRequest) {
		const { catalog, files, sessions } = this;
		const entry = await catalog.requirePublished(input.agent_slug);
		await files.requireUploads(subject, input.files ?? []);
		const sessionFiles = this.mergeSessionFiles(entry.files ?? [], input.files ?? []);
		const info = await sessions.create({
			subjectId: subject,
			agentSlug: entry.slug,
			remoteAgentId: entry.remote_agent_id,
			...(entry.agent_version != null ? { remoteAgentVersion: entry.agent_version } : {}),
			memoryStores: entry.memory_stores,
			vaultIds: entry.vault_ids,
			...(entry.remote_environment_id ? { remoteEnvironmentId: entry.remote_environment_id } : {}),
			...(input.title ? { title: input.title } : {}),
			...(sessionFiles.length ? { files: sessionFiles } : {}),
		});
		return {
			session_id: info.session_id,
			agent_slug: entry.slug,
			status: info.status,
			created_at: new Date().toISOString(),
			...(info.files?.length ? { files: info.files } : {}),
		};
	}

	/** 只接受服务端读取的目录文件；调用前必须独立校验所有成员附件的本人归属。 */
	private mergeSessionFiles(catalogFiles: AttachmentRef[], memberFiles: AttachmentRef[]): AttachmentRef[] {
		const merged = new Map(catalogFiles.map((file) => [file.file_id, file]));
		for (const file of memberFiles) {
			if (merged.has(file.file_id)) continue;
			const path = file.mount_path?.trim();
			merged.set(
				file.file_id,
				path?.startsWith("/") ? { ...file, mount_path: this.catalogResources.explicitMountPath(path) } : file,
			);
		}
		if (merged.size > 10) throw new KitError("invalid_request", "目录文件与本次附件合计不能超过 10 个");
		// 目录挂载在前保留配置路径；成员同名文件由既有路径解析加后缀，不覆盖目录文件。
		return [...merged.values()];
	}

	async detail(subject: string, sessionId: string) {
		const row = await this.requireSession(subject, sessionId);
		const remote = await this.gateway.getSession(row.session_id);
		return {
			...row.summary,
			...(remote?.status ? { remote_status: remote.status } : {}),
			...(remote?.usage ? { usage: remote.usage } : {}),
			...(remote?.stats ? { stats: remote.stats } : {}),
			...(row.files.length ? { files: row.files } : {}),
			...(row.messageFiles.length ? { message_files: row.messageFiles } : {}),
		};
	}

	async artifacts(subject: string, sessionId: string) {
		const row = await this.requireSession(subject, sessionId);
		return this.gateway.listSessionFiles(row.session_id);
	}

	async rename(subject: string, sessionId: string, title: string) {
		const { sessionIndex } = this;
		const row = await this.requireSession(subject, sessionId);
		await sessionIndex.setTitle(row.session_id, title);
		const updated = await sessionIndex.get(row.session_id);
		if (!updated) throw new KitError("not_found", "会话不存在");
		return updated.summary;
	}

	async listPage(subject: string, query: Omit<SessionDirectoryQuery, "agentSlugs">) {
		const agentSlugs = query.q ? await this.catalog.matchingSlugs(query.q) : undefined;
		return this.sessions.listPage(subject, { ...query, agentSlugs });
	}

	async send(subject: string, sessionId: string, input: SendMessageRequest) {
		const { files, quota, sessions, usageLimits } = this;
		const row = await this.requireSession(subject, sessionId);
		// 附件归属在挂载前校验，挂载、发送与失败回滚由共享会话服务完成。
		if (input.attachments?.length) await files.requireUploads(subject, input.attachments);
		const result = await sessions.send(
			row.session_id,
			{
				text: input.text,
				...(input.client_message_id ? { clientMessageId: input.client_message_id } : {}),
				...(input.skills?.length ? { skills: input.skills } : {}),
				...(input.attachments?.length ? { attachments: input.attachments } : {}),
			},
			async () => {
				// 本地成员使用月度限额，匿名和外部身份继续使用 Credits 政策。
				await quota.chargeTurn({
					enforceLimit: !(await usageLimits.isMember(subject)),
					subjectId: subject,
					agentSlug: row.agent_slug,
					sessionId: row.session_id,
					...(input.client_message_id ? { clientMessageId: input.client_message_id } : {}),
				});
			},
		);
		return { session_id: row.session_id, accepted: true, event_ids: result.event_ids };
	}

	async interrupt(subject: string, sessionId: string) {
		const row = await this.requireSession(subject, sessionId);
		await this.sessions.interrupt(row.session_id);
		return { interrupted: true };
	}

	async plan(subject: string, sessionId: string, action: SessionAction) {
		await this.requireSession(subject, sessionId);
		const planId = sessionPlanPrefix(sessionId, action) + randomUUID().slice(0, 8);
		const issued = await this.gate.issue({ planId, action: `session.${action}`, subject });
		return {
			plan_id: planId,
			confirm_token: issued.confirmToken,
			destructive: true,
			expires_at: issued.expiresAt,
			diff: [{ resource: `session:${sessionId}`, action, destructive: true }],
		};
	}

	async apply(subject: string, sessionId: string, action: SessionAction, input: ApplyRequest) {
		const { audit, gate, sessions } = this;
		await this.requireSession(subject, sessionId);
		if (
			input.plan_id.slice(0, -8) !== sessionPlanPrefix(sessionId, action) ||
			!/^[0-9a-f]{8}$/.test(input.plan_id.slice(-8))
		) {
			throw new KitError("confirmation_required", "确认计划不适用于当前会话操作");
		}
		const name = `session.${action}`;
		await gate.consume({ planId: input.plan_id, action: name, subject, token: input.confirm_token });
		await sessions[action](sessionId);
		await audit.append({ subject, action: name, target: sessionId });
		return action === "archive" ? { archived: true } : { deleted: true };
	}

	async approvals(subject: string, sessionId: string) {
		const row = await this.requireSession(subject, sessionId);
		return this.sessions.toolApprovals(row.session_id);
	}

	async approve(subject: string, sessionId: string, decision: ToolApprovalDecision) {
		const { audit, sessions } = this;
		const row = await this.requireSession(subject, sessionId);
		const result = await sessions.respondToolApproval(row.session_id, decision);
		await audit.append({
			subject,
			action: "session.tool_approval",
			target: row.session_id,
			detail: { batch_id: decision.batch_id, call_id: decision.call_id, result: decision.result },
		});
		return { session_id: row.session_id, accepted: true, event_ids: result.event_ids };
	}
}
