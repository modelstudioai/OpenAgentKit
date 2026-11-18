import { ToolApprovalCard } from "@openagentpack/kit-chat-ui";
import type { ChatToolApproval } from "@openagentpack/kit-sdk/chat";
import type { ToolApprovalDecision } from "@openagentpack/kit-sdk/protocol";

export interface ApprovalCardProps {
	approval: ChatToolApproval;
	submitApproval: (decision: ToolApprovalDecision) => Promise<void>;
	refreshApprovals: () => Promise<void>;
	stop: () => void;
}

// 直接展示一项待审批请求，单击允许或拒绝即可提交。
// 有多项审批时使用 ToolApprovalGroup。
export function ApprovalCard({ approval, submitApproval, refreshApprovals, stop }: ApprovalCardProps) {
	return (
		<ToolApprovalCard approval={approval} onDecision={submitApproval} onRefresh={refreshApprovals} onStop={stop} />
	);
}
