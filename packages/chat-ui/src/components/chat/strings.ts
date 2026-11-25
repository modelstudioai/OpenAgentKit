import type { KitStringTable } from "../kit-i18n/index.ts";

export interface ChatStrings {
	sending: string;
	awaitingApproval: string;
}

const chatStrings: KitStringTable<ChatStrings> = {
	"zh-CN": { sending: "发送中…", awaitingApproval: "等待审批" },
	en: { sending: "Sending…", awaitingApproval: "Awaiting approval" },
};

export default chatStrings;
export { chatStrings };
