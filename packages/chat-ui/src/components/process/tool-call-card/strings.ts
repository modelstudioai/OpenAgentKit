import type { KitStringTable } from "../../kit-i18n/index.ts";

export interface ToolCallCardStrings {
	serializeFallback: string;
	status: {
		running: string;
		done: string;
		error: string;
	};
	aria: string;
	inputParams: string;
	result: string;
	noDetail: string;
}

const toolCallCardStrings: KitStringTable<ToolCallCardStrings> = {
	"zh-CN": {
		serializeFallback: "内容无法序列化",
		status: { running: "执行中", done: "已完成", error: "执行失败" },
		aria: "工具调用 {{name}}",
		inputParams: "输入参数",
		result: "执行结果",
		noDetail: "暂无调用详情",
	},
	en: {
		serializeFallback: "Content could not be serialized",
		status: { running: "Running", done: "Completed", error: "Execution failed" },
		aria: "Tool call {{name}}",
		inputParams: "Input parameters",
		result: "Result",
		noDetail: "No call details",
	},
};

export default toolCallCardStrings;
export { toolCallCardStrings };
