import { ToolApprovalGroup } from "@openagentpack/kit-chat-ui";
import type { ChatToolApproval } from "@openagentpack/kit-sdk/chat";
import type { ToolApprovalDecision } from "@openagentpack/kit-sdk/protocol";

export interface ApprovalListProps {
	approvals: ChatToolApproval[];
	submitApproval: (decision: ToolApprovalDecision) => Promise<void>;
	refreshApprovals: () => Promise<void>;
	stop: () => void;
}

// 传入 useChat 的 approvals、submitApproval、refreshApprovals 和 stop。
// 单击允许或拒绝即可提交。多项待审批请求横向分页，每次展示一张卡片。
// 审批有效性由后端校验。
export function ApprovalList({ approvals, submitApproval, refreshApprovals, stop }: ApprovalListProps) {
	if (approvals.length === 0) return null;
	return (
		<ToolApprovalGroup approvals={approvals} onDecision={submitApproval} onRefresh={refreshApprovals} onStop={stop} />
	);
}
