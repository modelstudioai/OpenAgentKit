import type { ChatAgentThread, ChatMultiAgent } from "@openagentkit/sdk/chat";
import type { ChatMessage, MessagePart } from "@openagentkit/sdk/messages";
import { computed, defineComponent, h, onScopeDispose, type PropType, ref, watch } from "vue";
import { format, resolveStrings, useKitLocale } from "../../kit-i18n/index.ts";
import { Markdown } from "../../markdown/index.ts";
import { ReasoningBlock } from "../reasoning-block/index.ts";
import { ToolCallCard } from "../tool-call-card/index.ts";
import subAgentCardStrings, { type SubAgentCardStrings } from "./strings.ts";

export { type SubAgentCardStrings, subAgentCardStrings };

export function formatDuration(ms: number): string {
	const total = Math.max(0, Math.floor(ms / 1000));
	if (total < 60) return `${total}s`;
	const minutes = Math.floor(total / 60);
	if (minutes < 60) return `${minutes}m${total % 60}s`;
	return `${Math.floor(minutes / 60)}h${minutes % 60}m`;
}

const TERMINAL = new Set(["idle", "terminated"]);
export function isThreadRunning(status: string | null): boolean {
	return status !== "failed" && !TERMINAL.has(status ?? "");
}

type ArtifactPart = Extract<MessagePart, { type: "artifact" }>;

function ArtifactRow(props: {
	artifact: ArtifactPart["artifact"];
	onArtifactOpen?: (fileId: string, contentType?: string) => void;
	onArtifactDownload?: (fileId: string) => void;
}) {
	const name = props.artifact.filename ?? props.artifact.file_id;
	return h(
		"div",
		{
			class:
				"my-1 flex w-56 max-w-full items-center gap-2 rounded-[var(--kit-radius-sm)] border border-[var(--kit-border)] bg-[var(--kit-bg-subtle)] p-2",
		},
		[
			h(
				"span",
				{
					"aria-hidden": "true",
					class:
						"grid h-8 w-8 shrink-0 place-items-center rounded bg-[var(--kit-surface)] text-[9px] font-semibold text-[var(--kit-fg-muted)]",
				},
				"FILE",
			),
			props.onArtifactOpen
				? h(
						"button",
						{
							type: "button",
							class: "min-w-0 flex-1 truncate text-left text-[length:var(--kit-text-label)]",
							onClick: () => props.onArtifactOpen?.(props.artifact.file_id, props.artifact.content_type),
						},
						name,
					)
				: h("span", { class: "min-w-0 flex-1 truncate text-[length:var(--kit-text-label)]" }, name),
			props.onArtifactDownload
				? h(
						"button",
						{
							type: "button",
							"aria-label": name,
							class:
								"grid size-7 shrink-0 place-items-center rounded text-[var(--kit-fg-muted)] hover:bg-[var(--kit-bg-subtle)]",
							onClick: () => props.onArtifactDownload?.(props.artifact.file_id),
						},
						"↓",
					)
				: null,
		],
	);
}

/** 子线程时间线：思考、工具、正文与产物按消息分片顺序展开。 */
export const StepRows = defineComponent({
	name: "SubAgentStepRows",
	props: {
		messages: { type: Array as () => ChatMessage[], required: true },
		onArtifactOpen: { type: Function as PropType<(fileId: string, contentType?: string) => void>, default: undefined },
		onArtifactDownload: { type: Function as PropType<(fileId: string) => void>, default: undefined },
	},
	setup(props) {
		return () => {
			const rows = props.messages.flatMap((message) =>
				message.parts.map((part, index) => ({ part, key: part.id ?? `${message.id}:${index}` })),
			);
			// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 分片按协议类型平铺，与 React 版保持同一顺序
			return rows.map(({ part, key }) => {
				if (part.type === "reasoning") return h(ReasoningBlock, { key, text: part.text, status: part.status });
				if (part.type === "tool") return h(ToolCallCard, { key, part });
				if (part.type === "artifact")
					return h(ArtifactRow, {
						key,
						artifact: part.artifact,
						onArtifactOpen: props.onArtifactOpen,
						onArtifactDownload: props.onArtifactDownload,
					});
				if (part.type === "status")
					return h(
						"p",
						{ key, class: "px-2 py-1.5 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]" },
						part.text,
					);
				if (part.type === "text" && part.text.trim())
					return h("div", { key, class: "px-2 py-1.5" }, [h(Markdown, null, () => part.text)]);
				return null;
			});
		};
	},
});

export const ThreadEventStates = defineComponent({
	name: "ThreadEventStates",
	props: {
		thread: { type: Object as () => ChatAgentThread, required: true },
		threadId: { type: String, required: true },
		multiAgent: { type: Object as () => ChatMultiAgent, required: true },
		strings: { type: Object as () => Partial<SubAgentCardStrings>, default: undefined },
	},
	setup(props) {
		const strings = computed(() => resolveStrings(subAgentCardStrings, useKitLocale(), props.strings));
		const loadMoreClass =
			"rounded-[var(--kit-radius-sm)] px-2 py-1 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)] hover:bg-[var(--kit-bg-subtle)] hover:text-[var(--kit-fg)] disabled:cursor-not-allowed disabled:opacity-50";
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 加载、空态、错误与翻页按状态平铺
		return () => {
			const thread = props.thread;
			return [
				thread.error
					? h("p", { role: "alert", class: "flex flex-wrap items-center gap-2 px-2 py-1.5 text-[var(--kit-danger)]" }, [
							format(strings.value.loadFailed, { message: thread.error }),
							h(
								"button",
								{
									type: "button",
									disabled: thread.loading,
									class: loadMoreClass,
									onClick: () => void props.multiAgent.loadThreadEvents(props.threadId, { retry: true }),
								},
								strings.value.retry,
							),
						])
					: null,
				!thread.loaded && thread.loading
					? h("p", { role: "status", class: "px-2 py-1.5 text-[var(--kit-fg-muted)]" }, strings.value.loadingMessages)
					: null,
				thread.loaded && thread.messages.length === 0
					? h(
							"p",
							{ class: "px-2 py-1.5 text-[var(--kit-fg-muted)]" },
							thread.historyAvailable ? strings.value.noMessages : strings.value.currentConnectionOnly,
						)
					: null,
				thread.nextPageToken
					? h(
							"button",
							{
								type: "button",
								disabled: thread.loading,
								class: `ml-2 ${loadMoreClass}`,
								onClick: () => void props.multiAgent.loadThreadEvents(props.threadId, { more: true }),
							},
							thread.loading ? strings.value.loadingMessages : strings.value.loadEarlier,
						)
					: null,
			];
		};
	},
});

function HeadStatus(props: {
	status: string | null;
	elapsed: string | null;
	duration: string | null;
	strings: SubAgentCardStrings;
}) {
	const failed = props.status === "failed";
	const done = !failed && TERMINAL.has(props.status ?? "");
	const label = failed
		? props.strings.failed
		: done
			? props.duration
				? format(props.strings.completedWithDuration, { duration: props.duration })
				: props.strings.completed
			: props.elapsed
				? format(props.strings.runningElapsed, { elapsed: props.elapsed })
				: props.strings.running;
	return h(
		"span",
		{
			class: `shrink-0 text-[length:var(--kit-text-caption)] ${failed ? "text-[var(--kit-danger)]" : "text-[var(--kit-fg-muted)]"}`,
		},
		format(props.strings.dotPrefix, { label }),
	);
}

/** 主消息流中的子 Agent 卡：运行中展开并加载历史，完成后可手动展开。 */
export const SubAgentCard = defineComponent({
	name: "SubAgentCard",
	props: {
		threadId: { type: String, required: true },
		multiAgent: { type: Object as () => ChatMultiAgent, default: undefined },
		onArtifactOpen: { type: Function as PropType<(fileId: string, contentType?: string) => void>, default: undefined },
		onArtifactDownload: { type: Function as PropType<(fileId: string) => void>, default: undefined },
		strings: { type: Object as () => Partial<SubAgentCardStrings>, default: undefined },
	},
	setup(props) {
		const strings = computed(() => resolveStrings(subAgentCardStrings, useKitLocale(), props.strings));
		const thread = computed(() => props.multiAgent?.threads.find((item) => item.id === props.threadId));
		const running = computed(() => Boolean(thread.value && isThreadRunning(thread.value.status)));
		const now = ref(Date.now());
		let timer: number | undefined;
		watch(
			running,
			(value) => {
				window.clearInterval(timer);
				if (!value) return;
				now.value = Date.now();
				timer = window.setInterval(() => (now.value = Date.now()), 1000);
			},
			{ immediate: true },
		);
		onScopeDispose(() => window.clearInterval(timer));
		watch(
			[() => props.multiAgent, thread, running],
			() => {
				const current = thread.value;
				if (!props.multiAgent || !current || !running.value) return;
				if (!current.historyAvailable || current.loaded || current.loading || current.error) return;
				void props.multiAgent.loadThreadEvents(props.threadId);
			},
			{ immediate: true },
		);

		return () => {
			const current = thread.value;
			if (!props.multiAgent || !current) return null;
			const duration =
				current.createdAt && current.endedAt
					? formatDuration(Date.parse(current.endedAt) - Date.parse(current.createdAt))
					: null;
			const elapsed =
				running.value && current.createdAt
					? formatDuration(Math.max(0, now.value - Date.parse(current.createdAt)))
					: null;
			return h(
				"details",
				{
					open: running.value,
					"aria-label": format(strings.value.aria, { name: current.name }),
					class:
						"kit-collapse group/sub my-1 min-w-0 text-[length:var(--kit-text-label)] [animation:var(--kit-animate-in)]",
					onToggle: (event: Event) => {
						const target = event.currentTarget as HTMLDetailsElement;
						if (!target.open || !current.historyAvailable || current.loaded || current.loading || current.error) return;
						void props.multiAgent?.loadThreadEvents(props.threadId);
					},
				},
				[
					h(
						"summary",
						{
							class:
								"flex min-w-0 cursor-pointer list-none items-center gap-5 rounded-[var(--kit-radius-sm)] px-2 py-1.5 text-[var(--kit-fg-muted)] transition-colors select-none hover:bg-[var(--kit-bg-subtle)] [&::-webkit-details-marker]:hidden",
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
									class: `size-4.5 shrink-0 ${running.value ? "text-[var(--kit-accent)]" : "text-[var(--kit-fg-muted)]"}`,
								},
								[
									h("path", { "stroke-linecap": "round", "stroke-linejoin": "round", d: "M12 8V4H8" }),
									h("rect", { x: "4", y: "8", width: "16", height: "12", rx: "2" }),
									h("path", {
										"stroke-linecap": "round",
										"stroke-linejoin": "round",
										d: "M2 14h2M20 14h2M15 13v2M9 13v2",
									}),
								],
							),
							h(
								"span",
								{
									class:
										"shrink-0 rounded-[var(--kit-radius-xs)] border border-[var(--kit-border)] px-1.5 py-px text-[length:var(--kit-text-caption)]",
								},
								strings.value.label,
							),
							h(
								"span",
								{ class: "min-w-0 truncate text-[var(--kit-fg)]" },
								`${current.name}${current.task ? format(strings.value.taskSuffix, { task: current.task }) : ""}`,
							),
							h(HeadStatus, { status: current.status, elapsed, duration, strings: strings.value }),
							h(
								"svg",
								{
									viewBox: "0 0 24 24",
									fill: "none",
									stroke: "currentColor",
									"stroke-width": "1.5",
									"aria-hidden": "true",
									class: "size-4 shrink-0 text-[var(--kit-fg-muted)] transition-transform group-open/sub:rotate-180",
								},
								[h("path", { "stroke-linecap": "round", "stroke-linejoin": "round", d: "m6 9 6 6 6-6" })],
							),
						],
					),
					h(
						"div",
						{
							class: "mt-0.5 mb-1 ml-5 max-h-[var(--kit-sub-agent-body-height)] min-w-0 overflow-y-auto pl-3",
						},
						[
							current.task
								? h(
										"p",
										{
											class:
												"px-2 py-1.5 text-[length:var(--kit-text-label)] leading-[var(--kit-leading-body)] whitespace-pre-wrap",
										},
										[h("span", { class: "text-[var(--kit-fg-muted)]" }, strings.value.mainTaskPrefix), current.task],
									)
								: null,
							h(StepRows, {
								messages: current.messages,
								onArtifactOpen: props.onArtifactOpen,
								onArtifactDownload: props.onArtifactDownload,
							}),
							h(ThreadEventStates, {
								thread: current,
								threadId: props.threadId,
								multiAgent: props.multiAgent,
								strings: strings.value,
							}),
						],
					),
				],
			);
		};
	},
});
