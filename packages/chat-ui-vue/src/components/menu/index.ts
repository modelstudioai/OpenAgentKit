import {
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuPortal,
	DropdownMenuRoot,
	DropdownMenuTrigger,
} from "reka-ui";
import { defineComponent, h, nextTick, type PropType } from "vue";

/** 命令菜单（Reka UI DropdownMenu 薄包装）：方向键、Escape、焦点圈由原语提供。 */
export const Menu = DropdownMenuRoot;
export const MenuTrigger = DropdownMenuTrigger;

export const MenuContent = defineComponent({
	name: "MenuContent",
	inheritAttrs: false,
	props: {
		align: { type: String as PropType<"start" | "center" | "end">, default: "start" },
		sideOffset: { type: Number, default: 6 },
	},
	setup(props, { attrs, slots }) {
		return () => {
			const { class: className, ...rest } = attrs;
			return h(DropdownMenuPortal, null, () =>
				h(
					DropdownMenuContent,
					{
						...rest,
						align: props.align,
						sideOffset: props.sideOffset,
						class: `z-[9999] min-w-36 overflow-hidden rounded-[var(--kit-radius-sm)] border border-[var(--kit-border)] bg-[var(--kit-surface)] p-1 text-[var(--kit-fg)] shadow-[var(--kit-shadow)] [animation:var(--kit-animate-overlay-in)] ${typeof className === "string" ? className : ""}`,
						// 与 Radix 一致：键盘打开后焦点落在首项，Enter 才能直接执行命令。
						onOpenAutoFocus: (event: Event) => {
							const content = event.currentTarget as HTMLElement | null;
							const find = () =>
								content?.querySelector<HTMLElement>('[role="menuitem"]') ??
								document.querySelector<HTMLElement>('[role="menu"] [role="menuitem"]');
							const first = find();
							if (first) {
								first.focus({ preventScroll: true });
								return;
							}
							let attempts = 0;
							const focusFirst = () => {
								const item = find();
								if (item) {
									item.focus({ preventScroll: true });
									return;
								}
								if (attempts++ < 20) requestAnimationFrame(focusFirst);
							};
							void nextTick(() => requestAnimationFrame(focusFirst));
						},
						// 兜底：焦点若停在菜单容器上，Enter 仍执行首项，而不是被吞掉。
						onKeydown: (event: KeyboardEvent) => {
							if (event.key !== "Enter") return;
							const content = event.currentTarget as HTMLElement | null;
							const active = document.activeElement;
							if (content && active && active !== content && content.contains(active)) return;
							const item = document.querySelector<HTMLElement>('[role="menu"] [role="menuitem"]');
							if (!item) return;
							event.preventDefault();
							item.click();
						},
					},
					slots,
				),
			);
		};
	},
});

export const MenuItem = defineComponent({
	name: "MenuItem",
	inheritAttrs: false,
	setup(_props, { attrs, slots }) {
		return () => {
			const { class: className, ...rest } = attrs;
			return h(
				DropdownMenuItem,
				{
					...rest,
					class: `flex min-h-9 w-full cursor-default select-none items-center gap-2 rounded-[calc(var(--kit-radius-sm)-4px)] px-2.5 py-1.5 text-start text-[length:var(--kit-text-label)] outline-none transition-colors duration-[var(--kit-duration-fast)] ease-[var(--kit-ease-out)] motion-reduce:transition-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-[var(--kit-bg-subtle)] ${typeof className === "string" ? className : ""}`,
				},
				slots,
			);
		};
	},
});
