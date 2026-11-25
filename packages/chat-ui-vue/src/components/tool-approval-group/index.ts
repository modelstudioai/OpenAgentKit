import type { ChatToolApproval } from "@openagentkit/sdk/chat";
import type { ToolApprovalDecision } from "@openagentkit/sdk/protocol";
import { computed, defineComponent, h, type PropType, ref } from "vue";
import { resolveStrings, useKitLocale } from "../kit-i18n/index.ts";
import { ToolApprovalCard } from "../tool-approval-card/index.ts";
import toolApprovalGroupStrings, { type ToolApprovalGroupStrings } from "./strings.ts";

export { type ToolApprovalGroupStrings, toolApprovalGroupStrings };

const PAGER_BUTTON =
	"grid size-6 place-items-center rounded-[var(--kit-radius-sm)] text-[var(--kit-fg-muted)] transition-colors hover:bg-[var(--kit-bg-subtle)] hover:text-[var(--kit-fg)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]";

/** 多个待审批横向切换：一次只显示一张卡，用 ‹ 1/2 › 翻页。 */
export const ToolApprovalGroup = defineComponent({
	name: "ToolApprovalGroup",
	props: {
		approvals: { type: Array as () => ChatToolApproval[], required: true },
		onDecision: { type: Function as PropType<(decision: ToolApprovalDecision) => Promise<void>>, required: true },
		onRefresh: { type: Function as PropType<() => Promise<void>>, required: true },
		onStop: { type: Function as PropType<() => void>, default: undefined },
		strings: { type: Object as () => Partial<ToolApprovalGroupStrings>, default: undefined },
	},
	setup(props) {
		const strings = computed(() => resolveStrings(toolApprovalGroupStrings, useKitLocale(), props.strings));
		const selected = ref<string | null>(null);
		const keyOf = (approval: ChatToolApproval) => `${approval.batch_id}:${approval.call_id}`;
		const keys = computed(() => props.approvals.map(keyOf));
		const current = computed(
			() =>
				props.approvals.find((approval) => keyOf(approval) === selected.value) ??
				props.approvals.find((approval) => approval.status === "pending") ??
				props.approvals[0],
		);
		const index = computed(() => (current.value ? keys.value.indexOf(keyOf(current.value)) : -1));
		return () => {
			const approval = current.value;
			if (!approval) return null;
			const pager =
				props.approvals.length > 1
					? h(
							"div",
							{
								class:
									"flex items-center justify-end gap-1 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]",
							},
							[
								h(
									"button",
									{
										type: "button",
										"aria-label": strings.value.previous,
										class: PAGER_BUTTON,
										disabled: index.value <= 0,
										onClick: () => {
											const previous = props.approvals[index.value - 1];
											if (previous) selected.value = keyOf(previous);
										},
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
												class: "size-4",
											},
											[h("path", { "stroke-linecap": "round", "stroke-linejoin": "round", d: "m15 6-6 6 6 6" })],
										),
									],
								),
								h(
									"span",
									{ class: "min-w-10 text-center font-mono tabular-nums" },
									`${index.value + 1} / ${props.approvals.length}`,
								),
								h(
									"button",
									{
										type: "button",
										"aria-label": strings.value.next,
										class: PAGER_BUTTON,
										disabled: index.value >= props.approvals.length - 1,
										onClick: () => {
											const next = props.approvals[index.value + 1];
											if (next) selected.value = keyOf(next);
										},
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
												class: "size-4",
											},
											[h("path", { "stroke-linecap": "round", "stroke-linejoin": "round", d: "m9 6 6 6-6 6" })],
										),
									],
								),
							],
						)
					: null;
			return h("div", { class: "min-w-0" }, [
				pager,
				h(ToolApprovalCard, {
					approval,
					onDecision: props.onDecision,
					onRefresh: props.onRefresh,
					onStop: props.onStop,
				}),
			]);
		};
	},
});
