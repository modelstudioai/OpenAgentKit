import type { KitStringTable } from "../kit-i18n/index.ts";

/** ToolApprovalCard 文案键；status 与 ChatToolApproval 状态机一一对应。 */
export interface ToolApprovalCardStrings {
	noParams: string;
	paramError: string;
	status: {
		pending: string;
		submitting: string;
		submitted: string;
		uncertain: string;
		stale: string;
	};
	deny: string;
	allow: string;
	submitting: string;
	stop: string;
	refreshing: string;
	refresh: string;
	viewParams: string;
	submitFailed: string;
	refreshFailed: string;
	aria: string;
	request: string;
	unknownTool: string;
	unknownType: string;
	notActionable: string;
}

const toolApprovalCardStrings: KitStringTable<ToolApprovalCardStrings> = {
	"zh-CN": {
		noParams: "未提供参数",
		paramError: "参数无法显示",
		status: {
			pending: "等待审批",
			submitting: "正在提交…",
			submitted: "已提交，等待执行状态",
			uncertain: "提交结果不明，请先刷新确认",
			stale: "审批已失效或已处理",
		},
		deny: "拒绝",
		allow: "允许",
		submitting: "正在提交…",
		stop: "停止执行",
		refreshing: "正在刷新…",
		refresh: "刷新审批状态",
		viewParams: "查看参数",
		submitFailed: "审批提交失败，请刷新状态",
		refreshFailed: "刷新失败，请重试",
		aria: "工具审批 {{name}}",
		request: "Agent 请求执行工具 {{name}}",
		unknownTool: "未知工具",
		unknownType: "未知类型",
		notActionable: "审批请求信息不完整或类型不受支持，仅供查看。请刷新状态或停止执行。",
	},
	en: {
		noParams: "No parameters provided",
		paramError: "Parameters could not be displayed",
		status: {
			pending: "Awaiting approval",
			submitting: "Submitting…",
			submitted: "Submitted, awaiting execution status",
			uncertain: "Submission result unknown; refresh to confirm",
			stale: "Approval expired or already handled",
		},
		deny: "Deny",
		allow: "Allow",
		submitting: "Submitting…",
		stop: "Stop execution",
		refreshing: "Refreshing…",
		refresh: "Refresh approval status",
		viewParams: "View parameters",
		submitFailed: "Approval submission failed; refresh the status",
		refreshFailed: "Refresh failed; try again",
		aria: "Tool approval {{name}}",
		request: "Agent requests to run tool {{name}}",
		unknownTool: "unknown tool",
		unknownType: "unknown type",
		notActionable:
			"The approval request is incomplete or its type is unsupported; view only. Refresh the status or stop the execution.",
	},
};

export default toolApprovalCardStrings;
export { toolApprovalCardStrings };
