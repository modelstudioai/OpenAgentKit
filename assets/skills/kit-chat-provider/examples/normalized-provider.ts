import { PROTOCOL_VERSION, PROTOCOL_VERSION_HEADER } from "@openagentkit/sdk/protocol";
import type { ChatProvider } from "@openagentkit/sdk/providers";
import { createSessionEventChatProvider } from "@openagentkit/sdk/providers/session-events";
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
