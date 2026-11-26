import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
	type ApplyRequest,
	type CreateTemplateDebugSessionRequest,
	type DebugSessionDetail,
	KitError,
	type PlanResponse,
	type SendMessageRequest,
	type ToolApprovalDecision,
} from "@openagentkit/sdk/protocol";
import type { ProviderGateway } from "../../gateway/types.ts";
import { KIT_PROVIDER_GATEWAY } from "../../utils/injection-tokens.ts";
import { AuditService } from "../shared/audit.ts";
import { CatalogResourceService } from "../shared/catalog-resources.ts";
import { ConfirmGate } from "../shared/confirm-gate.ts";
import { SessionIndexService } from "../shared/session/session-index.ts";
import { SessionService } from "../shared/session/sessions.ts";

/** 管理员调试只增加用途与目标归属；执行、事件、审批和文件仍走共享服务。 */
@Injectable()
export class DebugService {
	constructor(
		@Inject(SessionService) private readonly sessions: SessionService,
		@Inject(SessionIndexService) private readonly sessionIndex: SessionIndexService,
		@Inject(KIT_PROVIDER_GATEWAY) private readonly gateway: ProviderGateway,
		@Inject(CatalogResourceService) private readonly resources: CatalogResourceService,
		@Inject(ConfirmGate) private readonly gate: ConfirmGate,
		@Inject(AuditService) private readonly audit: AuditService,
	) {}

	async requireSession(subject: string, sessionId: string) {
		const row = await this.sessionIndex.getDebugForSubject(sessionId, subject);
		if (!row) throw new KitError("not_found", "调试会话不存在");
		return row;
	}

	async createTemplate(subject: string, input: CreateTemplateDebugSessionRequest): Promise<DebugSessionDetail> {
		const [agents, environments] = await Promise.all([
			this.gateway.listRemoteAgents(),
			input.remote_environment_id ? this.gateway.listRemoteEnvironments() : Promise.resolve([]),
		]);
		if (!agents.some((agent) => agent.agent_id === input.remote_agent_id))
			throw new KitError("invalid_request", "所选智能体不存在，请返回选择配置重新选择");
		if (
			input.remote_environment_id &&
			!environments.some((environment) => environment.environment_id === input.remote_environment_id)
		)
			throw new KitError("invalid_request", "所选环境不存在，请返回选择配置重新选择");
		// 这里选择管理员可见的远端资源，并不改变上传归属或授予直接下载权限。
		const resources = await this.resources.prepare(input);
		const info = await this.sessions.create({
			subjectId: subject,
			purpose: "admin_debug",
			debug: {
				source: "template",
				remote_agent_id: input.remote_agent_id,
				agent_version: input.agent_version,
				...(input.remote_environment_id ? { remote_environment_id: input.remote_environment_id } : {}),
				memory_stores: resources.memory_stores,
				vault_ids: resources.vault_ids,
			},
			title: input.title,
			files: resources.files,
		});
		const row = await this.requireSession(subject, info.session_id);
		await this.audit.append({ subject, action: "debug.session.create", target: info.session_id, detail: row.summary });
		return { ...row.summary, files: row.files, ...row.runtime };
	}

	async detail(subject: string, sessionId: string): Promise<DebugSessionDetail> {
		const row = await this.requireSession(subject, sessionId);
		const remote = await this.gateway.getSession(sessionId);
		return {
			...row.summary,
			files: row.files,
			...row.runtime,
			...(remote?.status ? { remote_status: remote.status } : {}),
		};
	}

	async authorizeStream(subject: string, sessionId: string) {
		await this.requireSession(subject, sessionId);
		await this.audit.append({ subject, action: "debug.session.stream", target: sessionId });
	}

	openStream(sessionId: string, options: Parameters<SessionService["openStream"]>[1]) {
		return this.sessions.openStream(sessionId, options);
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

	async events(subject: string, sessionId: string, options: Parameters<SessionService["events"]>[1]) {
		await this.requireSession(subject, sessionId);
		const page = await this.sessions.events(sessionId, options);
		await this.audit.append({ subject, action: "debug.session.events", target: sessionId });
		return page;
	}

	async send(subject: string, sessionId: string, input: SendMessageRequest) {
		await this.requireSession(subject, sessionId);
		if (input.attachments?.length)
			throw new KitError("invalid_request", "附件只能在新建调试会话时挂载，请先上传文件，再新建会话");
		// 管理员调试不调用员工 quota.chargeTurn；共享服务仍等待订阅就绪并拒绝未处理审批。
		const result = await this.sessions.send(sessionId, {
			text: input.text,
			clientMessageId: input.client_message_id,
			...(input.skills?.length ? { skills: input.skills } : {}),
		});
		await this.audit.append({ subject, action: "debug.session.send", target: sessionId });
		return { session_id: sessionId, accepted: true as const, event_ids: result.event_ids };
	}

	async interrupt(subject: string, sessionId: string) {
		await this.requireSession(subject, sessionId);
		await this.sessions.interrupt(sessionId);
		await this.audit.append({ subject, action: "debug.session.interrupt", target: sessionId });
		return { interrupted: true };
	}

	async approvals(subject: string, sessionId: string) {
		await this.requireSession(subject, sessionId);
		return this.sessions.toolApprovals(sessionId);
	}

	async approve(subject: string, sessionId: string, input: ToolApprovalDecision) {
		await this.requireSession(subject, sessionId);
		const result = await this.sessions.respondToolApproval(sessionId, input);
		await this.audit.append({
			subject,
			action: "debug.session.tool_approval",
			target: sessionId,
			detail: { batch_id: input.batch_id, call_id: input.call_id, result: input.result },
		});
		return { session_id: sessionId, accepted: true as const, event_ids: result.event_ids };
	}

	async planDelete(subject: string, sessionId: string): Promise<PlanResponse> {
		await this.requireSession(subject, sessionId);
		const planId = `debug_delete_${randomUUID()}`;
		const issued = await this.gate.issue({ planId, subject, action: `debug.session.delete:${sessionId}` });
		return {
			plan_id: planId,
			confirm_token: issued.confirmToken,
			expires_at: issued.expiresAt,
			destructive: true,
			diff: [
				{
					resource: `session:${sessionId}`,
					action: "delete",
					destructive: true,
					summary: "删除此调试会话及其本地索引，不修改 Agent 或上架目录",
				},
			],
		};
	}

	async remove(subject: string, sessionId: string, confirmation: ApplyRequest) {
		await this.requireSession(subject, sessionId);
		await this.gate.consume({
			planId: confirmation.plan_id,
			token: confirmation.confirm_token,
			subject,
			action: `debug.session.delete:${sessionId}`,
		});
		await this.gateway.deleteSession(sessionId);
		await this.sessionIndex.remove(sessionId);
		await this.audit.append({ subject, action: "debug.session.delete", target: sessionId });
		return { deleted: true };
	}
}
