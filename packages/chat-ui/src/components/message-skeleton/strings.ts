import type { KitStringTable } from "../kit-i18n/index.ts";

export interface MessageListSkeletonStrings {
	loading: string;
}

const messageListSkeletonStrings: KitStringTable<MessageListSkeletonStrings> = {
	"zh-CN": { loading: "加载会话中…" },
	en: { loading: "Loading session…" },
};

export default messageListSkeletonStrings;
export { messageListSkeletonStrings };
