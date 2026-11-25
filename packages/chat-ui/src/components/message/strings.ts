import type { KitStringTable } from "../kit-i18n/index.ts";

/** Message 文案键。消息时间戳维持拍板格式，不进词典。 */
export interface MessageStrings {
	sending: string;
	sendFailed: string;
	generationFailed: string;
	interrupted: string;
	unrecognizedPrefix: string;
	serializeFallback: string;
	actionsAriaLabel: string;
}

const messageStrings: KitStringTable<MessageStrings> = {
	"zh-CN": {
		sending: "发送中…",
		sendFailed: "发送失败",
		generationFailed: "生成失败",
		interrupted: "已中断",
		unrecognizedPrefix: "未识别内容：",
		serializeFallback: "内容无法序列化",
		actionsAriaLabel: "消息操作",
	},
	en: {
		sending: "Sending…",
		sendFailed: "Send failed",
		generationFailed: "Generation failed",
		interrupted: "Interrupted",
		unrecognizedPrefix: "Unrecognized content: ",
		serializeFallback: "Content could not be serialized",
		actionsAriaLabel: "Message actions",
	},
};

export default messageStrings;
export { messageStrings };
