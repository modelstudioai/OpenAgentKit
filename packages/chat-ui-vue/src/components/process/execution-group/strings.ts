import type { KitStringTable } from "../../kit-i18n/index.ts";

export interface ExecutionGroupStrings {
	running: string;
	failed: string;
	done: string;
	aria: string;
	steps: string;
}

const executionGroupStrings: KitStringTable<ExecutionGroupStrings> = {
	"zh-CN": { running: "正在执行", failed: "执行出错", done: "已执行", aria: "执行过程", steps: "{{count}} 步" },
	en: {
		running: "Running",
		failed: "Execution failed",
		done: "Executed",
		aria: "Execution details",
		steps: "{{count}} steps",
	},
};

export default executionGroupStrings;
export { executionGroupStrings };
