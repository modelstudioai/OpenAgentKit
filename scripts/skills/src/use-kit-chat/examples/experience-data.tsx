import { useAgentResources } from "@openagentkit/sdk/agents/hooks";
import { useChat } from "@openagentkit/sdk/chat/hooks";
import type { ChatProvider } from "@openagentkit/sdk/providers";
import type { KitClient } from "@openagentkit/sdk/providers/kit";
import { useSessionDetails } from "@openagentkit/sdk/sessions/hooks";
import { useUsageLimits } from "@openagentkit/sdk/usage/hooks";

// 数据 Hook 支持显式 Client，也可通过 Context 兼容接入。
export function AgentResourceSummary({ slug }: { slug: string | null }) {
	const resources = useAgentResources(slug);
	return (
		<div>
			<p>{resources?.skills?.map((skill) => skill.name).join("、") || "暂无技能信息"}</p>
			<p>{resources?.memory_stores?.map((store) => store.name).join("、") || "暂无记忆库"}</p>
		</div>
	);
}

export function MemberLimitSummary() {
	const limits = useUsageLimits({ days: 30 });
	if (limits.loading) return <p role="status">正在加载限额…</p>;
	if (limits.error) return <p role="alert">{String(limits.error)}</p>;
	if (!limits.data) return <p>当前身份不是 Kit 本地成员</p>;
	return (
		<button type="button" onClick={() => void limits.reload()}>
			刷新用量限制
		</button>
	);
}

// 文件关联记录来自应用元数据。
export function ChatWithFileMetadata({
	client,
	sessionId,
	provider,
}: {
	client: KitClient;
	sessionId: string;
	provider: ChatProvider;
}) {
	const chat = useChat({ sessionId, provider });
	const details = useSessionDetails({ client, sessionId, setMessageFiles: chat.setMessageFiles });
	return details.error ? <p role="alert">{details.error}</p> : <p>{chat.messages.length} 条消息</p>;
}

export async function readUploadStatus(client: KitClient, fileId: string) {
	const status = await client.fileStatus(fileId);
	// 文件就绪前保留草稿，服务端也会校验文件状态和归属。
	return { ready: status.available, status: status.status };
}
