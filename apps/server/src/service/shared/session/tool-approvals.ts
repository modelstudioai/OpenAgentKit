import { KitError, type ToolApprovalDecision, type ToolApprovalsResponse } from "@openagentkit/sdk/protocol";
import { GatewaySendRejectedError } from "../../../gateway/send-error.ts";
import type { ProviderGateway } from "../../../gateway/types.ts";
import type { EventBufferRegistry } from "../../../utils/event-buffer.ts";
import type { SessionHistoryService } from "./session-history.ts";

function approvalKey(sessionId: string, batchId: string, callId: string) {
	return JSON.stringify([sessionId, batchId, callId]);
}

/** 单进程审批互斥与结果不明保护；事件正文仍只在内存且以 Provider 为权威。 */
export class ToolApprovalService {
	private readonly active;
	private readonly submitted;
	private readonly gateway: ProviderGateway;
	private readonly admit?: (
		sessionId: string,
		decision: ToolApprovalDecision,
		send: () => Promise<{ event_ids: string[] }>,
	) => Promise<{ event_ids: string[] }>;
	private readonly buffers: EventBufferRegistry;

	constructor(
		gateway: ProviderGateway,
		private readonly history: SessionHistoryService,
		buffers: EventBufferRegistry,
		admit?: (
			sessionId: string,
			decision: ToolApprovalDecision,
			send: () => Promise<{ event_ids: string[] }>,
		) => Promise<{ event_ids: string[] }>,
	) {
		this.gateway = gateway;
		this.buffers = buffers;
		this.admit = admit;
		this.active = new Set<string>();
		this.submitted = new Map<string, "submitted" | "uncertain">();
	}

	list(sessionId: string) {
		return this.state(sessionId, true);
	}

	async respond(sessionId: string, decision: ToolApprovalDecision) {
		const key = approvalKey(sessionId, decision.batch_id, decision.call_id);
		if (this.active.has(key) || this.submitted.has(key))
			throw new KitError("conflict", "审批已提交或正在确认结果，请刷新");
		this.active.add(key);
		try {
			const current = await this.state(sessionId, true);
			const request = current.requests.find(
				(item) => item.batch_id === decision.batch_id && item.call_id === decision.call_id,
			);
			if (
				!current.requires_action ||
				current.batch_id !== decision.batch_id ||
				!current.pending_call_ids.includes(decision.call_id) ||
				!request?.actionable
			) {
				throw new KitError("conflict", "审批已过期、已处理或暂不支持，请刷新");
			}
			const send = async () => {
				try {
					const result = await this.gateway.respondToolApproval(sessionId, {
						...decision,
						...(request.session_thread_id ? { session_thread_id: request.session_thread_id } : {}),
					});
					this.submitted.set(key, "submitted");
					return result;
				} catch (error) {
					if (error instanceof GatewaySendRejectedError) throw error;
					this.submitted.set(key, "uncertain");
					throw new KitError("provider_error", "审批结果尚不确定，请先刷新查询；不会自动重发", { retryable: false });
				}
			};
			return await (this.admit ? this.admit(sessionId, decision, send) : send());
		} finally {
			this.active.delete(key);
		}
	}

	private clearInactive(sessionId: string, current: ToolApprovalsResponse) {
		for (const key of this.submitted.keys()) {
			const [owner, batch, call] = JSON.parse(key) as [string, string, string];
			if (owner === sessionId && (batch !== current.batch_id || !current.pending_call_ids.includes(call)))
				this.submitted.delete(key);
		}
	}

	private async state(sessionId: string, refresh: boolean): Promise<ToolApprovalsResponse> {
		const { approvals: current } = await this.history.readApprovalSnapshot(sessionId, this.buffers);
		this.clearInactive(sessionId, current);
		for (const request of current.requests) {
			const key = approvalKey(sessionId, request.batch_id, request.call_id);
			const status = this.submitted.get(key);
			// 明确刷新后仍 pending 的不确定请求，可由用户再次打开确认框决定；禁止后台自动重发。
			if (refresh && status === "uncertain") this.submitted.delete(key);
			else if (status) {
				request.status = status;
				request.actionable = false;
			}
		}
		return current;
	}
}
