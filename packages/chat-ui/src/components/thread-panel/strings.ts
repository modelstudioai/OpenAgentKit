import type { KitStringTable } from "../kit-i18n/index.ts";

export interface ThreadPanelStrings {
	title: string;
}

const threadPanelStrings: KitStringTable<ThreadPanelStrings> = {
	"zh-CN": { title: "子线程（{{count}}）" },
	en: { title: "Sub-threads ({{count}})" },
};

export default threadPanelStrings;
export { threadPanelStrings };
