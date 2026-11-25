import type { KitStringTable } from "../kit-i18n/index.ts";

export interface CodeHighlighterStrings {
	blockAria: string;
	copyCode: string;
	contentAria: string;
}

const codeHighlighterStrings: KitStringTable<CodeHighlighterStrings> = {
	"zh-CN": { blockAria: "代码块", copyCode: "复制代码", contentAria: "代码内容" },
	en: { blockAria: "Code block", copyCode: "Copy code", contentAria: "Code contents" },
};

export default codeHighlighterStrings;
export { codeHighlighterStrings };
