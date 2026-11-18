# 可编译示例

本页由随附的示例源文件生成。请按应用需求调整回调和运行时配置。

## backend-data.ts

[源文件](../examples/backend-data.ts)

```ts
import { type ClientOperations, createKitClient } from "@openagentpack/kit-sdk/providers/kit";
import type { RequestClient } from "@openagentpack/kit-sdk/request";

// 只配置后端支持的功能。未配置的操作不会调用 Kit 路由。
export function createDataClient(request: RequestClient) {
	const result = async <T>(response: Response): Promise<T> => (await response.json()).result;
	const json = (value: unknown) => ({
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(value),
	});
	const operations: ClientOperations = {
		agents: { buildRequest: () => ({ path: "/catalog" }), mapResponse: result },
		agent: { buildRequest: ([slug]) => ({ path: `/catalog/${encodeURIComponent(slug)}` }), mapResponse: result },
		sessionAgents: { buildRequest: () => ({ path: "/conversation-groups" }), mapResponse: result },
		sessions: {
			buildRequest: ([query]) => ({ path: "/conversations/search", init: json(query ?? {}) }),
			mapResponse: result,
		},
		session: { buildRequest: ([id]) => ({ path: `/conversations/${encodeURIComponent(id)}` }), mapResponse: result },
		createSession: { buildRequest: ([input]) => ({ path: "/conversations", init: json(input) }), mapResponse: result },
		renameSession: {
			buildRequest: ([id, title]) => ({
				path: `/conversations/${encodeURIComponent(id)}/title`,
				init: json({ title }),
			}),
			mapResponse: result,
		},
		sessionPlan: {
			buildRequest: ([id, action]) => ({
				path: `/conversations/${encodeURIComponent(id)}/preview`,
				init: json({ action }),
			}),
			mapResponse: result,
		},
		archiveSession: {
			buildRequest: ([id, confirmation]) => ({
				path: `/conversations/${encodeURIComponent(id)}/archive`,
				init: json(confirmation),
			}),
			mapResponse: result,
		},
		deleteSession: {
			buildRequest: ([id, confirmation]) => ({
				path: `/conversations/${encodeURIComponent(id)}/remove`,
				init: json(confirmation),
			}),
			mapResponse: result,
		},
		uploadFile: {
			buildRequest: ([file]) => {
				const form = new FormData();
				form.append("attachment", new Blob([file.bytes as BlobPart], { type: file.mimeType }), file.name);
				return { path: "/attachments", init: { method: "POST", body: form } };
			},
			mapResponse: result,
		},
		fileStatus: {
			buildRequest: ([id]) => ({ path: `/attachments/${encodeURIComponent(id)}/status` }),
			mapResponse: result,
		},
		downloadFile: {
			buildRequest: ([id, input]) => ({
				path: `/attachments/${encodeURIComponent(id)}/content?conversation=${encodeURIComponent(input?.sessionId ?? "")}`,
			}),
			mapResponse: (response) => response,
		},
		usageLimits: { buildRequest: () => ({ path: "/account/limits" }), mapResponse: result },
	};
	return createKitClient({ request, operations });
}
```

## backend-http.ts

[源文件](../examples/backend-http.ts)

```ts
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
```

## kit-client-provider.ts

[源文件](../examples/kit-client-provider.ts)

```ts
import type { ChatProvider } from "@openagentpack/kit-sdk/providers";
import { createKitChatProvider, type KitClient } from "@openagentpack/kit-sdk/providers/kit";

// 兼容已经持有完整 KitClient 的应用。
export function wrapExistingKitClient(client: KitClient): ChatProvider {
	return createKitChatProvider(client);
}
```

## message-transform.ts

[源文件](../examples/message-transform.ts)

```ts
import { type MessageTransformer, transformSessionEvent } from "@openagentpack/kit-sdk/messages";
import type { ChatProvider } from "@openagentpack/kit-sdk/providers";

// 幂等替换展示标签，后续事件重建线程时可重复调用，原始 SessionEvent 与生命周期保持原样。
const replaceDisplayLabel: MessageTransformer = (input) => {
	const result = transformSessionEvent(input);
	return {
		...result,
		messages: result.messages.map((message) => ({
			...message,
			parts: message.parts.map((part) =>
				part.type === "text" ? { ...part, text: part.text.replaceAll("[[agent-name]]", "客服助手") } : part,
			),
		})),
	};
};

// 每次后端绑定只创建一次包装，返回的消息由 Chat 持有。
export function withDisplayLabel(provider: ChatProvider): ChatProvider {
	// 在原始实例上转发所有方法，包括类的原型方法。
	return {
		transformMessage: replaceDisplayLabel,
		stream: (sessionId, options) => provider.stream(sessionId, options),
		sendMessage: (sessionId, body) => provider.sendMessage(sessionId, body),
		interrupt: (sessionId) => provider.interrupt(sessionId),
		toolApprovals: (sessionId) => provider.toolApprovals(sessionId),
		submitToolApproval: (sessionId, decision) => provider.submitToolApproval(sessionId, decision),
	};
}
```

## multi-agent.tsx

[源文件](../examples/multi-agent.tsx)

```tsx
import { Chat } from "@openagentpack/kit-chat-ui";
import { useChat } from "@openagentpack/kit-sdk/chat/hooks";
import type { ChatProvider } from "@openagentpack/kit-sdk/providers";
import {
	type BailianChatProviderOptions,
	createBailianChatProvider,
	createBailianThreadOperations,
} from "@openagentpack/kit-sdk/providers/bailian";
import { useState } from "react";

// 标准事件后端使用公开 DTO 实现这两个可选操作。
// 每页事件从旧到新排列，next_page_token 指向更早的历史。
export function withNormalizedThreads(
	provider: ChatProvider,
	queries: Required<Pick<ChatProvider, "listThreads" | "listThreadEvents">>,
): ChatProvider {
	return { ...provider, ...queries };
}

// 后端代理两条百炼标准 REST 路径及 { data, next_page } 响应。
// 应用鉴权由 options.request 提供，Provider 凭据保留在服务端。
export function withBailianThreads(options: BailianChatProviderOptions) {
	return createBailianChatProvider({
		...options,
		...createBailianThreadOperations({ basePath: "/api/v1/agentstudio" }),
	});
}

// 两种 Provider 均可直接使用同一个 Chat，无需 KitProvider 或 Kit Server。
// 传入稳定的 Provider 实例，写入失败时向调用方报告错误。
export function MultiAgentChat({ sessionId, provider }: { sessionId: string; provider: ChatProvider }) {
	const chat = useChat({ sessionId, provider });
	const [error, setError] = useState<string | null>(null);
	return (
		<>
			{(error || chat.streamError) && <p role="alert">{error ?? chat.streamError?.message}</p>}
			<Chat
				messages={chat.messages}
				multiAgent={chat.multiAgent}
				scrollKey={sessionId}
				turnRunning={chat.turnRunning}
				canSend={chat.canSend}
				onSend={async (text) => {
					setError(null);
					try {
						await chat.send(text);
					} catch (cause) {
						setError(cause instanceof Error ? cause.message : "发送失败，已保留草稿。");
						throw cause;
					}
				}}
				onStop={chat.stop}
			/>
		</>
	);
}
```

## normalized-provider.ts

[源文件](../examples/normalized-provider.ts)

```ts
import { PROTOCOL_VERSION, PROTOCOL_VERSION_HEADER } from "@openagentpack/kit-sdk/protocol";
import type { ChatProvider } from "@openagentpack/kit-sdk/providers";
import { createSessionEventChatProvider } from "@openagentpack/kit-sdk/providers/session-events";
import { type BackendConfig, createBackendHttp } from "./backend-http.ts";

// Web 应用复用此公开工厂，配置自己的路径和 { data } 映射。
// 此示例使用 /sessions、{ result } 和应用鉴权，遵循公开的 SessionEvent 和控制帧协议。
export function createNormalizedProvider(config: BackendConfig): ChatProvider {
	const backend = createBackendHttp(config);
	return createSessionEventChatProvider({
		request: backend.request,
		...backend.operations,
		stream: {
			buildRequest({ sessionId, after }) {
				const query = new URLSearchParams();
				if (after) query.set("after", after);
				const suffix = query.size ? `?${query}` : "";
				return {
					path: `${backend.sessionPath(sessionId)}/events/stream${suffix}`,
					init: {
						headers: {
							Accept: "text/event-stream",
							[PROTOCOL_VERSION_HEADER]: PROTOCOL_VERSION,
						},
					},
				};
			},
		},
	});
}
```

## protocol-frames.ts

[源文件](../examples/protocol-frames.ts)

```ts
import type { SseFrame } from "@openagentpack/kit-sdk/protocol";
import { streamProtocolFrames } from "@openagentpack/kit-sdk/providers/kit";
import type { RequestClient } from "@openagentpack/kit-sdk/request";

/** Request 已配置后端 base URL 及所需的身份与协议版本头。 */
export async function observeProtocolFrames(
	request: RequestClient,
	path: string,
	signal: AbortSignal,
	onFrame: (frame: SseFrame) => void,
) {
	await streamProtocolFrames(request, path, {
		signal,
		onFrame,
		init: { method: "GET" },
		idleTimeoutMs: 45_000,
	});
	// done 表示本次订阅结束，Agent 执行结果由业务事件确定。
	// 意外 EOF、协议错误帧和空闲超时会使调用失败。
}
```

## raw-bailian-provider.ts

[源文件](../examples/raw-bailian-provider.ts)

```ts
import { KitError } from "@openagentpack/kit-sdk/protocol";
import { createBailianChatProvider } from "@openagentpack/kit-sdk/providers/bailian";
import { type BackendConfig, createBackendHttp, readJson, record } from "./backend-http.ts";

export function createRawBailianProvider(config: BackendConfig) {
	const backend = createBackendHttp(config);
	return createBailianChatProvider({
		request: backend.request,
		...backend.operations,
		openStream: {
			buildRequest: ({ sessionId }) => ({
				path: `${backend.sessionPath(sessionId)}/stream`,
				init: { headers: { Accept: "text/event-stream" } },
			}),
			mapResponse(response) {
				// 后端先建立上游订阅，再发送此响应头。
				// 跨域时通过 Access-Control-Expose-Headers 暴露此头。
				if (response.headers.get("x-upstream-ready") !== "true")
					throw new KitError("conflict", "后端未确认上游订阅就绪。");
				// 立即返回响应体与就绪 Promise，由工厂读取并等待。
				return { response, ready: Promise.resolve() };
			},
		},
		listEvents: {
			buildRequest({ sessionId, pageToken }) {
				const query = new URLSearchParams({ order: "asc" });
				if (pageToken) query.set("page_token", pageToken);
				return { path: `${backend.sessionPath(sessionId)}/events?${query}` };
			},
			async mapResponse(response) {
				const page = record(await readJson(response));
				if (!Array.isArray(page.data)) throw new KitError("provider_error", "后端返回的历史分页无效。");
				const next = page.next_page_token;
				if (next !== undefined && next !== null && typeof next !== "string")
					throw new KitError("provider_error", "后端返回的历史游标无效。");
				return {
					// 保留完整原始对象，包括事件标识及执行状态。
					events: page.data.map(record),
					nextPageToken: next,
				};
			},
		},
	});
}
```

## request.ts

[源文件](../examples/request.ts)

```ts
import { createRequest, type RequestClient } from "@openagentpack/kit-sdk/request";
import type { RawSseMessage } from "@openagentpack/kit-sdk/stream";

export function createApplicationRequest(baseUrl: string, getAppToken: () => Promise<string>): RequestClient {
	return createRequest({
		baseUrl,
		headers: async () => ({ Authorization: `Bearer ${await getAppToken()}` }),
	});
}

// 以下为示例业务路由。
export async function readStatus(request: RequestClient, signal: AbortSignal) {
	return request.json<{ available: boolean }>("/status", { signal });
}

export async function observeUpdates(
	request: RequestClient,
	signal: AbortSignal,
	onFrame: (frame: RawSseMessage) => void,
) {
	for await (const frame of request.stream(
		"/updates",
		{ signal, headers: { Accept: "text/event-stream" } },
		{ utf8Fatal: true },
	)) {
		onFrame(frame);
	}
}
```

## sse-stream.ts

[源文件](../examples/sse-stream.ts)

```ts
import { createSseStream, type RawSseMessage } from "@openagentpack/kit-sdk/stream";

// 调用方传入已持有的响应体。
export async function consumeSse(
	body: ReadableStream<Uint8Array>,
	signal: AbortSignal,
	onFrame: (frame: RawSseMessage) => void,
) {
	for await (const frame of createSseStream(body, { signal, utf8Fatal: true, maxFrameChars: 1024 * 1024 })) {
		// data 保持为字符串，Provider 负责解析 JSON 和判断业务语义。
		onFrame(frame);
	}
	// EOF 结束迭代，Agent 执行结果由业务事件确定。
}
```
