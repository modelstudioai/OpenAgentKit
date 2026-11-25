import { computed, defineComponent, h, type PropType, ref } from "vue";
import { resolveStrings, useKitLocale } from "../kit-i18n/index.ts";
import actionsStrings, { type ActionsStrings } from "./strings.ts";

export { type ActionsStrings, actionsStrings };

function actionClass(variant: "borderless" | "outlined" | "filled"): string {
	return [
		"inline-flex items-center justify-center gap-1.5 rounded-[var(--kit-radius-sm)] border px-2 py-1.5 text-[length:var(--kit-text-caption)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)] disabled:cursor-not-allowed disabled:opacity-50",
		variant === "outlined" ? "border-[var(--kit-border)]" : "border-transparent",
		variant === "filled" ? "bg-[var(--kit-bg-subtle)]" : "bg-transparent",
		"enabled:hover:bg-[var(--kit-bg-subtle)]",
	].join(" ");
}

/** 操作组：与 React 版 Actions 保持 fieldset + aria-label 的同一可访问语义。 */
export const Actions = defineComponent({
	name: "Actions",
	props: {
		ariaLabel: { type: String, default: undefined },
		className: { type: String, default: "" },
		strings: { type: Object as () => Partial<ActionsStrings>, default: undefined },
	},
	setup(props, { slots }) {
		const strings = computed(() => resolveStrings(actionsStrings, useKitLocale(), props.strings));
		return () =>
			h(
				"fieldset",
				{
					"aria-label": props.ariaLabel ?? strings.value.listAriaLabel,
					class: `m-0 flex min-w-0 flex-wrap items-center gap-1 border-0 p-0 ${props.className}`,
				},
				slots.default?.(),
			);
	},
});

/** 复制操作：成功与失败由真实异步结果决定，不把拒绝的剪贴板权限展示成成功。 */
export const ActionsCopy = defineComponent({
	name: "ActionsCopy",
	props: {
		text: { type: String, required: true },
		onCopy: { type: Function as PropType<(text: string) => void | Promise<void>>, default: undefined },
		disabled: { type: Boolean, default: false },
		label: { type: String, default: undefined },
		iconOnly: { type: Boolean, default: false },
		variant: { type: String as PropType<"borderless" | "outlined" | "filled">, default: "borderless" },
		className: { type: String, default: "" },
		strings: { type: Object as () => Partial<ActionsStrings>, default: undefined },
	},
	setup(props) {
		const strings = computed(() => resolveStrings(actionsStrings, useKitLocale(), props.strings));
		const state = ref<"pending" | "success" | "error" | null>(null);
		const pending = ref(false);
		const copyLabel = computed(() => props.label ?? strings.value.copy);
		const visibleLabel = computed(() => {
			if (state.value === "pending") return strings.value.copying;
			if (state.value === "success") return strings.value.copied;
			if (state.value === "error") return strings.value.copyFailed;
			return props.iconOnly ? null : copyLabel.value;
		});
		const status = computed(() =>
			state.value === "success" ? strings.value.copied : state.value === "error" ? strings.value.copyFailedRetry : "",
		);
		const copy = async () => {
			if (pending.value || props.disabled || !props.text) return;
			pending.value = true;
			state.value = "pending";
			try {
				if (props.onCopy) await props.onCopy(props.text);
				else await navigator.clipboard.writeText(props.text);
				state.value = "success";
			} catch {
				state.value = "error";
			} finally {
				pending.value = false;
			}
		};
		return () =>
			h("span", { class: "inline-flex items-center" }, [
				h(
					"button",
					{
						type: "button",
						"aria-label": copyLabel.value,
						"aria-busy": state.value === "pending" || undefined,
						disabled: props.disabled || !props.text || state.value === "pending",
						onClick: () => void copy(),
						class: `${actionClass(props.variant)} ${
							state.value === "error" ? "text-[var(--kit-danger)]" : "text-[var(--kit-fg-muted)]"
						} ${props.className}`,
					},
					[h("span", { "aria-hidden": "true" }, "⧉"), visibleLabel.value],
				),
				h("span", { role: "status", class: "sr-only" }, status.value),
			]);
	},
});
