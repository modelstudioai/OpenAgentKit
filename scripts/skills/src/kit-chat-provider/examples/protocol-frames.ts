import type { SseFrame } from "@openagentkit/sdk/protocol";
import { streamProtocolFrames } from "@openagentkit/sdk/providers/kit";
import type { RequestClient } from "@openagentkit/sdk/request";

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
