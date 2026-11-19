import { usePlaza } from "@openagentkit/sdk/agents/hooks";
import { useKitClient } from "@openagentkit/sdk/providers/kit/react";
import { useQuota, useQuotaRequests } from "@openagentkit/sdk/usage/hooks";
import { useState } from "react";

// 与默认会话页挂载在同一个 KitProvider 内。
// 这些 Hook 使用 KitClient，显式 ChatProvider 只接管对话操作。
export function DiscoveryAndUsage() {
	const client = useKitClient();
	const plaza = usePlaza({ category: "general" });
	const usage = useQuota();
	const history = useQuotaRequests();
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function requestCredits() {
		if (pending) return;
		setPending(true);
		setError(null);
		try {
			await client.createQuotaRequest({ requestedCredits: 100, reason: "项目新增工作需要更多额度" });
			usage.reload();
			history.reload();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "请求失败");
		} finally {
			setPending(false);
		}
	}

	return (
		<section>
			<h2>可用 Agent</h2>
			{plaza.error ? <p role="alert">{plaza.error}</p> : null}
			<ul>
				{plaza.view?.agents.map((agent) => (
					<li key={agent.slug}>{agent.display_name}</li>
				))}
			</ul>
			<h2>月度用量</h2>
			{usage.error ? <p role="alert">{usage.error}</p> : null}
			<p>{usage.quota ? `已用 ${usage.quota.used} Credits` : "正在加载用量"}</p>
			<button
				type="button"
				disabled={pending || usage.loading || !usage.quota || Boolean(usage.quota.pending_request)}
				onClick={() => void requestCredits()}
			>
				申请 100 Credits
			</button>
			{error ? <p role="alert">{error}</p> : null}
			<ul>
				{history.requests.map((request) => (
					<li key={request.id}>{request.status}</li>
				))}
			</ul>
		</section>
	);
}
