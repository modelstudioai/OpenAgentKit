import type { KitStringTable } from "../kit-i18n/index.ts";

/** StatusIndicator 文案键；连接/执行状态词与 SDK 状态枚举一一对应。 */
export interface StatusIndicatorStrings {
	idle: string;
	running: string;
	requiresAction: string;
	stopping: string;
	failed: string;
	interrupted: string;
	connecting: string;
	reconnecting: string;
	error: string;
	errorPrefix: string;
}

const statusIndicatorStrings: KitStringTable<StatusIndicatorStrings> = {
	"zh-CN": {
		idle: "空闲",
		running: "生成中…",
		requiresAction: "等待审批",
		stopping: "正在停止…",
		failed: "执行失败",
		interrupted: "已中断",
		connecting: "连接中…",
		reconnecting: "重连中…",
		error: "连接异常",
		errorPrefix: "连接异常：",
	},
	en: {
		idle: "Idle",
		running: "Generating…",
		requiresAction: "Awaiting approval",
		stopping: "Stopping…",
		failed: "Execution failed",
		interrupted: "Interrupted",
		connecting: "Connecting…",
		reconnecting: "Reconnecting…",
		error: "Connection error",
		errorPrefix: "Connection error: ",
	},
};

export default statusIndicatorStrings;
export { statusIndicatorStrings };
