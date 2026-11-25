import type { ChatToolApproval } from "@openagentkit/sdk/chat";
import type { ToolApprovalDecision } from "@openagentkit/sdk/protocol";
import { computed, defineComponent, h, type PropType, ref } from "vue";
import { format, resolveStrings, useKitLocale } from "../kit-i18n/index.ts";
import toolApprovalCardStrings, { type ToolApprovalCardStrings } from "./strings.ts";

export { type ToolApprovalCardStrings, toolApprovalCardStrings };

const BUTTON =
	"rounded-[var(--kit-radius-sm)] border border-[var(--kit-border)] px-3 py-1.5 text-[length:var(--kit-text-label)] disabled:cursor-not-allowed disabled:opacity-50";
const ACCENT_BUTTON =
	"rounded-[var(--kit-radius-sm)] bg-[var(--kit-accent)] px-3 py-1.5 font-semibold text-[length:var(--kit-text-label)] text-[var(--kit-accent-fg)] disabled:cursor-not-allowed disabled:opacity-70";
const QUIET_BUTTON =
	"rounded-[var(--kit-radius-sm)] px-2 py-1 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)] transition-colors hover:text-[var(--kit-fg)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]";

function serialize(value: unknown, strings: ToolApprovalCardStrings): string {
	try {
		return JSON.stringify(value, null, 2) ?? strings.noParams;
	} catch {
		return strings.paramError;
	}
}

function paramSummary(args: unknown): string | undefined {
	const truncate = (text: string) => {
		const compact = text.replace(/\s+/g, " ").trim();
		return compact.length > 40 ? `${compact.slice(0, 40)}…` : compact;
	};
	if (!args || typeof args !== "object" || Array.isArray(args))
		return typeof args === "string" && args.trim() ? truncate(args) : undefined;
	for (const [key, value] of Object.entries(args)) {
		if (typeof value === "string" && value.length > 0) return `${key}: ${truncate(value)}`;
	}
	return undefined;
}

/** HITL 审批卡：允许与拒绝都一步直提；结果不明或过期时提供刷新入口。 */
export const ToolApprovalCard = defineComponent({
	name: "ToolApprovalCard",
	props: {
		approval: { type: Object as () => ChatToolApproval, required: true },
		onDecision: { type: Function as PropType<(decision: ToolApprovalDecision) => Promise<void>>, required: true },
		onRefresh: { type: Function as PropType<() => Promise<void>>, required: true },
		onStop: { type: Function as PropType<() => void>, default: undefined },
		strings: { type: Object as () => Partial<ToolApprovalCardStrings>, default: undefined },
	},
	setup(props) {
		const strings = computed(() => resolveStrings(toolApprovalCardStrings, useKitLocale(), props.strings));
		const busy = ref(false);
		const error = ref<string | null>(null);
		const decide = async (result: "allow" | "deny") => {
			if (busy.value) return;
			busy.value = true;
			error.value = null;
			try {
				await props.onDecision({ batch_id: props.approval.batch_id, call_id: props.approval.call_id, result });
			} catch (cause) {
				error.value = cause instanceof Error ? cause.message : strings.value.submitFailed;
			} finally {
				busy.value = false;
			}
		};
		const refresh = async () => {
			busy.value = true;
			error.value = null;
			try {
				await props.onRefresh();
			} catch (cause) {
				error.value = cause instanceof Error ? cause.message : strings.value.refreshFailed;
			} finally {
				busy.value = false;
			}
		};
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 审批卡按头部、参数、动作结构平铺，与 React 版保持同一阅读顺序
		return () => {
			const approval = props.approval;
			const parameters = serialize(approval.arguments, strings.value);
			const summary = paramSummary(approval.arguments);
			const actionable = approval.actionable && approval.status === "pending";
			const actions = actionable
				? h("div", { class: "mt-3 flex items-center justify-end gap-2" }, [
						h(
							"button",
							{ type: "button", class: BUTTON, disabled: busy.value, onClick: () => void decide("deny") },
							strings.value.deny,
						),
						h(
							"button",
							{ type: "button", class: ACCENT_BUTTON, disabled: busy.value, onClick: () => void decide("allow") },
							busy.value ? strings.value.submitting : strings.value.allow,
						),
					])
				: h("div", { class: "mt-3 flex items-center justify-end gap-2" }, [
						!approval.actionable && props.onStop
							? h(
									"button",
									{ type: "button", class: QUIET_BUTTON, onClick: () => props.onStop?.() },
									strings.value.stop,
								)
							: null,
						approval.status === "uncertain" || approval.status === "stale"
							? h(
									"button",
									{ type: "button", class: QUIET_BUTTON, disabled: busy.value, onClick: () => void refresh() },
									busy.value ? strings.value.refreshing : strings.value.refresh,
								)
							: null,
					]);
			return h(
				"section",
				{
					"aria-label": format(strings.value.aria, { name: approval.name }),
					class:
						"my-2 min-w-0 rounded-[var(--kit-radius)] border border-[var(--kit-border)] bg-[var(--kit-surface)] p-4 text-[length:var(--kit-text-label)] animate-[var(--kit-animate-in)]",
				},
				[
					h("div", { class: "flex min-w-0 items-center gap-2" }, [
						h(
							"svg",
							{
								viewBox: "0 0 24 24",
								fill: "none",
								stroke: "currentColor",
								"stroke-width": "1.5",
								"aria-hidden": "true",
								class: "size-4 shrink-0 text-[var(--kit-warning-fg)]",
							},
							[
								h("path", {
									"stroke-linecap": "round",
									"stroke-linejoin": "round",
									d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z M12 9v4 M12 17h.01",
								}),
							],
						),
						h(
							"p",
							{ class: "min-w-0 flex-1 font-semibold text-[var(--kit-fg)] [overflow-wrap:anywhere]" },
							format(strings.value.request, { name: approval.name || strings.value.unknownTool }),
						),
						h(
							"span",
							{
								class:
									"shrink-0 rounded-[var(--kit-radius-sm)] border border-[var(--kit-border)] px-1.5 py-0.5 font-mono text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]",
							},
							approval.tool_type || strings.value.unknownType,
						),
						h(
							"span",
							{
								role: "status",
								class: "ml-auto shrink-0 text-[length:var(--kit-text-caption)] font-normal text-[var(--kit-fg-muted)]",
							},
							strings.value.status[approval.status],
						),
					]),
					h(
						"details",
						{ class: "kit-collapse group mt-3 min-w-0 rounded-[var(--kit-radius-sm)] bg-[var(--kit-bg-subtle)]" },
						[
							h(
								"summary",
								{
									class:
										"flex cursor-pointer list-none items-center gap-2 px-3 py-2 select-none [&::-webkit-details-marker]:hidden",
								},
								[
									h(
										"span",
										{
											class:
												"min-w-0 flex-1 truncate font-mono text-[length:var(--kit-text-caption)] text-[var(--kit-fg)]",
										},
										summary,
									),
									h(
										"span",
										{
											class:
												"flex shrink-0 items-center gap-1 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)] transition-colors group-hover:text-[var(--kit-fg)]",
										},
										[
											strings.value.viewParams,
											h(
												"svg",
												{
													viewBox: "0 0 24 24",
													fill: "none",
													stroke: "currentColor",
													"stroke-width": "1.5",
													"aria-hidden": "true",
													class: "size-3.5 transition-transform group-open:rotate-90",
												},
												[h("path", { "stroke-linecap": "round", "stroke-linejoin": "round", d: "m9 6 6 6-6 6" })],
											),
										],
									),
								],
							),
							h(
								"pre",
								{
									class:
										"group-open:animate-[var(--kit-animate-expand)] border-t border-[var(--kit-border)] px-3 py-2 whitespace-pre-wrap font-mono text-[length:var(--kit-text-caption)] [overflow-wrap:anywhere]",
								},
								parameters,
							),
						],
					),
					!approval.actionable
						? h(
								"p",
								{ class: "mt-2 text-[length:var(--kit-text-label)] text-[var(--kit-fg-muted)]" },
								strings.value.notActionable,
							)
						: null,
					actions,
					error.value
						? h(
								"p",
								{ role: "alert", class: "mt-2 text-[length:var(--kit-text-label)] text-[var(--kit-danger)]" },
								error.value,
							)
						: null,
				],
			);
		};
	},
});
