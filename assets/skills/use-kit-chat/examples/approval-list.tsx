import type { UseChatResult } from "@openagentkit/sdk/chat/hooks";
import { ToolApprovalCard } from "@openagentpack/kit-chat-ui";

export function ApprovalList({ chat }: { chat: UseChatResult }) {
	return (
		<section aria-label="工具审批">
			{chat.approvals.map((approval) => (
				<ToolApprovalCard
					key={JSON.stringify([approval.batch_id, approval.call_id])}
					approval={approval}
					onDecision={chat.submitApproval}
					onRefresh={chat.refreshApprovals}
				/>
			))}
		</section>
	);
}
