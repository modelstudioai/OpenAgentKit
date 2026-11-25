import { useIsMobile } from "@openagentkit/sdk/hooks-vue";
import {
	DialogClose,
	DialogContent,
	DialogOverlay,
	DialogPortal,
	DialogRoot,
	DialogTitle,
	DialogTrigger,
} from "reka-ui";
import { computed, defineComponent, h, onMounted, onScopeDispose, type PropType, ref, watch } from "vue";
import { format, resolveStrings, useKitLocale } from "../kit-i18n/index.ts";
import layoutStrings, { type LayoutStrings } from "./strings.ts";

export { type LayoutStrings, layoutStrings };

const ASIDE_CLOSE_CLASSES =
	"grid size-8 shrink-0 place-items-center rounded-[var(--kit-radius-sm)] text-[var(--kit-fg-muted)] transition-colors hover:bg-[var(--kit-bg-subtle)] hover:text-[var(--kit-fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]";

function MenuIcon(close = false) {
	return h(
		"svg",
		{
			"aria-hidden": "true",
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: "currentColor",
			"stroke-width": "1.5",
			class: "h-4 w-4 shrink-0",
		},
		[h("path", { d: close ? "m6 6 12 12M6 18 18 6" : "M4 6h16M4 12h16M4 18h16" })],
	);
}

/** 通用整页外壳：只管理布局、抽屉、资源面板与视口，不持有路由、认证或会话数据。 */
export const Layout = defineComponent({
	name: "Layout",
	props: {
		mobileTitle: { type: String, default: undefined },
		sidebarLabel: { type: String, default: undefined },
		asideLabel: { type: String, default: undefined },
		asideOpen: { type: Boolean, default: true },
		fitViewport: { type: Boolean, default: true },
		className: { type: String, default: undefined },
		strings: { type: Object as () => Partial<LayoutStrings>, default: undefined },
		onAsideOpenChange: { type: Function as PropType<(open: boolean) => void>, default: undefined },
	},
	emits: ["aside-open-change"],
	setup(props, { slots, emit }) {
		const strings = computed(() => resolveStrings(layoutStrings, useKitLocale(), props.strings));
		const sidebarText = computed(() => props.sidebarLabel ?? strings.value.sidebarLabel);
		const asideText = computed(() => props.asideLabel ?? strings.value.asideLabel);
		const isMobile = useIsMobile();
		const hasSidebar = computed(() => Boolean(slots.sidebar));
		const open = ref(false);
		const container = ref<HTMLElement | null>(null);

		const applyViewport = () => {
			const element = container.value;
			const viewport = window.visualViewport;
			if (!element || !props.fitViewport || !isMobile.value || !viewport || viewport.scale !== 1) return;
			const height = viewport.height || window.innerHeight;
			if (height > 0) element.style.setProperty("--kit-viewport-height", `${height}px`);
		};
		onMounted(() => {
			applyViewport();
			window.visualViewport?.addEventListener("resize", applyViewport);
			window.addEventListener("resize", applyViewport);
		});
		onScopeDispose(() => {
			window.visualViewport?.removeEventListener("resize", applyViewport);
			window.removeEventListener("resize", applyViewport);
			container.value?.style.removeProperty("--kit-viewport-height");
		});
		watch(isMobile, (mobile) => {
			if (!mobile) open.value = false;
			else emit("aside-open-change", false);
		});
		const closeSidebar = () => {
			open.value = false;
		};

		const renderSidebar = (closeButton: ReturnType<typeof h> | null) => [
			slots.sidebar?.({ closeSidebar, closeButton }),
			slots.dialogs?.(),
		];

		const renderHeader = (menuToggle: ReturnType<typeof h> | null) => {
			if (slots.header) return slots.header({ menuToggle });
			if (!isMobile.value) return null;
			return h(
				"header",
				{ class: "flex min-h-16 shrink-0 items-center gap-2 border-b border-[var(--kit-border)] px-3" },
				[menuToggle, h("span", { class: "text-[length:var(--kit-text-base)] font-medium" }, props.mobileTitle)],
			);
		};

		const renderAside = (closeButton: ReturnType<typeof h> | null) => slots.aside?.({ closeButton });

		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 外壳按侧栏/抽屉/页头/面板结构平铺，与 React 版保持同一阅读顺序
		return () => {
			const mobile = isMobile.value;
			const closeButton = mobile
				? h(DialogClose, { asChild: true }, () =>
						h(
							"button",
							{
								type: "button",
								"aria-label": format(strings.value.closeAria, { label: sidebarText.value }),
								class:
									"rounded-[var(--kit-radius-sm)] p-1 text-[var(--kit-fg-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]",
							},
							[MenuIcon(true)],
						),
					)
				: null;
			const menuToggle =
				mobile && hasSidebar.value
					? h(DialogTrigger, { asChild: true }, () =>
							h(
								"button",
								{
									type: "button",
									"aria-label": format(strings.value.openAria, { label: sidebarText.value }),
									title: format(strings.value.openAria, { label: sidebarText.value }),
									class:
										"grid h-9 w-9 shrink-0 place-items-center rounded-[var(--kit-radius-sm)] text-[var(--kit-fg-muted)] transition-colors hover:bg-[var(--kit-bg-subtle)] hover:text-[var(--kit-fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]",
								},
								[MenuIcon()],
							),
						)
					: null;
			const sidebarContent = renderSidebar(closeButton);
			const asideContent = renderAside(
				mobile
					? h(DialogClose, { asChild: true }, () =>
							h(
								"button",
								{
									type: "button",
									"aria-label": format(strings.value.closeAria, { label: asideText.value }),
									class: ASIDE_CLOSE_CLASSES,
								},
								[MenuIcon(true)],
							),
						)
					: null,
			);
			const desktopAside = asideContent
				? h(
						"div",
						{
							class:
								"h-full min-h-0 shrink-0 overflow-hidden transition-[width] duration-[var(--kit-duration-base)] ease-[var(--kit-ease-out)] motion-reduce:transition-none",
							style: { width: props.asideOpen ? "var(--kit-aside-width)" : "0px" },
						},
						[
							h(
								"div",
								{
									inert: !props.asideOpen || undefined,
									class:
										"flex h-full w-[var(--kit-aside-width)] min-h-0 flex-col bg-[var(--kit-bg)] transition-[opacity,transform] duration-[var(--kit-duration-base)] ease-[var(--kit-ease-out)] motion-reduce:transition-none",
									style: props.asideOpen ? undefined : { opacity: 0, transform: "translateX(12px)" },
								},
								[asideContent],
							),
						],
					)
				: null;
			const target = container.value;
			const mobileAside =
				asideContent && target
					? h(
							DialogRoot,
							{ open: props.asideOpen, "onUpdate:open": (next: boolean) => emit("aside-open-change", next) },
							() =>
								h(DialogPortal, { to: target }, () =>
									h(
										DialogContent,
										{
											"aria-describedby": undefined,
											class:
												"fixed inset-0 z-40 flex flex-col bg-[var(--kit-bg)] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-[var(--kit-shadow)] [animation:var(--kit-animate-panel-in)]",
										},
										() => [h(DialogTitle, { class: "sr-only" }, () => asideText.value), asideContent],
									),
								),
						)
					: null;
			const shellClass = `flex h-full min-h-0 overflow-hidden bg-[var(--kit-bg)]${props.fitViewport ? " max-md:max-h-[var(--kit-viewport-height,100dvh)]" : ""}${props.className ? ` ${props.className}` : ""}`;
			return h(
				DialogRoot,
				{ open: open.value && mobile, "onUpdate:open": (next: boolean) => (open.value = next) },
				() =>
					h("div", { ref: container, class: shellClass }, [
						!mobile ? sidebarContent : null,
						mobile && !open.value ? slots.dialogs?.() : null,
						mobile && target && hasSidebar.value
							? h(DialogPortal, { to: target }, () => [
									h(DialogOverlay, { class: "fixed inset-0 z-40 bg-[var(--kit-overlay)]" }),
									h(
										DialogContent,
										{
											"aria-describedby": undefined,
											class:
												"fixed inset-y-0 left-0 z-40 flex w-64 max-w-full flex-col bg-[var(--kit-bg-subtle)] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-[var(--kit-shadow)] [&>aside]:min-h-0 [&>aside]:flex-1",
										},
										() => [h(DialogTitle, { class: "sr-only" }, () => sidebarText.value), sidebarContent],
									),
								])
							: null,
						h("main", { class: "flex min-h-0 min-w-0 flex-1 flex-col" }, [
							renderHeader(menuToggle),
							h("div", { class: "flex min-h-0 min-w-0 flex-1" }, [
								h("div", { class: "flex min-h-0 min-w-0 flex-1 flex-col" }, [slots.default?.()]),
								mobile ? mobileAside : desktopAside,
							]),
						]),
					]),
			);
		};
	},
});
