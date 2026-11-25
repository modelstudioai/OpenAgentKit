import { resolveStrings, useKitLocale } from "../../kit-i18n/index.ts";
import { ProcessStep } from "../step/index.tsx";
import reasoningBlockStrings, { type ReasoningBlockStrings } from "./strings.ts";

export function ReasoningBlock({
	text,
	status,
	className,
	contentMaxHeight,
	strings: stringsOverride,
}: {
	text: string;
	status?: "streaming" | "done" | "failed" | "interrupted";
	/** 追加到卡片根节点（details）的工具类。 */
	className?: string;
	/** 展开内容区限高，透传 ProcessStep；不传用默认 max-h-80。 */
	contentMaxHeight?: string;
	/** 覆盖内置文案（键见 strings.ts）；语言由 KitLocaleProvider 提供，缺省 zh-CN。 */
	strings?: Partial<ReasoningBlockStrings>;
}) {
	const strings = resolveStrings(reasoningBlockStrings, useKitLocale(), stringsOverride);
	// 预览取首个非空行；流式期间随正文增长，始终默认收起。
	const preview = text
		.split("\n")
		.map((line) => line.trim())
		.find(Boolean);
	return (
		<ProcessStep
			ariaLabel={strings.aria}
			verb={status ? strings[status] : strings.title}
			preview={preview}
			state={status === "streaming" ? "running" : status === "failed" ? "failed" : status ? "done" : "idle"}
			className={className}
			contentMaxHeight={contentMaxHeight}
		>
			<div className="text-[var(--kit-fg-muted)] leading-[var(--kit-leading-body)] [overflow-wrap:anywhere] whitespace-pre-wrap">
				{text}
			</div>
		</ProcessStep>
	);
}
