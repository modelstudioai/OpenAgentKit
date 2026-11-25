import type { MessagePart } from "@openagentkit/sdk/messages";
import { computed, defineComponent, h, onScopeDispose, ref, watch } from "vue";
import { format, resolveStrings, useKitLocale } from "../../kit-i18n/index.ts";
import { ReasoningBlock } from "../reasoning-block/index.ts";
import { ProcessDots } from "../step/index.ts";
import { ToolCallCard } from "../tool-call-card/index.ts";
import executionGroupStrings, { type ExecutionGroupStrings } from "./strings.ts";

export { type ExecutionGroupStrings, executionGroupStrings };

export type ProcessPart = Extract<MessagePart, { type: "reasoning" | "tool" }>;

export function isProcessPart(part: MessagePart): part is ProcessPart {
	return part.type === "reasoning" || part.type === "tool";
}

function formatDuration(ms: number): string {
	const total = Math.max(0, Math.floor(ms / 1000));
	if (total < 60) return `${total}s`;
	const minutes = Math.floor(total / 60);
	if (minutes < 60) return `${minutes}m${total % 60}s`;
	return `${Math.floor(minutes / 60)}h${minutes % 60}m`;
}

/** 回合执行容器：连续的思考/工具分片折成一组，一次折叠收起全部执行痕迹。 */
export const ExecutionGroup = defineComponent({
	name: "ExecutionGroup",
	props: {
		parts: { type: Array as () => ProcessPart[], required: true },
		createdAt: { type: String, default: undefined },
		messageStreaming: { type: Boolean, default: false },
		ended: { type: Boolean, default: false },
		className: { type: String, default: "" },
		strings: { type: Object as () => Partial<ExecutionGroupStrings>, default: undefined },
	},
	setup(props) {
		const strings = computed(() => resolveStrings(executionGroupStrings, useKitLocale(), props.strings));
		const now = ref(Date.now());
		const running = computed(() =>
			props.parts.some(
				(part) =>
					(part.type === "tool" && part.status === "running") ||
					(part.type === "reasoning" && part.status === "streaming"),
			),
		);
		const failed = computed(() =>
			props.parts.some(
				(part) =>
					(part.type === "tool" && part.status === "error") || (part.type === "reasoning" && part.status === "failed"),
			),
		);
		let timer: ReturnType<typeof setInterval> | undefined;
		watch(
			running,
			(on) => {
				if (timer) clearInterval(timer);
				timer = undefined;
				if (on) timer = setInterval(() => (now.value = Date.now()), 1000);
			},
			{ immediate: true },
		);
		onScopeDispose(() => {
			if (timer) clearInterval(timer);
		});
		const elapsed = computed(() => {
			const start = props.parts.find((part) => part.startedAt)?.startedAt ?? props.createdAt;
			if (!start) return null;
			const from = Date.parse(start);
			if (Number.isNaN(from)) return null;
			const end = props.parts.reduce<number>((latest, part) => {
				if (part.type !== "tool" || !part.endedAt) return latest;
				const time = Date.parse(part.endedAt);
				return Number.isNaN(time) ? latest : Math.max(latest, time);
			}, 0);
			const to = running.value ? now.value : end > 0 ? end : Number.NaN;
			if (Number.isNaN(to)) return null;
			return formatDuration(to - from);
		});
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 执行容器按头部与时间线结构平铺，与 React 版保持同一阅读顺序
		return () => {
			const label = running.value ? strings.value.running : failed.value ? strings.value.failed : strings.value.done;
			const open = running.value || (props.messageStreaming && !props.ended);
			return h(
				"details",
				{
					open,
					"aria-label": strings.value.aria,
					class: `kit-collapse group/exec my-2 min-w-0 text-[length:var(--kit-text-label)] animate-[var(--kit-animate-in)] ${props.className}`,
				},
				[
					h(
						"summary",
						{
							class:
								"flex min-w-0 cursor-pointer list-none items-center gap-2.5 rounded-[var(--kit-radius-sm)] px-2 py-1.5 text-[var(--kit-fg-muted)] transition-colors select-none hover:bg-[var(--kit-bg-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)] [&::-webkit-details-marker]:hidden",
						},
						[
							h(
								"span",
								{
									"aria-hidden": "true",
									class: `grid size-6 shrink-0 place-items-center rounded-[var(--kit-radius-icon-sm)] transition-colors ${
										running.value
											? "bg-[var(--kit-accent)]/10 text-[var(--kit-accent)]"
											: failed.value
												? "bg-[var(--kit-danger)]/10 text-[var(--kit-danger)]"
												: "bg-[var(--kit-bg-subtle)] text-[var(--kit-fg-muted)]"
									}`,
								},
								[
									h(
										"svg",
										{
											viewBox: "0 0 24 24",
											fill: "none",
											stroke: "currentColor",
											"stroke-width": "1.5",
											"aria-hidden": "true",
											class: "size-4 transition-transform group-open/exec:rotate-90",
										},
										[h("path", { "stroke-linecap": "round", "stroke-linejoin": "round", d: "m9 6 6 6-6 6" })],
									),
								],
							),
							h("span", { class: "inline-flex shrink-0 items-center gap-1 text-[var(--kit-fg)]" }, [
								running.value ? h("span", { class: "kit-shimmer-text" }, label) : label,
								running.value ? h(ProcessDots) : null,
							]),
							elapsed.value
								? h(
										"span",
										{
											class: `shrink-0 font-mono text-[length:var(--kit-text-caption)] tabular-nums ${running.value ? "kit-shimmer-text" : "text-[var(--kit-fg-muted)]"}`,
										},
										`· ${elapsed.value}`,
									)
								: null,
							h(
								"span",
								{ class: "ml-auto shrink-0 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]" },
								format(strings.value.steps, { count: props.parts.length }),
							),
						],
					),
					h("div", { class: "my-1 ml-5 border-l border-[var(--kit-border)] pl-3" }, [
						...props.parts.map((part, index) =>
							part.type === "reasoning"
								? h(ReasoningBlock, {
										key: part.id ?? `reasoning:${index}`,
										text: part.text,
										status: part.status,
									})
								: h(ToolCallCard, { key: part.id ?? `tool:${part.toolId}:${index}`, part }),
						),
					]),
				],
			);
		};
	},
});
