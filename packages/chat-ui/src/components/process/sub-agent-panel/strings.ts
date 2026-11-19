import type { KitStringTable } from "../../kit-i18n/index.ts";

/** SubAgentPanel 文案键；与卡头状态同词汇，但弹窗独立成典便于 copy-in 单独覆盖。 */
export interface SubAgentPanelStrings {
	label: string;
	dotCount: string;
	statusRunning: string;
	statusError: string;
	failed: string;
	running: string;
	runningElapsed: string;
	completed: string;
	completedWithDuration: string;
	close: string;
	mainTaskPrefix: string;
	noTask: string;
}

const subAgentPanelStrings: KitStringTable<SubAgentPanelStrings> = {
	"zh-CN": {
		label: "子 Agent",
		dotCount: "· {{count}}",
		statusRunning: "执行中",
		statusError: "出错",
		failed: "执行出错",
		running: "正在执行",
		runningElapsed: "正在执行 {{elapsed}}",
		completed: "已完成",
		completedWithDuration: "已完成 · {{duration}}",
		close: "关闭",
		mainTaskPrefix: "主 Agent 指令：",
		noTask: "未记录任务",
	},
	en: {
		label: "Sub-agents",
		dotCount: "· {{count}}",
		statusRunning: "Running",
		statusError: "Error",
		failed: "Execution failed",
		running: "Running",
		runningElapsed: "Running for {{elapsed}}",
		completed: "Completed",
		completedWithDuration: "Completed · {{duration}}",
		close: "Close",
		mainTaskPrefix: "Main agent instruction: ",
		noTask: "No task recorded",
	},
};

export default subAgentPanelStrings;
export { subAgentPanelStrings };
