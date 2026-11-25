import { computed, defineComponent, h } from "vue";
import { resolveStrings, useKitLocale } from "../../kit-i18n/index.ts";
import { ProcessStep } from "../step/index.ts";
import reasoningBlockStrings, { type ReasoningBlockStrings } from "./strings.ts";

export { type ReasoningBlockStrings, reasoningBlockStrings };

export const ReasoningBlock = defineComponent({
	name: "ReasoningBlock",
	props: {
		text: { type: String, required: true },
		status: { type: String as () => "streaming" | "done" | "failed" | "interrupted", default: undefined },
		className: { type: String, default: undefined },
		contentMaxHeight: { type: String, default: undefined },
		strings: { type: Object as () => Partial<ReasoningBlockStrings>, default: undefined },
	},
	setup(props) {
		const strings = computed(() => resolveStrings(reasoningBlockStrings, useKitLocale(), props.strings));
		const preview = computed(() =>
			props.text
				.split("\n")
				.map((line) => line.trim())
				.find(Boolean),
		);
		const state = computed(() =>
			props.status === "streaming" ? "running" : props.status === "failed" ? "failed" : props.status ? "done" : "idle",
		);
		const verb = computed(() => (props.status ? strings.value[props.status] : strings.value.title));
		return () =>
			h(
				ProcessStep,
				{
					ariaLabel: strings.value.aria,
					verb: verb.value,
					preview: preview.value,
					state: state.value,
					className: props.className,
					contentMaxHeight: props.contentMaxHeight,
				},
				{
					default: () =>
						h(
							"div",
							{
								class:
									"text-[var(--kit-fg-muted)] leading-[var(--kit-leading-body)] [overflow-wrap:anywhere] whitespace-pre-wrap",
							},
							props.text,
						),
				},
			);
	},
});
