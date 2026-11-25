import type { KitStringTable } from "../kit-i18n/index.ts";

/** MessageList 文案键。pending 指示文案归 ProcessingIndicator 自己的词典。 */
export interface MessageListStrings {
	threadIntro: string;
	backToBottom: string;
	listAriaLabel: string;
}

const messageListStrings: KitStringTable<MessageListStrings> = {
	"zh-CN": {
		threadIntro: "以下子 Agent 来自线程列表",
		backToBottom: "回到底部",
		listAriaLabel: "消息列表",
	},
	en: {
		threadIntro: "The sub-agents below come from the thread list",
		backToBottom: "Back to bottom",
		listAriaLabel: "Message list",
	},
};

export default messageListStrings;
export { messageListStrings };
