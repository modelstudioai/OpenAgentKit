import type { KitStringTable } from "../kit-i18n/index.ts";

export interface MarkdownStrings {
	table: string;
}

const markdownStrings: KitStringTable<MarkdownStrings> = {
	"zh-CN": { table: "表格" },
	en: { table: "Table" },
};

export default markdownStrings;
export { markdownStrings };
