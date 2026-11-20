import {
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogOverlay,
	AlertDialogPortal,
	AlertDialogRoot,
	AlertDialogTitle,
} from "reka-ui";
import { computed, defineComponent, h, onMounted, type PropType, ref } from "vue";
import { resolveStrings, useKitLocale } from "../kit-i18n/index.ts";
import confirmDialogStrings, { type ConfirmDialogStrings } from "./strings.ts";

export { type ConfirmDialogStrings, confirmDialogStrings };

/** 破坏性/不可逆操作的确认弹窗（AlertDialog 语义，AGENTS.md UI 规范 3）。 */
export const ConfirmDialog = defineComponent({
	name: "ConfirmDialog",
	props: {
		title: { type: String, required: true },
		body: { type: String, required: true },
		confirmLabel: { type: String, default: undefined },
		cancelLabel: { type: String, default: undefined },
		danger: { type: Boolean, default: true },
		busy: { type: Boolean, default: false },
		onConfirm: { type: Function as PropType<() => void>, required: true },
		onCancel: { type: Function as PropType<() => void>, required: true },
		strings: { type: Object as () => Partial<ConfirmDialogStrings>, default: undefined },
	},
	setup(props) {
		const strings = computed(() => resolveStrings(confirmDialogStrings, useKitLocale(), props.strings));
		const container = ref<HTMLElement | null>(null);
		const ready = ref(false);
		let opener: HTMLElement | null = null;
		onMounted(() => {
			ready.value = true;
		});

		return () => {
			const scope = container.value;
			return h("div", { ref: container, class: "contents" }, [
				h(
					AlertDialogRoot,
					{
						open: true,
						"onUpdate:open": (open: boolean) => {
							if (!open && !props.busy) props.onCancel();
						},
					},
					() =>
						ready.value && scope
							? h(AlertDialogPortal, { to: scope }, () =>
									h(
										AlertDialogOverlay,
										{ class: "fixed inset-0 z-50 grid place-items-center bg-[var(--kit-overlay)] p-4" },
										() =>
											h(
												AlertDialogContent,
												{
													class:
														"flex max-h-[85vh] w-full max-w-md flex-col rounded-[var(--kit-radius)] border border-[var(--kit-border)] bg-[var(--kit-surface)] p-5 text-[var(--kit-fg)] shadow-[var(--kit-shadow)]",
													onEscapeKeyDown: (event: Event) => event.preventDefault(),
													onKeydown: (event: KeyboardEvent) => {
														if (event.key !== "Escape") return;
														event.preventDefault();
														event.stopPropagation();
														if (!props.busy) props.onCancel();
													},
													onOpenAutoFocus: () => {
														const focused = scope.ownerDocument.activeElement;
														opener = focused instanceof HTMLElement ? focused : null;
													},
													onCloseAutoFocus: (event: Event) => {
														event.preventDefault();
														if (opener?.isConnected) opener.focus({ preventScroll: true });
													},
												},
												() => [
													h(
														AlertDialogTitle,
														{ class: "shrink-0 text-[length:var(--kit-text-heading)] font-semibold" },
														() => props.title,
													),
													h(
														AlertDialogDescription,
														{
															class:
																"mt-2 min-h-0 overflow-y-auto whitespace-pre-wrap text-[length:var(--kit-text-label)] text-[var(--kit-fg-muted)] [overflow-wrap:anywhere]",
														},
														() => props.body,
													),
													h("div", { class: "mt-4 flex shrink-0 justify-end gap-2" }, [
														h(AlertDialogCancel, { asChild: true }, () =>
															h(
																"button",
																{
																	type: "button",
																	disabled: props.busy,
																	class:
																		"rounded-[var(--kit-radius-sm)] border border-[var(--kit-border)] px-3 py-1.5 text-[length:var(--kit-text-label)]",
																},
																props.cancelLabel ?? strings.value.cancel,
															),
														),
														h(
															"button",
															{
																type: "button",
																disabled: props.busy,
																"aria-busy": props.busy,
																onClick: () => props.onConfirm(),
																class: `rounded-[var(--kit-radius-sm)] px-3 py-1.5 text-[length:var(--kit-text-label)] font-semibold ${
																	props.danger
																		? "bg-[var(--kit-danger)] text-[var(--kit-danger-fg)]"
																		: "bg-[var(--kit-accent)] text-[var(--kit-accent-fg)]"
																}`,
															},
															props.confirmLabel ?? strings.value.confirm,
														),
													]),
												],
											),
									),
								)
							: null,
				),
			]);
		};
	},
});
