import type { KitStringTable } from "../kit-i18n/index.ts";

/** SessionList 文案键；status 键与中性展示标记一一对应（协议词汇在组件内收敛）。 */
export interface SessionListStrings {
	status: {
		running: string;
		attention: string;
		failed: string;
		completed: string;
	};
	archived: string;
	renameAria: string;
	aria: string;
	empty: string;
}

const sessionListStrings: KitStringTable<SessionListStrings> = {
	"zh-CN": {
		status: { running: "生成中", attention: "等待审批", failed: "执行失败", completed: "已完成" },
		archived: "已归档",
		renameAria: "重命名会话",
		aria: "会话列表",
		empty: "暂无会话",
	},
	en: {
		status: {
			running: "Generating",
			attention: "Awaiting approval",
			failed: "Execution failed",
			completed: "Completed",
		},
		archived: "Archived",
		renameAria: "Rename session",
		aria: "Session list",
		empty: "No sessions yet",
	},
};

export default sessionListStrings;
export { sessionListStrings };
