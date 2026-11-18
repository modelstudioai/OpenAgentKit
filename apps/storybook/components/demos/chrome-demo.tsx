"use client";

import { EmptyState, ErrorState, StatusIndicator } from "@openagentpack/kit-chat-ui";

/** 状态由连接状态和 Turn 阶段共同决定。 */
export function StatusDemo() {
	return (
		<div
			data-kit-appearance="workspace"
			className="flex flex-1 flex-col gap-3 bg-[var(--kit-bg)] p-4 text-[var(--kit-fg)]"
		>
			<StatusIndicator variant="badge" connected turnRunning={false} error={null} />
			<StatusIndicator variant="badge" connected turnRunning error={null} />
			<StatusIndicator variant="badge" connected={false} turnRunning={false} connection="connecting" />
			<StatusIndicator variant="badge" connected={false} turnRunning connection="reconnecting" />
			<StatusIndicator variant="badge" connected turnRunning phase="requires_action" />
			<StatusIndicator variant="badge" connected turnRunning phase="stopping" />
			<StatusIndicator
				variant="badge"
				connected
				turnRunning={false}
				error={{ code: "provider_error", message: "Provider 502（已脱敏透传）" }}
			/>
		</div>
	);
}

/** 空态与错误态：目录为空、请求失败时的两种占位。 */
export function StatesDemo() {
	return (
		<div className="flex flex-1 flex-col gap-4 p-4">
			<EmptyState title="还没有上架的 Agent" hint="到管理端完成 publish 与上架后，这里就会出现可对话的角色。" />
			<ErrorState message="拉取目录失败：HTTP 502" onRetry={() => undefined} />
		</div>
	);
}
