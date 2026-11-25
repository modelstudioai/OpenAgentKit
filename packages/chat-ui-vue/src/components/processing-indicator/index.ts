import { computed, defineComponent, h } from "vue";
import { resolveStrings, useKitLocale } from "../kit-i18n/index.ts";
import { ProcessSpinner } from "../process/step/index.ts";
import processingIndicatorStrings, { type ProcessingIndicatorStrings } from "./strings.ts";

export { type ProcessingIndicatorStrings, processingIndicatorStrings };

/** 流式/等待期的指示行：正文末尾与列表尾部共用。 */
export const ProcessingIndicator = defineComponent({
	name: "ProcessingIndicator",
	props: {
		className: { type: String, default: "" },
		label: { type: String, default: undefined },
		strings: { type: Object as () => Partial<ProcessingIndicatorStrings>, default: undefined },
	},
	setup(props) {
		const strings = computed(() => resolveStrings(processingIndicatorStrings, useKitLocale(), props.strings));
		return () =>
			h(
				"p",
				{
					class: `flex items-center gap-1.5 text-[length:var(--kit-text-label)] text-[var(--kit-fg-muted)] ${props.className}`,
				},
				[
					h(ProcessSpinner, { className: "size-3.5 text-[var(--kit-accent)]" }),
					props.label ?? strings.value.processing,
				],
			);
	},
});
