import type { KitStringTable } from "../kit-i18n/index.ts";

/** Actions 文案键；en 与 zh-CN 对齐由 pnpm check:i18n 守护。 */
export interface ActionsStrings {
	listAriaLabel: string;
	copy: string;
	copying: string;
	copied: string;
	copyFailed: string;
	copyFailedRetry: string;
	feedbackAriaLabel: string;
	like: string;
	dislike: string;
}

const actionsStrings: KitStringTable<ActionsStrings> = {
	"zh-CN": {
		listAriaLabel: "操作列表",
		copy: "复制",
		copying: "复制中…",
		copied: "已复制",
		copyFailed: "复制失败",
		copyFailedRetry: "复制失败，请重试",
		feedbackAriaLabel: "回答反馈",
		like: "点赞",
		dislike: "点踩",
	},
	en: {
		listAriaLabel: "Actions",
		copy: "Copy",
		copying: "Copying…",
		copied: "Copied",
		copyFailed: "Copy failed",
		copyFailedRetry: "Copy failed, please retry",
		feedbackAriaLabel: "Answer feedback",
		like: "Helpful",
		dislike: "Not helpful",
	},
};

export default actionsStrings;
export { actionsStrings };
