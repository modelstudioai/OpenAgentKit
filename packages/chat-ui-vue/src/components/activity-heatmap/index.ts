import { computed, defineComponent, h } from "vue";
import { format, resolveStrings, useKitLocale } from "../kit-i18n/index.ts";
import activityHeatmapStrings, { type ActivityHeatmapStrings } from "./strings.ts";

export { type ActivityHeatmapStrings, activityHeatmapStrings };

const HEAT_LEVELS = [
	"bg-[var(--kit-border)]",
	"bg-[var(--kit-heat)]/30",
	"bg-[var(--kit-heat)]/60",
	"bg-[var(--kit-heat)]",
];

/** 近 30 天活跃热力图（GitHub 式周列）；levels 按 max 三等分。 */
export const ActivityHeatmap = defineComponent({
	name: "ActivityHeatmap",
	props: {
		days: { type: Array as () => { day: string; turns: number }[], required: true },
		strings: { type: Object as () => Partial<ActivityHeatmapStrings>, default: undefined },
	},
	setup(props) {
		const strings = computed(() => resolveStrings(activityHeatmapStrings, useKitLocale(), props.strings));
		return () => {
			const max = props.days.reduce((value, day) => Math.max(value, day.turns), 0);
			const levelOf = (turns: number) => (turns <= 0 ? 0 : turns <= max / 3 ? 1 : turns <= (max * 2) / 3 ? 2 : 3);
			return h("div", { class: "flex min-w-0 flex-wrap items-start gap-4" }, [
				h(
					"div",
					{
						role: "img",
						"aria-label":
							props.days
								.map((day) => format(strings.value.day, { day: day.day, turns: day.turns }))
								.join(strings.value.join) || strings.value.empty,
						class: "grid grid-flow-col grid-rows-7 gap-1",
					},
					props.days.map((day) =>
						h("span", {
							key: day.day,
							"aria-hidden": "true",
							title: format(strings.value.day, { day: day.day, turns: day.turns }),
							class: `h-3.5 w-3.5 rounded-[var(--kit-radius-xs)] ${HEAT_LEVELS[max === 0 ? 0 : levelOf(day.turns)]}`,
						}),
					),
				),
				h("div", { class: "flex items-center gap-1 text-[length:var(--kit-text-meta)] text-[var(--kit-fg-muted)]" }, [
					strings.value.less,
					...HEAT_LEVELS.map((cls) => h("span", { key: cls, class: `h-3 w-3 rounded-[var(--kit-radius-xs)] ${cls}` })),
					strings.value.more,
				]),
			]);
		};
	},
});
