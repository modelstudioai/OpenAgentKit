import type { KitStringTable } from "../kit-i18n/index.ts";

/** Sender 文案键。新增键必须同时补 en 值，`pnpm check:i18n` 双向对齐强制。 */
export interface SenderStrings {
	send: string;
	stop: string;
	clear: string;
	inputLabel: string;
	collapseLabel: string;
	placeholderEnter: string;
	placeholderShiftEnter: string;
	placeholderPlain: string;
}

const senderStrings: KitStringTable<SenderStrings> = {
	"zh-CN": {
		send: "发送",
		stop: "停止",
		clear: "清空",
		inputLabel: "消息输入",
		collapseLabel: "收起",
		placeholderEnter: "输入消息，Enter 发送，Shift+Enter 换行",
		placeholderShiftEnter: "输入消息，Shift+Enter 发送，Enter 换行",
		placeholderPlain: "输入消息",
	},
	en: {
		send: "Send",
		stop: "Stop",
		clear: "Clear",
		inputLabel: "Message",
		collapseLabel: "Collapse",
		placeholderEnter: "Send a message. Enter sends, Shift+Enter adds a new line",
		placeholderShiftEnter: "Send a message. Shift+Enter sends, Enter adds a new line",
		placeholderPlain: "Send a message",
	},
};

export default senderStrings;
export { senderStrings };
