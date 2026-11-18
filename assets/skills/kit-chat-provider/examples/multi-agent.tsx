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
