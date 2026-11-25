import type { KitStringTable } from "../kit-i18n/index.ts";

export interface MessageAnchorRailStrings {
	toolsCount: string;
	attachmentMessage: string;
	newTurn: string;
	railAria: string;
	turnAria: string;
}

const messageAnchorRailStrings: KitStringTable<MessageAnchorRailStrings> = {
	"zh-CN": {
		toolsCount: "执行工具 {{count}} 次",
		attachmentMessage: "附件消息",
		newTurn: "新回合",
		railAria: "会话锚点",
		turnAria: "第 {{index}} 回合：{{label}}",
	},
	en: {
		toolsCount: "Used {{count}} tools",
		attachmentMessage: "Attachment message",
		newTurn: "New turn",
		railAria: "Turn anchors",
		turnAria: "Turn {{index}}: {{label}}",
	},
};

export default messageAnchorRailStrings;
export { messageAnchorRailStrings };
