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
