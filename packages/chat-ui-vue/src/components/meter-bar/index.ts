import { computed, defineComponent, h } from "vue";
import { format, resolveStrings, useKitLocale } from "../kit-i18n/index.ts";
import meterBarStrings, { type MeterBarStrings } from "./strings.ts";

export { type MeterBarStrings, meterBarStrings };

/** 用量条：unlimited 时只渲染轨道；max <= 0 时不计算比例。 */
export const MeterBar = defineComponent({
	name: "MeterBar",
	props: {
		value: { type: Number, required: true },
		max: { type: Number, required: true },
		unlimited: { type: Boolean, default: false },
		className: { type: String, default: "" },
		strings: { type: Object as () => Partial<MeterBarStrings>, default: undefined },
	},
	setup(props) {
		const strings = computed(() => resolveStrings(meterBarStrings, useKitLocale(), props.strings));
		return () => {
			const ratio = props.unlimited || props.max <= 0 ? 0 : Math.min(1, Math.max(0, props.value / props.max));
			const pct = Math.round(ratio * 100);
			return h(
				"div",
				{
					role: "progressbar",
					"aria-valuenow": props.unlimited ? undefined : props.value,
					"aria-valuemin": 0,
					"aria-valuemax": props.unlimited ? undefined : props.max,
					"aria-label": props.unlimited
						? strings.value.unlimited
						: format(strings.value.used, { value: props.value, max: props.max }),
					class: `h-3 w-full overflow-hidden rounded-full bg-[var(--kit-bg-subtle)] ${props.className}`,
				},
				props.unlimited
					? []
					: [
							h("div", {
								class: "h-full rounded-full bg-[var(--kit-accent)] motion-safe:transition-[width]",
								style: { width: `${pct}%` },
							}),
						],
			);
		};
	},
});
