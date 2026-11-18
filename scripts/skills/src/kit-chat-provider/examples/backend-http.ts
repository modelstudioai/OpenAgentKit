import { KitError, SendMessageResponseSchema, ToolApprovalsResponseSchema } from "@openagentpack/kit-sdk/protocol";
import type { SessionEventChatProviderOptions } from "@openagentpack/kit-sdk/providers/session-events";
import { createRequest } from "@openagentpack/kit-sdk/request";

export interface BackendConfig {
	// 显式传入运行时配置，后端可以与页面不同源。
	baseUrl: string;
	// 只提供应用身份，Provider 凭据保留在后端。
	getAppToken: () => Promise<string>;
}

export function record(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new KitError("provider_error", "后端返回的对象无效。");
	return value as Record<string, unknown>;
}

export async function readJson(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		throw new KitError("provider_error", "后端返回了无效的 JSON。");
	}
}

async function result(response: Response): Promise<unknown> {
	const envelope = record(await readJson(response));
	if (!("result" in envelope)) throw new KitError("provider_error", "后端响应缺少 result。");
	return envelope.result;
}

// 以下路由和 { result } 包装由示例业务后端定义。
export function createBackendHttp(config: BackendConfig) {
	const request = createRequest({
		baseUrl: config.baseUrl,
		headers: async () => ({ Authorization: `Bearer ${await config.getAppToken()}` }),
	});
	const sessionPath = (id: string) => `/sessions/${encodeURIComponent(id)}`;
	const operations: Pick<
		SessionEventChatProviderOptions,
		"sendMessage" | "interrupt" | "toolApprovals" | "submitToolApproval"
	> = {
		sendMessage: {
			buildRequest({ sessionId, body }) {
				if (body.attachments?.length) throw new KitError("invalid_request", "请在创建会话时挂载已上传的文件。");
				return {
					path: `${sessionPath(sessionId)}/messages`,
					init: {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ input: body.text, request_id: body.client_message_id }),
					},
				};
			},
			async mapResponse(response) {
				const parsed = SendMessageResponseSchema.safeParse(await result(response));
				if (!parsed.success) throw new KitError("provider_error", "后端返回的消息发送结果无效。");
				return parsed.data;
			},
		},
		interrupt: {
			buildRequest: ({ sessionId }) => ({ path: `${sessionPath(sessionId)}/interrupt`, init: { method: "POST" } }),
			async mapResponse(response) {
				const value = record(await result(response));
				if (typeof value.interrupted !== "boolean") throw new KitError("provider_error", "后端返回的中断结果无效。");
				return { interrupted: value.interrupted };
			},
		},
		toolApprovals: {
			buildRequest: ({ sessionId }) => ({ path: `${sessionPath(sessionId)}/approvals` }),
			async mapResponse(response) {
				const parsed = ToolApprovalsResponseSchema.safeParse(await result(response));
				if (!parsed.success) throw new KitError("provider_error", "后端返回的工具审批列表无效。");
				return parsed.data;
			},
		},
		submitToolApproval: {
			buildRequest: ({ sessionId, decision }) => ({
				path: `${sessionPath(sessionId)}/approvals`,
				init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(decision) },
			}),
			async mapResponse(response) {
				const parsed = SendMessageResponseSchema.safeParse(await result(response));
				if (!parsed.success) throw new KitError("provider_error", "后端返回的工具审批结果无效。");
				return parsed.data;
			},
		},
	};

	return { request, sessionPath, operations };
}
