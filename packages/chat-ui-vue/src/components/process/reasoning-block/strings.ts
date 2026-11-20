import type { KitStringTable } from "../../kit-i18n/index.ts";

export interface ReasoningBlockStrings {
	streaming: string;
	done: string;
	failed: string;
	interrupted: string;
	aria: string;
	title: string;
}

const reasoningBlockStrings: KitStringTable<ReasoningBlockStrings> = {
	"zh-CN": {
		streaming: "思考中",
		done: "已思考",
		failed: "思考失败",
		interrupted: "已中断",
		aria: "思考过程",
		title: "思考过程",
	},
	en: {
		streaming: "Thinking",
		done: "Thought",
		failed: "Thinking failed",
		interrupted: "Interrupted",
		aria: "Reasoning",
		title: "Reasoning",
	},
};

export default reasoningBlockStrings;
export { reasoningBlockStrings };
