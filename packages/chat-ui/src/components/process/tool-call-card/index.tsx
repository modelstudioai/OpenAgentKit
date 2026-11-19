import { CodeHighlighter } from "../../code-highlighter/index.tsx";
import { format, resolveStrings, useKitLocale } from "../../kit-i18n/index.ts";
import { ProcessStep, ProcessValue, ProcessValueCode } from "../step/index.tsx";
import { toolSummary } from "../tool-summary/index.ts";
import toolCallCardStrings, { type ToolCallCardStrings } from "./strings.ts";

export type ToolPart = Extract<import("@openagentkit/sdk/messages").MessagePart, { type: "tool" }>;

function displayValue(value: unknown, fallback: string): string {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value, null, 2) ?? String(value);
	} catch {
		return fallback;
	}
}

/** JSON 对象/数组判定：仅接受可完整解析的结构化输出，其余按原文文本展示。 */
function isJsonPayload(text: string): boolean {
	const trimmed = text.trim();
	if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
	try {
		void JSON.parse(trimmed);
		return true;
	} catch {
		return false;
	}
}

/** 工具输出的内容感知渲染：结构化 JSON 用语法高亮代码块，其余保留原文文本。 */
function ToolOutput({ value, strings }: { value: unknown; strings: ToolCallCardStrings }) {
	const text = displayValue(value, strings.serializeFallback);
	if (isJsonPayload(text))
		return (
			<CodeHighlighter lang="json" copyable className="rounded-[var(--kit-radius-sm)] bg-[var(--kit-bg-subtle)]">
				{text}
			</CodeHighlighter>
		);
	return <ProcessValueCode text={text} />;
}

/** 工具调用时间线步骤：动词 + 操作对象预览；输入保持代码块；输出按内容类型渲染。 */
export function ToolCallCard({
	part,
	className,
	contentMaxHeight,
	strings: stringsOverride,
}: {
	part: ToolPart;
	/** 追加到卡片根节点（details）的工具类。 */
	className?: string;
	/** 展开内容区限高，透传 ProcessStep；不传用默认 max-h-80。 */
	contentMaxHeight?: string;
	/** 覆盖内置文案（键见 strings.ts）；语言由 KitLocaleProvider 提供，缺省 zh-CN。 */
	strings?: Partial<ToolCallCardStrings>;
}) {
	const strings = resolveStrings(toolCallCardStrings, useKitLocale(), stringsOverride);
	const { verb, badge } = toolSummary({ name: part.name, input: part.input });
	return (
		<ProcessStep
			ariaLabel={format(strings.aria, { name: part.name })}
			verb={verb}
			preview={badge}
			status={strings.status[part.status]}
			state={part.status === "running" ? "running" : part.status === "error" ? "failed" : "done"}
			className={className}
			contentMaxHeight={contentMaxHeight}
		>
			<dl className="space-y-3">
				{part.input !== undefined ? (
					<ProcessValue label={strings.inputParams}>
						<ProcessValueCode text={displayValue(part.input, strings.serializeFallback)} />
					</ProcessValue>
				) : null}
				{part.output !== undefined ? (
					<ProcessValue label={strings.result}>
						<div className="animate-[var(--kit-animate-expand)] rounded-[var(--kit-radius-sm)] bg-[var(--kit-bg-subtle)] px-3 py-2">
							<ToolOutput value={part.output} strings={strings} />
						</div>
					</ProcessValue>
				) : null}
			</dl>
			{part.input === undefined && part.output === undefined ? (
				<p className="text-[var(--kit-fg-muted)]">{strings.noDetail}</p>
			) : null}
		</ProcessStep>
	);
}
