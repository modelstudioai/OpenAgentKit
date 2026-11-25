import type { KitStringTable } from "../kit-i18n/index.ts";

export interface SuggestionStrings {
	shortcut: string;
	nextLevel: string;
}

const suggestionStrings: KitStringTable<SuggestionStrings> = {
	"zh-CN": { shortcut: "快捷指令", nextLevel: "下一级指令" },
	en: { shortcut: "Shortcuts", nextLevel: "Sub-commands" },
};

export default suggestionStrings;
export { suggestionStrings };
