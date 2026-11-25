import type { KitStringTable } from "../kit-i18n/index.ts";

export interface ToolApprovalGroupStrings {
	previous: string;
	next: string;
}

const toolApprovalGroupStrings: KitStringTable<ToolApprovalGroupStrings> = {
	"zh-CN": { previous: "上一个审批", next: "下一个审批" },
	en: { previous: "Previous approval", next: "Next approval" },
};

export default toolApprovalGroupStrings;
export { toolApprovalGroupStrings };
