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
