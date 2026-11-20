import type { ChatMultiAgent } from "@openagentkit/sdk/chat";
import type { ChatMessage } from "@openagentkit/sdk/messages";
import { skillInputTokens } from "@openagentkit/sdk/protocol";
import { computed, defineComponent, h, type PropType, ref } from "vue";
import { resolveStrings, useKitLocale } from "../kit-i18n/index.ts";
import { MessageList } from "../message-list/index.ts";
import { Sender, type SenderSelection } from "../sender/index.ts";
import { Suggestion, type SuggestionItem } from "../suggestion/index.ts";
import chatStrings, { type ChatStrings } from "./strings.ts";

export { type ChatStrings, chatStrings };

/** 对话组合：消息列表负责滚动，Sender 负责输入（H5 同包）。 */
export const Chat = defineComponent({
	name: "Chat",
	props: {
		messages: { type: Array as () => ChatMessage[], required: true },
		variant: { type: String as () => "default" | "workspace", default: "default" },
		turnRunning: { type: Boolean, default: false },
		sending: { type: Boolean, default: false },
		canSend: { type: Boolean, default: true },
		composerDisabled: { type: Boolean, default: false },
		onSend: {
			type: Function as PropType<(text: string, skills?: string[]) => void | Promise<void>>,
			default: undefined,
		},
		onStop: { type: Function as PropType<() => void | Promise<void>>, default: undefined },
		onCopy: { type: Function as PropType<(text: string) => void | Promise<void>>, default: undefined },
		scrollKey: { type: [String, null] as unknown as () => string | null, default: null },
		anchorRail: { type: Boolean, default: false },
		virtualize: { type: Boolean, default: true },
		skills: { type: Array as () => Array<{ name: string; description?: string }>, default: undefined },
		multiAgent: { type: Object as () => ChatMultiAgent, default: undefined },
		strings: { type: Object as () => Partial<ChatStrings>, default: undefined },
	},
	setup(props, { slots }) {
		const strings = computed(() => resolveStrings(chatStrings, useKitLocale(), props.strings));
		const draft = ref("");
		const selection = ref<SenderSelection>({ start: 0, end: 0 });
		const senderRef = ref<{ replaceRange: (start: number, end: number, text: string) => void } | null>(null);
		const skillNames = computed(() => props.skills?.map((skill) => skill.name) ?? []);
		const skillItems = computed<SuggestionItem[]>(() =>
			(props.skills ?? []).map((skill) => ({ label: skill.name, value: skill.name, description: skill.description })),
		);
		const awaitingFirstFrame = computed(() => {
			const last = props.messages.at(-1);
			return Boolean(props.turnRunning && last && (last.role === "user" || last.status === "streaming"));
		});
		const contentWidth = computed(() =>
			props.variant === "workspace" ? "mx-auto w-full max-w-[var(--kit-chat-width)]" : "",
		);
		const pad = computed(() =>
			props.variant === "workspace"
				? `pt-2 px-4 md:px-6${props.anchorRail ? " md:pr-12" : ""} md:pb-[max(var(--kit-space-6),env(safe-area-inset-bottom))]`
				: "border-t border-[var(--kit-border-subtle)] px-3 pt-3",
		);
		const submit = (text: string, derived?: string[]) => {
			void Promise.resolve(props.onSend?.(text.trim(), derived)).then(
				() => {
					if (draft.value === text) draft.value = "";
				},
				() => undefined,
			);
		};

		return () =>
			h("div", { class: "flex h-full min-h-0 min-w-0 flex-1 flex-col" }, [
				h(
					MessageList,
					{
						messages: props.messages,
						variant: props.variant,
						onCopy: props.onCopy,
						scrollKey: props.scrollKey,
						pending: (awaitingFirstFrame.value || props.sending) && !slots.approvals,
						pendingLabel: props.sending && !props.turnRunning ? strings.value.sending : undefined,
						anchorRail: props.anchorRail,
						virtualize: props.virtualize,
						skills: skillNames.value,
						multiAgent: props.multiAgent,
					},
					{
						empty: slots.empty,
						approvals: slots.approvals,
						attachment: slots.attachment,
						artifact: slots.artifact,
						"sub-agent": slots["sub-agent"],
						process: slots.process,
					},
				),
				slots.approvals
					? h("div", { class: `shrink-0 ${props.variant === "workspace" ? "px-4 md:px-6" : "px-3"}` }, [
							h("div", { class: contentWidth.value }, [
								h(
									"p",
									{
										class:
											"flex items-center gap-1.5 pb-2 text-[length:var(--kit-text-label)] text-[var(--kit-warning-fg)]",
									},
									[
										h("span", {
											"aria-hidden": "true",
											class: "h-1.5 w-1.5 shrink-0 rounded-full bg-current motion-safe:animate-pulse",
										}),
										strings.value.awaitingApproval,
									],
								),
							]),
						])
					: null,
				h("div", { class: `shrink-0 pb-[max(var(--kit-space-3),env(safe-area-inset-bottom))] ${pad.value}` }, [
					h("div", { class: contentWidth.value }, [
						slots.sender
							? slots.sender()
							: h(
									Suggestion,
									{
										block: true,
										items: skillItems.value,
										value: draft.value,
										caret: selection.value.end,
										trigger: props.skills?.length ? "/" : undefined,
										filter: (item: SuggestionItem, query: string) => {
											const inserted = skillInputTokens(draft.value, skillNames.value);
											return item.value.toLowerCase().startsWith(query.toLowerCase()) && !inserted.includes(item.value);
										},
										onSelect: (
											_value: string,
											item: SuggestionItem,
											context: { start: number; end: number } | undefined,
										) => {
											if (!context) return;
											const end = draft.value[context.end] === " " ? context.end + 1 : context.end;
											senderRef.value?.replaceRange(context.start, end, `/${item.value} `);
										},
									},
									{
										default: ({
											onKeyDown,
											inputProps,
										}: {
											onKeyDown: (event: KeyboardEvent) => void;
											inputProps: Record<string, unknown>;
										}) =>
											h(Sender, {
												ref: senderRef,
												variant: props.variant,
												value: draft.value,
												"onUpdate:value": (next: string) => {
													draft.value = next;
												},
												onSelectionChange: (next: SenderSelection) => {
													selection.value = next;
												},
												loading: props.turnRunning,
												disabled: props.composerDisabled,
												submitDisabled: !props.canSend,
												skills: props.skills,
												inputProps,
												onKeyDown,
												onSubmit: submit,
												onCancel: () => void props.onStop?.(),
											}),
									},
								),
					]),
				]),
			]);
	},
});
