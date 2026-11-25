import { defineComponent, h, type PropType, type VNode } from "vue";

export interface PromptsItemBase {
	key: string;
	icon?: VNode;
	label?: VNode | string;
	description?: VNode | string;
	disabled?: boolean;
}

export interface PromptsItem extends PromptsItemBase {
	children?: PromptsItemBase[];
}

export type PromptsSemantic = "root" | "title" | "list" | "item" | "itemContent" | "subList" | "subItem";

const ITEM =
	"flex min-h-10 min-w-0 max-w-full flex-none items-start gap-3 rounded-[var(--kit-radius)] text-left text-[length:var(--kit-text-label)] leading-6 text-[var(--kit-fg)] [overflow-wrap:anywhere]";
const CARD = "border border-[var(--kit-border-subtle)] bg-[var(--kit-surface)] px-4 py-3";
const INTERACTIVE =
	"cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--kit-focus)] disabled:cursor-not-allowed";
const SUB_ITEM = "bg-[var(--kit-bg-subtle)] px-3 py-2 transition-colors enabled:hover:bg-[var(--kit-nav-active)]";

function cx(...names: Array<string | false | undefined>): string {
	return names.filter(Boolean).join(" ");
}

function itemBody(item: PromptsItemBase, contentClassName?: string, children: (VNode | null)[] = []): (VNode | null)[] {
	return [
		item.icon ? h("span", { "aria-hidden": "true", class: "flex h-5 shrink-0 items-center" }, [item.icon]) : null,
		h("span", { class: cx("flex min-w-0 flex-1 flex-col gap-1", contentClassName) }, [
			item.label ? h("span", { class: "font-medium leading-6" }, [item.label]) : null,
			item.description
				? h("span", { class: "text-[length:var(--kit-text-caption)] leading-5 text-[var(--kit-fg-muted)]" }, [
						item.description,
					])
				: null,
			...children,
		]),
	];
}

/** 提示集：开场引导里的示例问题/快捷入口。数据来自调用方，点击只回调，不直接发送。 */
export const Prompts = defineComponent({
	name: "Prompts",
	props: {
		items: { type: Array as () => PromptsItem[], default: () => [] },
		title: { type: [String, Object] as PropType<VNode | string>, default: undefined },
		onItemClick: { type: Function as PropType<(info: { data: PromptsItem }) => void>, default: undefined },
		vertical: { type: Boolean, default: false },
		wrap: { type: Boolean, default: false },
		className: { type: String, default: "" },
		classNames: { type: Object as () => Partial<Record<PromptsSemantic, string>>, default: () => ({}) },
	},
	setup(props) {
		return () => {
			if (props.items.length === 0) return null;
			const names = props.classNames;
			return h("div", { class: cx("flex min-w-0 max-w-full flex-col gap-3", props.className, names.root) }, [
				props.title
					? h(
							"div",
							{ class: cx("text-[length:var(--kit-text-base)] font-semibold text-[var(--kit-fg)]", names.title) },
							[props.title],
						)
					: null,
				h(
					"div",
					{
						class: cx(
							"flex min-w-0 gap-2",
							props.vertical ? "flex-col items-start" : props.wrap ? "flex-wrap" : "overflow-x-auto",
							names.list,
						),
					},
					props.items.map((item) => {
						if (item.children?.length)
							return h(
								"div",
								{
									key: item.key,
									class: cx(
										ITEM,
										CARD,
										props.wrap && !props.vertical && "max-sm:w-full",
										"transition-colors",
										item.disabled && "cursor-not-allowed opacity-50",
										names.item,
									),
								},
								itemBody(item, names.itemContent, [
									h("span", { class: cx("mt-2 flex flex-col gap-1.5", names.subList) }, [
										...item.children.map((child) =>
											h(
												"button",
												{
													key: child.key,
													type: "button",
													disabled: item.disabled || child.disabled,
													onClick: () => props.onItemClick?.({ data: child }),
													class: cx(
														ITEM,
														INTERACTIVE,
														SUB_ITEM,
														!item.disabled && "disabled:opacity-50",
														names.subItem,
													),
												},
												itemBody(child),
											),
										),
									]),
								]),
							);
						return h(
							"button",
							{
								key: item.key,
								type: "button",
								disabled: item.disabled,
								onClick: () => props.onItemClick?.({ data: item }),
								class: cx(
									ITEM,
									CARD,
									props.wrap && !props.vertical && "max-sm:w-full",
									INTERACTIVE,
									"disabled:opacity-50",
									"transition-colors",
									"enabled:hover:border-[var(--kit-border)] enabled:hover:bg-[var(--kit-bg-subtle)]",
									names.item,
								),
							},
							itemBody(item, names.itemContent),
						);
					}),
				),
			]);
		};
	},
});
