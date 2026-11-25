import type { ChatMessage, MessagePart } from "@openagentkit/sdk/messages";
import { computed, defineComponent, h, onScopeDispose, type PropType, type Ref, ref, watch } from "vue";
import { format, resolveStrings, useKitLocale } from "../kit-i18n/index.ts";
import { Tooltip } from "../tooltip/index.ts";
import messageAnchorRailStrings, { type MessageAnchorRailStrings } from "./strings.ts";

export { type MessageAnchorRailStrings, messageAnchorRailStrings };

export interface MessageAnchorItem {
	label: string;
	summary?: string;
}

export interface MessageAnchorTurn extends MessageAnchorItem {
	messageIndex: number;
}

export function prefersReducedMotion(): boolean {
	return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function collapseText(parts: MessagePart[]): string {
	return parts
		.filter((part): part is Extract<MessagePart, { type: "text" }> => part.type === "text")
		.map((part) => part.text)
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();
}

function truncate(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max)}…` : text;
}

function turnSummary(
	messages: ChatMessage[],
	start: number,
	end: number,
	strings: MessageAnchorRailStrings,
): string | undefined {
	let text: string | undefined;
	let tools = 0;
	for (let index = start; index < end; index += 1) {
		const reply = messages[index];
		if (reply?.role !== "assistant") continue;
		if (!text) {
			const found = collapseText(reply.parts);
			if (found) text = found;
		}
		tools += reply.parts.filter((part) => part.type === "tool").length;
	}
	if (text) return truncate(text, 80);
	return tools > 0 ? format(strings.toolsCount, { count: tools }) : undefined;
}

/** 回合推导：每条用户消息开启一个回合。 */
export function deriveAnchorTurns(
	messages: ChatMessage[],
	strings: MessageAnchorRailStrings = messageAnchorRailStrings["zh-CN"],
): MessageAnchorTurn[] {
	const turns: MessageAnchorTurn[] = [];
	for (const [messageIndex, message] of messages.entries()) {
		if (message.role !== "user") continue;
		const text = collapseText(message.parts);
		turns.push({
			messageIndex,
			label: text ? truncate(text, 60) : message.parts.length > 0 ? strings.attachmentMessage : strings.newTurn,
		});
	}
	turns.forEach((turn, index) => {
		turn.summary = turnSummary(
			messages,
			turn.messageIndex + 1,
			turns[index + 1]?.messageIndex ?? messages.length,
			strings,
		);
	});
	return turns;
}

const BAR_TRANSITION =
	"transition-[width,background-color] duration-[var(--kit-duration-fast)] ease-[var(--kit-ease-out)] motion-reduce:transition-none";

/** 会话锚点栏：右缘刻度，悬停/聚焦显示「标题 + 摘要」，点击交给 onSelect。 */
export const MessageAnchorRail = defineComponent({
	name: "MessageAnchorRail",
	props: {
		items: { type: Array as () => readonly MessageAnchorItem[], required: true },
		activeIndex: { type: Number, default: 0 },
		onSelect: { type: Function as PropType<(index: number) => void>, default: undefined },
		className: { type: String, default: "" },
		strings: { type: Object as () => Partial<MessageAnchorRailStrings>, default: undefined },
	},
	setup(props) {
		const strings = computed(() => resolveStrings(messageAnchorRailStrings, useKitLocale(), props.strings));
		return () => {
			if (props.items.length < 2) return null;
			return h(
				"nav",
				{
					"aria-label": strings.value.railAria,
					class: `pointer-events-none absolute inset-y-0 right-2 z-10 flex w-[26px] flex-col justify-center max-md:hidden ${props.className}`,
				},
				props.items.map((item, index) => {
					const active = index === props.activeIndex;
					return h(
						Tooltip,
						{ side: "left", className: "group pointer-events-auto relative block w-full shrink cursor-pointer" },
						{
							default: () =>
								h(
									"button",
									{
										type: "button",
										"aria-label": format(strings.value.turnAria, { index: index + 1, label: item.label }),
										"aria-current": active || undefined,
										class: "relative block h-4 w-full cursor-pointer border-0 bg-transparent p-0",
										onClick: () => props.onSelect?.(index),
									},
									[
										h("span", {
											"aria-hidden": "true",
											class: `absolute top-1/2 right-1.5 h-0.5 -translate-y-1/2 rounded-full ${BAR_TRANSITION} ${
												active
													? "w-[18px] bg-[var(--kit-fg)]"
													: "w-3 bg-[var(--kit-border)] group-hover:w-4 group-hover:bg-[var(--kit-fg-muted)] group-focus-visible:w-4 group-focus-visible:bg-[var(--kit-fg-muted)]"
											}`,
										}),
									],
								),
							content: () =>
								h("span", { class: "block" }, [
									h("span", { class: "block font-medium" }, item.label),
									item.summary ? h("span", { class: "mt-1 block text-[var(--kit-fg-muted)]" }, item.summary) : null,
								]),
						},
					);
				}),
			);
		};
	},
});

function activeTurnIndex(
	viewport: HTMLElement,
	children: HTMLCollection | undefined,
	turns: readonly MessageAnchorTurn[],
): number {
	if (Math.ceil(viewport.scrollTop + viewport.clientHeight) >= viewport.scrollHeight) return turns.length - 1;
	const mid = viewport.getBoundingClientRect().top + viewport.clientHeight * 0.35;
	let current = 0;
	for (let index = 0; index < turns.length; index += 1) {
		const element = turns[index] ? children?.[turns[index]!.messageIndex] : undefined;
		if (!element) break;
		if (element.getBoundingClientRect().top > mid) break;
		current = index;
	}
	return current;
}

function activeTurnIndexFromOffsets(
	viewport: HTMLElement,
	turns: readonly MessageAnchorTurn[],
	offsets: readonly number[],
): number {
	if (Math.ceil(viewport.scrollTop + viewport.clientHeight) >= viewport.scrollHeight) return turns.length - 1;
	const line = viewport.scrollTop + viewport.clientHeight * 0.35;
	let current = 0;
	for (const [index, turn] of turns.entries()) {
		const top = offsets[turn.messageIndex];
		if (top === undefined || top > line) break;
		current = index;
	}
	return current;
}

/** 锚点栏与滚动容器联动；offsets 存在时按行顶偏移定位。 */
export function useAnchorRailSync(
	viewport: Ref<HTMLElement | null>,
	content: Ref<HTMLElement | null>,
	turns: Ref<readonly MessageAnchorTurn[]>,
	enabled: Ref<boolean>,
	offsets?: Ref<number[] | null>,
) {
	const activeIndex = ref(0);
	let frame = 0;
	const sync = () => {
		if (frame) cancelAnimationFrame(frame);
		frame = requestAnimationFrame(() => {
			frame = 0;
			const element = viewport.value;
			if (!enabled.value || !element || turns.value.length === 0) return;
			const list = offsets?.value;
			activeIndex.value = list
				? activeTurnIndexFromOffsets(element, turns.value, list)
				: activeTurnIndex(element, content.value?.children, turns.value);
		});
	};
	const start = () => {
		const element = viewport.value;
		if (!enabled.value || !element) return;
		sync();
		element.addEventListener("scroll", sync, { passive: true });
		window.addEventListener("resize", sync);
	};
	watch([viewport, enabled], start, { immediate: true });
	onScopeDispose(() => {
		viewport.value?.removeEventListener("scroll", sync);
		window.removeEventListener("resize", sync);
		if (frame) cancelAnimationFrame(frame);
	});
	const jumpTo = (turnIndex: number) => {
		const element = viewport.value;
		const turn = turns.value[turnIndex];
		if (!element || !turn) return;
		const offsetTop = offsets?.value?.[turn.messageIndex];
		if (offsetTop !== undefined) {
			element.scrollTo({ top: Math.max(0, offsetTop - 16), behavior: prefersReducedMotion() ? "auto" : "smooth" });
			return;
		}
		const child = content.value?.children[turn.messageIndex];
		if (!child) return;
		const top = child.getBoundingClientRect().top - element.getBoundingClientRect().top + element.scrollTop;
		element.scrollTo({ top: Math.max(0, top - 16), behavior: prefersReducedMotion() ? "auto" : "smooth" });
	};
	return { activeIndex, jumpTo };
}
