import type { ChatAgentThread, ChatMultiAgent } from "@openagentkit/sdk/chat";
import {
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogOverlay,
	DialogPortal,
	DialogRoot,
	DialogTitle,
} from "reka-ui";
import { computed, defineComponent, h, onScopeDispose, ref, watch } from "vue";
import { format, resolveStrings, useKitLocale } from "../../kit-i18n/index.ts";
import { formatDuration, isThreadRunning, StepRows, ThreadEventStates } from "../sub-agent-card/index.ts";
import subAgentPanelStrings, { type SubAgentPanelStrings } from "./strings.ts";

export { type SubAgentPanelStrings, subAgentPanelStrings };

interface SubAgentGroup {
	name: string;
	threads: ChatAgentThread[];
}

function groupThreadsByName(threads: ChatAgentThread[]): SubAgentGroup[] {
	const groups = new Map<string, ChatAgentThread[]>();
	for (const thread of threads) {
		const list = groups.get(thread.name);
		if (list) list.push(thread);
		else groups.set(thread.name, [thread]);
	}
	return [...groups].map(([name, list]) => ({
		name,
		threads: [...list].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")),
	}));
}

function taskMeta(thread: ChatAgentThread, strings: SubAgentPanelStrings): string {
	if (isThreadRunning(thread.status)) return strings.statusRunning;
	if (thread.status === "failed") return strings.statusError;
	return thread.createdAt && thread.endedAt
		? formatDuration(Date.parse(thread.endedAt) - Date.parse(thread.createdAt))
		: "";
}

/** 右栏子 Agent 分区与执行记录弹窗。 */
export const SubAgentPanel = defineComponent({
	name: "SubAgentPanel",
	props: {
		multiAgent: { type: Object as () => ChatMultiAgent, default: undefined },
		className: { type: String, default: "" },
		strings: { type: Object as () => Partial<SubAgentPanelStrings>, default: undefined },
	},
	setup(props) {
		const strings = computed(() => resolveStrings(subAgentPanelStrings, useKitLocale(), props.strings));
		const dialog = ref<{ open: boolean; threadId: string | null }>({ open: false, threadId: null });
		const groups = computed(() => (props.multiAgent ? groupThreadsByName(props.multiAgent.threads) : []));
		const active = computed(() =>
			props.multiAgent && dialog.value.threadId
				? props.multiAgent.threads.find((item) => item.id === dialog.value.threadId)
				: undefined,
		);
		const now = ref(Date.now());
		let timer: number | undefined;
		const running = computed(() => Boolean(active.value && isThreadRunning(active.value.status)));
		watch(
			[() => dialog.value.open, running],
			() => {
				window.clearInterval(timer);
				if (!dialog.value.open || !running.value) return;
				now.value = Date.now();
				timer = window.setInterval(() => (now.value = Date.now()), 1000);
			},
			{ immediate: true },
		);
		onScopeDispose(() => window.clearInterval(timer));
		watch(
			[() => dialog.value.open, active, () => props.multiAgent],
			() => {
				const thread = active.value;
				if (!dialog.value.open || !props.multiAgent || !thread) return;
				if (!thread.historyAvailable || thread.loaded || thread.loading || thread.error) return;
				void props.multiAgent.loadThreadEvents(thread.id);
			},
			{ immediate: true },
		);

		const openThread = (thread: ChatAgentThread) => {
			dialog.value = { open: true, threadId: thread.id };
			if (thread.historyAvailable && !thread.loaded && !thread.loading && !thread.error)
				void props.multiAgent?.loadThreadEvents(thread.id);
		};

		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 状态文案按失败/运行/完成分支平铺
		const dialogStatus = computed(() => {
			const thread = active.value;
			if (!thread) return "";
			if (thread.status === "failed") return strings.value.failed;
			if (isThreadRunning(thread.status)) {
				const elapsed = thread.createdAt ? formatDuration(Math.max(0, now.value - Date.parse(thread.createdAt))) : null;
				return elapsed ? format(strings.value.runningElapsed, { elapsed }) : strings.value.running;
			}
			const duration =
				thread.createdAt && thread.endedAt
					? formatDuration(Date.parse(thread.endedAt) - Date.parse(thread.createdAt))
					: null;
			return duration ? format(strings.value.completedWithDuration, { duration }) : strings.value.completed;
		});

		return () => {
			if (groups.value.length === 0) return null;
			const thread = active.value;
			return [
				h("details", { open: true, class: `kit-collapse group/subpanel mt-6 min-w-0 ${props.className}` }, [
					h(
						"summary",
						{
							class:
								"-mx-2 flex min-w-0 cursor-pointer list-none select-none items-center gap-2 rounded-[var(--kit-radius-sm)] px-2 py-1 [&::-webkit-details-marker]:hidden",
						},
						[
							h(
								"span",
								{ class: "text-[length:var(--kit-text-label)] font-medium text-[var(--kit-fg-muted)]" },
								strings.value.label,
							),
							h(
								"span",
								{ class: "text-[length:var(--kit-text-meta)] text-[var(--kit-fg-muted)]" },
								format(strings.value.dotCount, { count: groups.value.length }),
							),
							h(
								"svg",
								{
									"aria-hidden": "true",
									viewBox: "0 0 24 24",
									fill: "none",
									stroke: "currentColor",
									"stroke-width": "1.5",
									class: "ml-auto size-3.5 transition-transform group-open/subpanel:rotate-90",
								},
								[h("path", { d: "m9 6 6 6-6 6" })],
							),
						],
					),
					...groups.value.map((group) =>
						h("div", { key: group.name, class: "mt-2 min-w-0" }, [
							h(
								"div",
								{
									class:
										"flex items-center gap-2 px-1.5 py-1 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]",
								},
								[
									h("span", { class: "min-w-0 flex-1 truncate" }, group.name),
									h("span", { class: "shrink-0" }, format(strings.value.timesCount, { count: group.threads.length })),
								],
							),
							...group.threads.map((item) =>
								h(
									"button",
									{
										key: item.id,
										type: "button",
										class:
											"flex w-full min-w-0 items-center gap-2 rounded-[var(--kit-radius-sm)] px-1.5 py-1.5 text-left text-[length:var(--kit-text-label)] hover:bg-[var(--kit-bg-subtle)]",
										onClick: () => openThread(item),
									},
									[
										h("span", { class: "min-w-0 flex-1 truncate" }, item.task || strings.value.noTask),
										h(
											"span",
											{
												class: `shrink-0 text-[length:var(--kit-text-caption)] ${item.status === "failed" ? "text-[var(--kit-danger)]" : "text-[var(--kit-fg-muted)]"}`,
											},
											taskMeta(item, strings.value),
										),
									],
								),
							),
						]),
					),
				]),
				dialog.value.open && thread && props.multiAgent
					? h(
							DialogRoot,
							{
								open: true,
								"onUpdate:open": (open: boolean) => {
									if (!open) dialog.value = { ...dialog.value, open: false };
								},
							},
							() =>
								h(DialogPortal, { to: "body" }, () =>
									h(
										DialogOverlay,
										{ class: "fixed inset-0 z-50 grid place-items-center bg-[var(--kit-overlay)] p-4" },
										() =>
											h(
												DialogContent,
												{
													class:
														"flex max-h-[min(72vh,640px)] w-full max-w-[680px] flex-col rounded-[var(--kit-radius)] border border-[var(--kit-border)] bg-[var(--kit-surface)] text-[var(--kit-fg)] shadow-[var(--kit-shadow)] outline-none",
												},
												() => [
													h(
														"header",
														{
															class:
																"flex shrink-0 items-center gap-2 border-b border-[var(--kit-border-subtle)] px-5 pb-3 pt-4",
														},
														[
															h(
																DialogTitle,
																{ class: "min-w-0 truncate text-[length:var(--kit-text-heading)] font-semibold" },
																() => thread.name,
															),
															h(
																"span",
																{
																	class: `ml-auto shrink-0 text-[length:var(--kit-text-caption)] ${thread.status === "failed" ? "text-[var(--kit-danger)]" : "text-[var(--kit-fg-muted)]"}`,
																},
																dialogStatus.value,
															),
															h(DialogClose, { asChild: true }, () =>
																h(
																	"button",
																	{
																		type: "button",
																		"aria-label": strings.value.close,
																		class:
																			"grid size-6 shrink-0 place-items-center rounded-[var(--kit-radius-xs)] text-[var(--kit-fg-muted)] hover:bg-[var(--kit-bg-subtle)] hover:text-[var(--kit-fg)]",
																	},
																	"✕",
																),
															),
														],
													),
													h("div", { class: "min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-3" }, [
														h(
															DialogDescription,
															{
																class:
																	"max-h-40 overflow-y-auto pb-3 text-[length:var(--kit-text-label)] leading-[var(--kit-leading-body)] whitespace-pre-wrap",
															},
															() => [
																h("span", { class: "text-[var(--kit-fg-muted)]" }, strings.value.mainTaskPrefix),
																thread.task ?? strings.value.noTask,
															],
														),
														h(StepRows, { messages: thread.messages }),
														h(ThreadEventStates, {
															thread,
															threadId: thread.id,
															multiAgent: props.multiAgent as ChatMultiAgent,
														}),
													]),
												],
											),
									),
								),
						)
					: null,
			];
		};
	},
});
