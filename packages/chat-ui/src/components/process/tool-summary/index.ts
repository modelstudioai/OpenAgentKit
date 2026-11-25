import toolSummaryStrings, { type ToolSummaryStrings } from "./strings.ts";

/**
 * 工具调用摘要：已知工具给「动词 + 操作对象徽标」（如 读取文件 / desktop.css），
 * 未知工具回退「工具名 + 参数预览徽标」。徽标缺失字段时自动省略。
 */

export interface ToolSummary {
	verb: string;
	badge?: string;
}

interface SummaryInput {
	name: string;
	input?: unknown;
}

function field(input: unknown, key: string): string | undefined {
	if (!input || typeof input !== "object") return undefined;
	const value = (input as Record<string, unknown>)[key];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function truncate(text: string, max = 40): string {
	const compact = text.replace(/\s+/g, " ").trim();
	return compact.length > max ? `${compact.slice(0, max)}…` : compact;
}

function basename(path: string): string {
	const segments = path.split(/[/\\]/).filter(Boolean);
	return segments.at(-1) ?? path;
}

function firstStringField(input: unknown): string | undefined {
	if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
	for (const value of Object.values(input as Record<string, unknown>)) {
		if (typeof value === "string" && value.length > 0) return truncate(value);
	}
	return undefined;
}

function fallbackBadge(input: unknown): string | undefined {
	if (typeof input === "string") return truncate(input);
	return firstStringField(input);
}

function bashSummary({ input }: SummaryInput, strings: ToolSummaryStrings): ToolSummary | undefined {
	const command = field(input, "command") ?? field(input, "cmd");
	return command ? { verb: strings.verbs.runCommand, badge: truncate(command) } : undefined;
}

function templates(strings: ToolSummaryStrings): Record<string, (input: SummaryInput) => ToolSummary | undefined> {
	return {
		read_file: ({ input }) => {
			const target = field(input, "filename") ?? field(input, "path");
			return target ? { verb: strings.verbs.readFile, badge: basename(target) } : undefined;
		},
		write_file: ({ input }) => {
			const target = field(input, "path") ?? field(input, "filename");
			return target ? { verb: strings.verbs.writeFile, badge: basename(target) } : undefined;
		},
		web_search: ({ input }) => {
			const query = field(input, "query") ?? field(input, "q") ?? field(input, "keyword");
			return query ? { verb: strings.verbs.search, badge: truncate(query, 24) } : undefined;
		},
		bash: (input) => bashSummary(input, strings),
		shell: (input) => bashSummary(input, strings),
		execute_command: (input) => bashSummary(input, strings),
	};
}

export function toolSummary(
	{ name, input }: SummaryInput,
	strings: ToolSummaryStrings = toolSummaryStrings["zh-CN"],
): ToolSummary {
	const summary = templates(strings)[name]?.({ name, input });
	if (summary) return summary;
	return { verb: name, badge: fallbackBadge(input) };
}
