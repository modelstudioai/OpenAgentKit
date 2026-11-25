import type { KitStringTable } from "../../kit-i18n/index.ts";

export interface ToolSummaryStrings {
	verbs: {
		readFile: string;
		writeFile: string;
		search: string;
		runCommand: string;
	};
}

const toolSummaryStrings: KitStringTable<ToolSummaryStrings> = {
	"zh-CN": { verbs: { readFile: "读取文件", writeFile: "写入文件", search: "搜索", runCommand: "执行命令" } },
	en: { verbs: { readFile: "Read file", writeFile: "Write file", search: "Search", runCommand: "Run command" } },
};

export default toolSummaryStrings;
export { toolSummaryStrings };
