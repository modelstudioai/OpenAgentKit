import type { PlazaEntry } from "@openagentkit/sdk/protocol";
import { computed, defineComponent, h, type PropType, type VNode } from "vue";
import { format, resolveStrings, useKitLocale } from "../kit-i18n/index.ts";
import plazaCardStrings, { type PlazaCardStrings } from "./strings.ts";

export { type PlazaCardStrings, plazaCardStrings };

export function isIconImageSource(icon: string | undefined): boolean {
	return Boolean(icon && /^(https?:|data:|\/|\.\/)/.test(icon));
}

function MiniIcon(children: VNode[], className: string) {
	return h(
		"svg",
		{
			"aria-hidden": "true",
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: "currentColor",
			"stroke-width": "1.5",
			"stroke-linecap": "round",
			"stroke-linejoin": "round",
			class: className,
		},
		children,
	);
}

const CAPABILITY_KEYS: Array<keyof PlazaEntry["capabilities"]> = [
	"streaming",
	"fileUpload",
	"artifacts",
	"threads",
	"reasoning",
];

const CAPABILITY_PATHS: Record<keyof PlazaEntry["capabilities"], string[]> = {
	streaming: ["M13 2 3 14h9l-1 8 10-12h-9l1-8Z"],
	fileUpload: [
		"m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48",
	],
	artifacts: [
		"M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z",
		"m3.3 7 8.7 5 8.7-5",
		"M12 22V12",
	],
	threads: ["M7.9 20A9 9 0 1 0 4 16.1L2 22Z"],
	reasoning: [
		"m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z",
	],
};

/** last_used_at → 「今天 / 昨天 / N 天前使用过」；按本地日历日差计算。 */
export function relativeUsedLabel(iso: string, strings: PlazaCardStrings, now = new Date()): string {
	const startOf = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
	const days = Math.round((startOf(now) - startOf(new Date(iso))) / 86_400_000);
	if (days <= 0) return strings.usedToday;
	if (days === 1) return strings.usedYesterday;
	return format(strings.usedDaysAgo, { days });
}

/** 广场 Agent 卡片：图标与名称、分类/精选/我的、描述、能力徽标、用量统计与主行动按钮。 */
export const PlazaCard = defineComponent({
	name: "PlazaCard",
	props: {
		entry: { type: Object as () => PlazaEntry, required: true },
		onOpen: { type: Function as PropType<(slug: string) => void>, required: true },
		strings: { type: Object as () => Partial<PlazaCardStrings>, default: undefined },
	},
	setup(props) {
		const strings = computed(() => resolveStrings(plazaCardStrings, useKitLocale(), props.strings));
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 卡片按图标、描述、能力与行动结构平铺，与 React 版保持同一阅读顺序
		return () => {
			const entry = props.entry;
			const description = entry.description ?? entry.opening_remarks;
			const prompt = entry.suggested_prompts[0];
			return h(
				"div",
				{
					class:
						"flex min-w-0 flex-col gap-3.5 rounded-[var(--kit-radius)] border border-[var(--kit-border)] bg-[var(--kit-surface)] p-4 hover:-translate-y-0.5 hover:border-[var(--kit-accent)]/40 hover:shadow-[var(--kit-shadow)] focus-within:shadow-[var(--kit-shadow)] motion-safe:transition sm:p-5",
				},
				[
					h("div", { class: "flex min-w-0 items-center gap-3" }, [
						h(
							"div",
							{
								"aria-hidden": "true",
								class:
									"grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-[var(--kit-radius-icon)] bg-[linear-gradient(135deg,var(--kit-user-bubble),var(--kit-stat-tint))] text-[length:var(--kit-text-prose-title)]",
							},
							[
								isIconImageSource(entry.icon)
									? h("img", { src: entry.icon, alt: "", class: "h-8 w-8 object-contain" })
									: (entry.icon ?? "🤖"),
							],
						),
						h("div", { class: "min-w-0 flex-1" }, [
							h(
								"h3",
								{ class: "truncate text-[length:var(--kit-text-heading)] font-semibold", title: entry.display_name },
								entry.display_name,
							),
							h("div", { class: "mt-1.5 flex flex-wrap items-center gap-1.5" }, [
								entry.featured
									? h(
											"span",
											{
												class:
													"rounded-full bg-[var(--kit-warning)]/15 px-2 py-0.5 text-[length:var(--kit-text-meta)] font-medium text-[var(--kit-warning)]",
											},
											strings.value.featured,
										)
									: null,
								h(
									"span",
									{
										class:
											"rounded-full bg-[var(--kit-bg-subtle)] px-2 py-0.5 text-[length:var(--kit-text-meta)] text-[var(--kit-fg-muted)]",
									},
									strings.value.categories[entry.category],
								),
								entry.stats.mine
									? h(
											"span",
											{
												class:
													"rounded-full bg-[var(--kit-success)]/15 px-2 py-0.5 text-[length:var(--kit-text-meta)] text-[var(--kit-success)]",
											},
											strings.value.mine,
										)
									: null,
							]),
						]),
					]),
					h(
						"p",
						{
							class: `line-clamp-2 min-h-[3.25em] text-[length:var(--kit-text-label)] leading-relaxed text-[var(--kit-fg-muted)] [overflow-wrap:anywhere] ${description ? "" : "opacity-65"}`,
							title: description ?? undefined,
						},
						description ?? strings.value.noDescription,
					),
					prompt
						? h(
								"div",
								{
									class:
										"flex min-w-0 items-center gap-1.5 rounded-[var(--kit-radius-sm)] bg-[var(--kit-bg-subtle)] px-2.5 py-1.5 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]",
								},
								[
									MiniIcon(
										[
											h("path", {
												d: "M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z",
											}),
											h("path", {
												d: "M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z",
											}),
										],
										"h-3.5 w-3.5 shrink-0 text-[var(--kit-accent)]",
									),
									h("span", { class: "min-w-0 truncate" }, format(strings.value.tryAsk, { prompt })),
								],
							)
						: null,
					h(
						"div",
						{ class: "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5" },
						CAPABILITY_KEYS.filter((key) => entry.capabilities[key]).map((key) =>
							h(
								"span",
								{
									key,
									class:
										"flex min-w-0 items-center gap-1 text-[length:var(--kit-text-meta)] text-[var(--kit-fg-muted)]",
								},
								[
									MiniIcon(
										CAPABILITY_PATHS[key].map((d) => h("path", { key: d, d })),
										"h-3.5 w-3.5 shrink-0 text-[var(--kit-accent)]",
									),
									strings.value.capabilities[key],
								],
							),
						),
					),
					h(
						"div",
						{
							class:
								"mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[var(--kit-border-subtle)] pt-3",
						},
						[
							h(
								"span",
								{
									class:
										"flex min-w-0 flex-wrap items-center gap-1.5 text-[length:var(--kit-text-meta)] text-[var(--kit-fg-muted)] [overflow-wrap:anywhere]",
								},
								[
									h("span", null, [
										strings.value.turns30dPrefix,
										" ",
										h("b", { class: "text-[var(--kit-fg)]" }, entry.stats.turns_30d),
										" ",
										strings.value.turns30dSuffix,
									]),
									entry.stats.last_used_at
										? h("span", null, [
												h("span", { "aria-hidden": "true", class: "opacity-50" }, "·"),
												" ",
												relativeUsedLabel(entry.stats.last_used_at, strings.value),
											])
										: null,
								],
							),
							h(
								"button",
								{
									type: "button",
									onClick: () => props.onOpen(entry.slug),
									class:
										"flex min-h-9 shrink-0 items-center gap-1 rounded-[var(--kit-radius-sm)] bg-[var(--kit-accent)] px-3 py-2 text-[length:var(--kit-text-caption)] font-medium text-[var(--kit-accent-fg)] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)] motion-safe:transition motion-safe:active:scale-95",
								},
								[
									strings.value.start,
									MiniIcon([h("path", { d: "M5 12h14" }), h("path", { d: "m12 5 7 7-7 7" })], "h-3.5 w-3.5"),
								],
							),
						],
					),
				],
			);
		};
	},
});
