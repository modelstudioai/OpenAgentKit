import { computed, defineComponent, h, type PropType, ref, type VNode } from "vue";
import { resolveStrings, useKitLocale } from "../kit-i18n/index.ts";
import suggestionStrings, { type SuggestionStrings } from "./strings.ts";

export { type SuggestionStrings, suggestionStrings };

export interface SuggestionItem {
	label: string;
	value: string;
	description?: string;
	icon?: VNode;
	extra?: string;
	children?: SuggestionItem[];
	keywords?: string[];
	data?: unknown;
}

export interface SuggestionSelectContext {
	trigger: string;
	query: string;
	start: number;
	end: number;
}

/** 光标前的触发词：必须从词首开始，查询不能跨过空白。 */
export function activeTriggerQuery(value: string, caret: number, trigger: string) {
	const end = Math.min(caret, value.length);
	for (let index = end - 1; index >= 0; index--) {
		if (value.startsWith(trigger, index)) {
			const bounded = index === 0 || /\s/.test(value[index - 1] ?? "");
			return bounded ? { start: index, query: value.slice(index + trigger.length, end) } : null;
		}
		if (/\s/.test(value[index] ?? "")) return null;
	}
	return null;
}

function defaultFilter(item: SuggestionItem, query: string): boolean {
	const needle = query.toLocaleLowerCase();
	return [item.value, ...(item.keywords ?? [])].some((value) => value.toLocaleLowerCase().startsWith(needle));
}

/** 技能候选：``/`` 触发、方向键选择、Enter/Tab 确认、Esc 关闭；焦点始终留在输入框。 */
export const Suggestion = defineComponent({
	name: "Suggestion",
	props: {
		items: { type: Array as () => SuggestionItem[], default: () => [] },
		value: { type: String, default: undefined },
		caret: { type: Number, default: undefined },
		trigger: { type: String, default: undefined },
		open: { type: Boolean, default: undefined },
		block: { type: Boolean, default: false },
		filter: {
			type: Function as PropType<(item: SuggestionItem, query: string) => boolean>,
			default: undefined,
		},
		onSelect: {
			type: Function as PropType<
				(value: string, item: SuggestionItem, context: SuggestionSelectContext | undefined) => void
			>,
			default: undefined,
		},
		className: { type: String, default: undefined },
		strings: { type: Object as () => Partial<SuggestionStrings>, default: undefined },
	},
	emits: ["update:open"],
	setup(props, { slots, emit }) {
		const strings = computed(() => resolveStrings(suggestionStrings, useKitLocale(), props.strings));
		const highlighted = ref(0);
		const dismissedKey = ref<string | null>(null);
		const triggerQuery = computed(() =>
			props.trigger && props.value !== undefined && props.caret !== undefined
				? activeTriggerQuery(props.value, props.caret, props.trigger)
				: null,
		);
		const triggerKey = computed(() =>
			triggerQuery.value ? `${triggerQuery.value.start}:${triggerQuery.value.query}` : null,
		);
		const filtered = computed(() => {
			const query = triggerQuery.value?.query;
			if (query === undefined) return props.items;
			const filter = props.filter ?? defaultFilter;
			return props.items.filter((item) => filter(item, query));
		});
		const open = computed(() => {
			if (props.open !== undefined) return props.open;
			return Boolean(
				props.trigger && triggerQuery.value && filtered.value.length > 0 && dismissedKey.value !== triggerKey.value,
			);
		});
		const activeId = computed(() =>
			open.value && filtered.value.length
				? `kit-suggestion-${triggerQuery.value?.start ?? 0}-${highlighted.value}`
				: undefined,
		);
		const close = () => {
			dismissedKey.value = triggerKey.value;
			emit("update:open", false);
		};
		const choose = (item: SuggestionItem) => {
			const query = triggerQuery.value;
			props.onSelect?.(
				item.value,
				item,
				query && props.trigger
					? { trigger: props.trigger, query: query.query, start: query.start, end: props.caret ?? 0 }
					: undefined,
			);
			close();
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (!open.value) return;
			const count = filtered.value.length;
			if (event.key === "ArrowDown") {
				event.preventDefault();
				highlighted.value = (highlighted.value + 1) % Math.max(1, count);
				return;
			}
			if (event.key === "ArrowUp") {
				event.preventDefault();
				highlighted.value = (highlighted.value - 1 + Math.max(1, count)) % Math.max(1, count);
				return;
			}
			if (event.key === "Enter" || event.key === "Tab") {
				event.preventDefault();
				const item = filtered.value[highlighted.value];
				if (item) choose(item);
				return;
			}
			if (event.key === "Escape") {
				event.preventDefault();
				close();
			}
		};
		const inputProps = computed(() => ({
			role: "combobox" as const,
			"aria-expanded": open.value,
			"aria-controls": open.value ? "kit-suggestion-list" : undefined,
			"aria-activedescendant": activeId.value,
			"aria-autocomplete": "list" as const,
		}));

		return () => {
			const popup = open.value
				? h(
						"div",
						{
							id: "kit-suggestion-list",
							role: "listbox",
							"aria-label": strings.value.shortcut,
							class: `absolute bottom-full left-0 z-20 mb-2 flex max-w-full overflow-x-auto rounded-[var(--kit-radius-sm)] border border-[var(--kit-border)] bg-[var(--kit-surface)] shadow-[var(--kit-shadow)] ${props.block ? "w-full" : "min-w-48"}`,
						},
						[
							h("div", { class: "flex min-w-0 flex-col p-1" }, [
								h(
									"div",
									{ class: "px-2 py-1 text-[length:var(--kit-text-meta)] text-[var(--kit-fg-muted)]" },
									strings.value.shortcut,
								),
								...filtered.value.map((item, index) =>
									h(
										"div",
										{
											id: `kit-suggestion-${triggerQuery.value?.start ?? 0}-${index}`,
											key: `${item.value}:${index}`,
											role: "option",
											tabindex: -1,
											"aria-selected": index === highlighted.value,
											class: `flex cursor-pointer items-center gap-2 rounded-[var(--kit-radius-sm)] px-2.5 py-1.5 text-[length:var(--kit-text-label)] ${index === highlighted.value ? "bg-[var(--kit-bg-subtle)]" : ""}`,
											onMousemove: () => {
												highlighted.value = index;
											},
											onClick: () => choose(item),
										},
										[
											item.icon ? h("span", { "aria-hidden": "true", class: "shrink-0" }, [item.icon]) : null,
											h("span", { class: "min-w-0 flex-1 truncate" }, item.label),
											item.description
												? h(
														"span",
														{
															class:
																"min-w-0 max-w-40 truncate text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]",
														},
														item.description,
													)
												: null,
										],
									),
								),
							]),
						],
					)
				: null;
			return h("div", { class: `relative ${props.className ?? ""}` }, [
				popup,
				slots.default?.({
					onKeyDown,
					inputProps: inputProps.value,
					query: triggerQuery.value?.query,
					open: open.value,
				}),
			]);
		};
	},
});
