import { defineComponent, h, nextTick, onUnmounted, ref, Teleport, watch } from "vue";

export type TooltipSide = "top" | "bottom" | "left" | "right";

const GAP_PX = 8;
const VIEWPORT_MARGIN_PX = 8;
const HIDE_DELAY_MS = 150;

const SIDE_TRANSFORMS: Record<TooltipSide, string> = {
	top: `translate(-50%, calc(-100% - ${GAP_PX}px))`,
	bottom: `translate(-50%, ${GAP_PX}px)`,
	left: `translate(calc(-100% - ${GAP_PX}px), -50%)`,
	right: `translate(${GAP_PX}px, -50%)`,
};

function anchorPoint(side: TooltipSide, rect: DOMRect): { left: number; top: number } {
	switch (side) {
		case "top":
			return { left: rect.left + rect.width / 2, top: rect.top };
		case "bottom":
			return { left: rect.left + rect.width / 2, top: rect.bottom };
		case "left":
			return { left: rect.left, top: rect.top + rect.height / 2 };
		case "right":
			return { left: rect.right, top: rect.top + rect.height / 2 };
	}
}

/** 按方位解算气泡位移并夹回视口；纯函数便于单测摆位数学。 */
export function resolveTransform(
	side: TooltipSide,
	anchor: { left: number; top: number },
	width: number,
	height: number,
	viewportWidth: number,
	viewportHeight: number,
): string {
	let left: number;
	let top: number;
	switch (side) {
		case "top":
			left = anchor.left - width / 2;
			top = anchor.top - height - GAP_PX;
			break;
		case "bottom":
			left = anchor.left - width / 2;
			top = anchor.top + GAP_PX;
			break;
		case "left":
			left = anchor.left - width - GAP_PX;
			top = anchor.top - height / 2;
			break;
		case "right":
			left = anchor.left + GAP_PX;
			top = anchor.top - height / 2;
			break;
	}
	const clampedLeft = Math.min(Math.max(left, VIEWPORT_MARGIN_PX), viewportWidth - VIEWPORT_MARGIN_PX - width);
	const clampedTop = Math.min(Math.max(top, VIEWPORT_MARGIN_PX), viewportHeight - VIEWPORT_MARGIN_PX - height);
	return `translate(${clampedLeft - anchor.left}px, ${clampedTop - anchor.top}px)`;
}

/** 轻量 tooltip：触发器内联，气泡 Teleport 到 body；离开有 150ms 宽限期，可移入气泡。 */
export const Tooltip = defineComponent({
	name: "Tooltip",
	props: {
		side: { type: String as () => TooltipSide, default: "top" },
		overflowOnly: { type: Boolean, default: false },
		className: { type: String, default: undefined },
	},
	setup(props, { slots }) {
		const trigger = ref<HTMLSpanElement | null>(null);
		const bubble = ref<HTMLSpanElement | null>(null);
		const coords = ref<{ left: number; top: number } | null>(null);
		const transform = ref(SIDE_TRANSFORMS.top);
		let hideTimer: number | undefined;
		let removeScroll = () => undefined;

		const show = () => {
			window.clearTimeout(hideTimer);
			const element = trigger.value;
			if (!element || !slots.content) return;
			if (
				props.overflowOnly &&
				element.scrollWidth <= element.clientWidth &&
				element.scrollHeight <= element.clientHeight
			)
				return;
			transform.value = SIDE_TRANSFORMS[props.side];
			coords.value = anchorPoint(props.side, element.getBoundingClientRect());
		};
		const hide = () => {
			coords.value = null;
		};
		const scheduleHide = () => {
			window.clearTimeout(hideTimer);
			hideTimer = window.setTimeout(hide, HIDE_DELAY_MS);
		};

		watch(coords, async (value) => {
			removeScroll();
			removeScroll = () => undefined;
			if (!value) return;
			const onScroll = (event: Event) => {
				if (event.target instanceof Node && bubble.value?.contains(event.target)) return;
				hide();
			};
			const onResize = () => hide();
			window.addEventListener("scroll", onScroll, true);
			window.addEventListener("resize", onResize);
			removeScroll = () => {
				window.removeEventListener("scroll", onScroll, true);
				window.removeEventListener("resize", onResize);
			};
			await nextTick();
			const element = bubble.value;
			if (!element) return;
			transform.value = resolveTransform(
				props.side,
				value,
				element.offsetWidth,
				element.offsetHeight,
				window.innerWidth,
				window.innerHeight,
			);
		});
		onUnmounted(() => {
			window.clearTimeout(hideTimer);
			removeScroll();
		});

		return () =>
			h(
				"span",
				{
					ref: trigger,
					class: props.className,
					onMouseenter: show,
					onMouseleave: scheduleHide,
					onFocusin: show,
					onFocusout: scheduleHide,
				},
				[
					slots.default?.(),
					coords.value
						? h(Teleport, { to: "body" }, [
								h(
									"span",
									{
										ref: bubble,
										role: "tooltip",
										onMouseenter: show,
										onMouseleave: scheduleHide,
										class:
											"pointer-events-auto fixed z-[9999] w-max max-h-80 max-w-100 overflow-y-auto rounded-[var(--kit-radius-sm)] border border-[var(--kit-border)] bg-[var(--kit-surface)] px-3 py-2 text-start text-[length:var(--kit-text-caption)] break-words text-[var(--kit-fg)] shadow-[var(--kit-shadow)] [animation:var(--kit-animate-overlay-in)]",
										style: { left: `${coords.value.left}px`, top: `${coords.value.top}px`, transform: transform.value },
									},
									slots.content?.(),
								),
							])
						: null,
				],
			);
	},
});
