import type { MessagePart } from "@openagentkit/sdk/messages";
import { computed, defineComponent, h } from "vue";
import { CodeHighlighter } from "../../code-highlighter/index.ts";
import { format, resolveStrings, useKitLocale } from "../../kit-i18n/index.ts";
import { ProcessStep, ProcessValue, ProcessValueCode } from "../step/index.ts";
import { toolSummary } from "../tool-summary/index.ts";
import toolCallCardStrings, { type ToolCallCardStrings } from "./strings.ts";

export { type ToolCallCardStrings, toolCallCardStrings };

export type ToolPart = Extract<MessagePart, { type: "tool" }>;

function displayValue(value: unknown, fallback: string): string {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value, null, 2) ?? String(value);
	} catch {
		return fallback;
	}
}

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

function ToolOutput(value: unknown, strings: ToolCallCardStrings) {
	const text = displayValue(value, strings.serializeFallback);
	if (isJsonPayload(text))
		return h(CodeHighlighter, {
			lang: "json",
			copyable: true,
			className: "rounded-[var(--kit-radius-sm)] bg-[var(--kit-bg-subtle)]",
			children: () => text,
		});
	return h(ProcessValueCode, { text });
}

export const ToolCallCard = defineComponent({
	name: "ToolCallCard",
	props: {
		part: { type: Object as () => ToolPart, required: true },
		className: { type: String, default: undefined },
		contentMaxHeight: { type: String, default: undefined },
		strings: { type: Object as () => Partial<ToolCallCardStrings>, default: undefined },
	},
	setup(props) {
		const strings = computed(() => resolveStrings(toolCallCardStrings, useKitLocale(), props.strings));
		const summary = computed(() => toolSummary({ name: props.part.name, input: props.part.input }));
		const state = computed(() =>
			props.part.status === "running" ? "running" : props.part.status === "error" ? "failed" : "done",
		);
		return () => {
			const detail = [
				props.part.input !== undefined
					? h(ProcessValue, { label: strings.value.inputParams }, () =>
							h(ProcessValueCode, { text: displayValue(props.part.input, strings.value.serializeFallback) }),
						)
					: null,
				props.part.output !== undefined
					? h(ProcessValue, { label: strings.value.result }, () =>
							h(
								"div",
								{
									class:
										"animate-[var(--kit-animate-expand)] rounded-[var(--kit-radius-sm)] bg-[var(--kit-bg-subtle)] px-3 py-2",
								},
								[ToolOutput(props.part.output, strings.value)],
							),
						)
					: null,
				props.part.input === undefined && props.part.output === undefined
					? h("p", { class: "text-[var(--kit-fg-muted)]" }, strings.value.noDetail)
					: null,
			];
			return h(
				ProcessStep,
				{
					ariaLabel: format(strings.value.aria, { name: props.part.name }),
					verb: summary.value.verb,
					preview: summary.value.badge,
					status: strings.value.status[props.part.status],
					state: state.value,
					className: props.className,
					contentMaxHeight: props.contentMaxHeight,
				},
				{ default: () => h("dl", { class: "space-y-3" }, detail) },
			);
		};
	},
});
