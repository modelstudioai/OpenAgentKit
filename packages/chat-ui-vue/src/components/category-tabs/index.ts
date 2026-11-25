import type { PlazaCategory } from "@openagentkit/sdk/protocol";
import { computed, defineComponent, h, type PropType } from "vue";
import { resolveStrings, useKitLocale } from "../kit-i18n/index.ts";
import categoryTabsStrings, { type CategoryTabsStrings } from "./strings.ts";

export { type CategoryTabsStrings, categoryTabsStrings };

export type PlazaTabId = PlazaCategory | "featured";

function moveCategoryFocus(event: KeyboardEvent, tabs: { id: PlazaTabId }[], onChange: (next: PlazaTabId) => void) {
	const buttons = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="tab"]'));
	const current = buttons.indexOf(event.target as HTMLButtonElement);
	if (current < 0) return;
	let next: number;
	switch (event.key) {
		case "ArrowRight":
			next = (current + 1) % buttons.length;
			break;
		case "ArrowLeft":
			next = (current - 1 + buttons.length) % buttons.length;
			break;
		case "Home":
			next = 0;
			break;
		case "End":
			next = buttons.length - 1;
			break;
		default:
			return;
	}
	event.preventDefault();
	const button = buttons[next];
	const tab = tabs[next];
	if (!button || !tab) return;
	button.focus({ preventScroll: true });
	const listBounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
	const tabBounds = button.getBoundingClientRect();
	(event.currentTarget as HTMLElement).scrollLeft +=
		Math.min(0, tabBounds.left - listBounds.left) + Math.max(0, tabBounds.right - listBounds.right);
	onChange(tab.id);
}

/** 广场分类 tab（「精选」+ 固定枚举分类）；方向键及 Home/End 切换。 */
export const CategoryTabs = defineComponent({
	name: "CategoryTabs",
	props: {
		categories: { type: Array as () => { id: PlazaCategory; name: string; count: number }[], required: true },
		active: { type: String as () => PlazaTabId, required: true },
		onChange: { type: Function as PropType<(next: PlazaTabId) => void>, required: true },
		strings: { type: Object as () => Partial<CategoryTabsStrings>, default: undefined },
	},
	setup(props) {
		const strings = computed(() => resolveStrings(categoryTabsStrings, useKitLocale(), props.strings));
		return () => {
			const tabs: { id: PlazaTabId; name: string }[] = [
				{ id: "featured", name: strings.value.featured },
				...props.categories,
			];
			return h(
				"div",
				{
					role: "tablist",
					"aria-label": strings.value.aria,
					class: "flex min-w-0 gap-2 overflow-x-auto py-1",
					onKeydown: (event: KeyboardEvent) => moveCategoryFocus(event, tabs, props.onChange),
				},
				tabs.map((tab) => {
					const selected = tab.id === props.active;
					return h(
						"button",
						{
							key: tab.id,
							type: "button",
							role: "tab",
							"aria-selected": selected,
							tabindex: selected ? 0 : -1,
							onClick: () => props.onChange(tab.id),
							class: `min-h-10 shrink-0 whitespace-nowrap rounded-[var(--kit-radius-sm)] border px-4 py-2 text-[length:var(--kit-text-label)] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--kit-focus)] ${
								selected
									? "border-transparent bg-[var(--kit-nav-active)] font-medium text-[var(--kit-fg)]"
									: "border-transparent text-[var(--kit-fg-muted)] hover:bg-[var(--kit-bg-subtle)] hover:text-[var(--kit-fg)]"
							}`,
						},
						tab.name,
					);
				}),
			);
		};
	},
});
