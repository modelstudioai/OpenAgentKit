import type { KitStringTable } from "../../kit-i18n/index.ts";

/** SubAgentCard 文案键；ThreadEventStates 被右栏弹窗复用，同读这份词典。 */
export interface SubAgentCardStrings {
	failed: string;
	completed: string;
	completedWithDuration: string;
	running: string;
	runningElapsed: string;
	dotPrefix: string;
	loadFailed: string;
	retry: string;
	loadingMessages: string;
	noMessages: string;
	currentConnectionOnly: string;
	loadEarlier: string;
	mainTaskPrefix: string;
	aria: string;
	label: string;
	taskSuffix: string;
}

const subAgentCardStrings: KitStringTable<SubAgentCardStrings> = {
	"zh-CN": {
		failed: "执行出错",
		completed: "已完成",
		completedWithDuration: "已完成 · {{duration}}",
		running: "正在执行",
		runningElapsed: "正在执行 {{elapsed}}",
		dotPrefix: "· {{label}}",
		loadFailed: "消息加载失败：{{message}}",
		retry: "重试",
		loadingMessages: "正在加载 Agent 消息…",
		noMessages: "此 Agent 暂无消息",
		currentConnectionOnly: "仅显示本次连接收到的消息",
		loadEarlier: "加载更早消息",
		mainTaskPrefix: "主 Agent 指令：",
		aria: "子 Agent {{name}}",
		label: "子 Agent",
		taskSuffix: " · {{task}}",
	},
	en: {
		failed: "Execution failed",
		completed: "Completed",
		completedWithDuration: "Completed · {{duration}}",
		running: "Running",
		runningElapsed: "Running for {{elapsed}}",
		dotPrefix: "· {{label}}",
		loadFailed: "Failed to load messages: {{message}}",
		retry: "Retry",
		loadingMessages: "Loading agent messages…",
		noMessages: "This agent has no messages yet",
		currentConnectionOnly: "Only messages received in this connection are shown",
		loadEarlier: "Load earlier messages",
		mainTaskPrefix: "Main agent instruction: ",
		aria: "Sub-agent {{name}}",
		label: "Sub-agent",
		taskSuffix: " · {{task}}",
	},
};

export default subAgentCardStrings;
export { subAgentCardStrings };
