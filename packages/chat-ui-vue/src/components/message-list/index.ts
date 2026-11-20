import type { ChatMessage } from "@openagentkit/sdk/messages";
import { computed, defineComponent, h, nextTick, onMounted, onScopeDispose, type PropType, ref, watch } from "vue";
import { resolveStrings, useKitLocale } from "../kit-i18n/index.ts";
import { Message } from "../message/index.ts";
import {
	deriveAnchorTurns,
	MessageAnchorRail,
	prefersReducedMotion,
	useAnchorRailSync,
} from "../message-anchor-rail/index.ts";
import messageListStrings, { type MessageListStrings } from "./strings.ts";

export { type MessageListStrings, messageListStrings };

const VIRTUALIZE_THRESHOLD = 24;
const VIRTUAL_OVERSCAN = 6;
const INITIAL_WINDOW = 60;
const ROW_HEIGHT_ESTIMATE = 160;

export interface VirtualSlice {
	start: number;
	end: number;
}

export function rowOffsets(messages: ChatMessage[], heights: Map<string, number>, gap: number): number[] {
	const offsets = new Array<number>(messages.length + 1);
	let top = 0;
	for (const [index, message] of messages.entries()) {
		offsets[index] = top;
		top += (heights.get(message.id) ?? ROW_HEIGHT_ESTIMATE) + gap;
	}
	offsets[messages.length] = top;
	return offsets;
}

export function windowSlice(offsets: readonly number[], top: number, viewportHeight: number): VirtualSlice {
	const len = offsets.length - 1;
	let low = 0;
	let high = len;
	while (low < high) {
		const mid = (low + high) >> 1;
		if ((offsets[mid + 1] ?? 0) <= top) low = mid + 1;
		else high = mid;
	}
	const start = Math.max(0, low - VIRTUAL_OVERSCAN);
	const bottom = top + viewportHeight;
	low = 0;
	high = len;
	while (low < high) {
		const mid = (low + high) >> 1;
		if ((offsets[mid] ?? 0) < bottom) low = mid + 1;
		else high = mid;
	}
	return { start, end: Math.min(len, low + VIRTUAL_OVERSCAN) };
}

/** 独立消息列表：滚动只作用于自身；用户上翻后暂停跟随，回到底部恢复。 */
export const MessageList = defineComponent({
	name: "MessageList",
	props: {
		messages: { type: Array as () => ChatMessage[], required: true },
		variant: { type: String as () => "default" | "workspace", default: "default" },
		onCopy: { type: Function as PropType<(text: string) => void | Promise<void>>, default: undefined },
		autoScroll: { type: Boolean, default: true },
		className: { type: String, default: undefined },
		scrollKey: { type: [String, null] as unknown as () => string | null, default: null },
		active: { type: Boolean, default: true },
		historyCursor: { type: [String, null] as unknown as () => string | null, default: null },
		pending: { type: Boolean, default: false },
		pendingLabel: { type: String, default: undefined },
		anchorRail: { type: Boolean, default: false },
		virtualize: { type: Boolean, default: true },
		skills: { type: Array as () => string[], default: undefined },
		strings: { type: Object as () => Partial<MessageListStrings>, default: undefined },
	},
	setup(props, { slots }) {
		const strings = computed(() => resolveStrings(messageListStrings, useKitLocale(), props.strings));
		const viewport = ref<HTMLElement | null>(null);
		const content = ref<HTMLDivElement | null>(null);
		const following = ref(true);
		const atBottom = ref(true);
		const heights = new Map<string, number>();
		const layout = ref<{ top: number; viewport: number; gap: number } | null>(null);
		const tick = ref(0);
		const offsetsRef = ref<number[] | null>(null);
		const enabled = computed(() => props.virtualize && props.messages.length > VIRTUALIZE_THRESHOLD);
		const anchorTurns = computed(() => (props.anchorRail ? deriveAnchorTurns(props.messages) : []));
		let frame = 0;
		let observer: ResizeObserver | null = null;

		const rowOffsetsNow = () => rowOffsets(props.messages, heights, layout.value?.gap ?? 0);
		const derived = computed(() => {
			tick.value;
			if (!enabled.value) return null;
			const offsets = rowOffsetsNow();
			const slice = layout.value
				? windowSlice(offsets, layout.value.top, layout.value.viewport)
				: { start: Math.max(0, props.messages.length - INITIAL_WINDOW), end: props.messages.length };
			const gap = layout.value?.gap ?? 0;
			const topPad = slice.start > 0 ? Math.max(0, (offsets[slice.start] ?? 0) - gap) : 0;
			const bottomPad =
				slice.end < props.messages.length
					? Math.max(0, (offsets[props.messages.length] ?? 0) - (offsets[slice.end] ?? 0) - gap)
					: 0;
			offsetsRef.value = offsets;
			return { slice, topPad, bottomPad };
		});

		const scheduleLayout = () => {
			if (frame) return;
			frame = requestAnimationFrame(() => {
				frame = 0;
				const element = viewport.value;
				if (!element || element.clientHeight === 0) return;
				const gap = content.value ? Number.parseFloat(getComputedStyle(content.value).rowGap) || 0 : 0;
				layout.value = { top: element.scrollTop, viewport: element.clientHeight, gap };
			});
		};

		const watchRow = (id: string, element: Element | null) => {
			if (!element || !enabled.value || !observer) return;
			const row = element as HTMLElement;
			row.dataset.kitVirtualId = id;
			observer.observe(row);
		};

		const onScroll = () => {
			if (!props.active) return;
			scheduleLayout();
			const element = viewport.value;
			if (!element) return;
			const empty = props.messages.length === 0;
			const next = empty
				? element.scrollTop <= 0
				: Math.ceil(element.scrollTop + element.clientHeight) >= element.scrollHeight;
			following.value = next;
			atBottom.value = next;
		};

		const scrollToBottom = () => {
			const element = viewport.value;
			if (!element) return;
			element.scrollTo({ top: element.scrollHeight, behavior: prefersReducedMotion() ? "auto" : "smooth" });
		};

		const follow = async () => {
			if (!props.active || !props.autoScroll) return;
			await nextTick();
			const element = viewport.value;
			if (element && following.value) {
				element.scrollTop = props.messages.length === 0 ? 0 : element.scrollHeight;
			}
			scheduleLayout();
		};
		watch(
			() => [props.messages, props.scrollKey] as const,
			() => {
				if (props.scrollKey) following.value = true;
				void follow();
			},
			{ flush: "post" },
		);
		watch(
			() => props.scrollKey,
			() => {
				heights.clear();
				following.value = true;
				tick.value += 1;
				void follow();
			},
		);

		onMounted(() => {
			if (typeof ResizeObserver === "undefined") return;
			// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 行高回写按测量顺序平铺，拆分反而割裂阅读顺序
			observer = new ResizeObserver((entries) => {
				const element = viewport.value;
				if (!element) return;
				const top = element.getBoundingClientRect().top;
				let changed = false;
				for (const entry of entries) {
					const row = entry.target as HTMLElement;
					const id = row.dataset.kitVirtualId;
					if (!id) continue;
					const height = row.offsetHeight;
					const previous = heights.get(id) ?? ROW_HEIGHT_ESTIMATE;
					if (height === previous) continue;
					if (row.getBoundingClientRect().bottom <= top) element.scrollTop += height - previous;
					heights.set(id, height);
					changed = true;
				}
				if (changed) {
					tick.value += 1;
					scheduleLayout();
				}
			});
			const element = viewport.value;
			if (element) observer.observe(element);
			const forward = new ResizeObserver(() => {
				if (following.value && viewport.value) scrollToBottom();
			});
			if (content.value) forward.observe(content.value);
			onScopeDispose(() => forward.disconnect());
			void follow();
		});
		onScopeDispose(() => {
			observer?.disconnect();
			if (frame) cancelAnimationFrame(frame);
		});

		const { activeIndex, jumpTo } = useAnchorRailSync(
			viewport,
			content,
			anchorTurns,
			computed(() => props.anchorRail),
			offsetsRef,
		);

		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 视图组合按 DOM 结构平铺，与 React 版保持同一阅读顺序
		return () => {
			const empty = props.messages.length === 0;
			const slice = derived.value;
			const rows = slice ? props.messages.slice(slice.slice.start, slice.slice.end) : props.messages;
			const rowNodes = rows.map((message) => {
				const node = h(
					Message,
					{
						message,
						variant: props.variant,
						onCopy: props.onCopy,
						skills: props.skills,
					},
					{
						attachment: slots.attachment,
						artifact: slots.artifact,
						"sub-agent": slots["sub-agent"],
						process: slots.process,
					},
				);
				if (!slice) return node;
				return h(
					"div",
					{
						key: message.id,
						onVnodeMounted: (vnode) => watchRow(message.id, (vnode.el as Element) ?? null),
					},
					[node],
				);
			});
			return h("div", { class: "relative flex min-h-0 min-w-0 flex-1 flex-col" }, [
				h(
					"section",
					{
						ref: viewport,
						"aria-label": strings.value.listAriaLabel,
						class: `min-h-0 min-w-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
							props.variant === "workspace" ? `px-4 md:px-6${props.anchorRail ? " md:pr-12" : ""}` : "p-4 pb-2"
						}${props.className ? ` ${props.className}` : ""}`,
						onScroll,
					},
					[
						h(
							"div",
							{
								ref: content,
								class: `flex min-h-full min-w-0 flex-col ${
									props.variant === "workspace"
										? "mx-auto w-full max-w-[var(--kit-chat-width)] gap-6 pt-6 pb-5 md:gap-8 md:pt-8"
										: "gap-1"
								}`,
							},
							[
								empty
									? slots.empty?.()
									: [
											slice && slice.slice.start > 0
												? h("div", { "aria-hidden": "true", style: { height: `${slice.topPad}px` } })
												: null,
											...rowNodes,
											slice && slice.slice.end < props.messages.length
												? h("div", { "aria-hidden": "true", style: { height: `${slice.bottomPad}px` } })
												: null,
										],
								slots.approvals
									? h("div", { class: props.variant === "workspace" ? "mb-6" : "my-2" }, [slots.approvals()])
									: null,
								props.pending
									? h(
											"div",
											{
												role: "status",
												class: "my-2 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]",
											},
											props.pendingLabel ?? "…",
										)
									: null,
							],
						),
					],
				),
				props.anchorRail
					? h(MessageAnchorRail, {
							items: anchorTurns.value,
							activeIndex: activeIndex.value,
							onSelect: jumpTo,
						})
					: null,
				atBottom.value || empty
					? null
					: h(
							"button",
							{
								type: "button",
								"aria-label": strings.value.backToBottom,
								class:
									"absolute bottom-2 left-1/2 z-10 grid size-8 -translate-x-1/2 place-items-center rounded-full border border-[var(--kit-border)] bg-[var(--kit-surface)] text-[var(--kit-fg-muted)] shadow-[var(--kit-shadow)] hover:bg-[var(--kit-bg-subtle)]",
								onClick: scrollToBottom,
							},
							"↓",
						),
			]);
		};
	},
});
