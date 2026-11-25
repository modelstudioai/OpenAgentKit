import { computed, defineComponent, h, type PropType } from "vue";
import { resolveStrings, useKitLocale } from "../kit-i18n/index.ts";
import statusIndicatorStrings, { type StatusIndicatorStrings } from "./strings.ts";

export { type StatusIndicatorStrings, statusIndicatorStrings };

type StatusKey =
	| "idle"
	| "running"
	| "requires_action"
	| "stopping"
	| "failed"
	| "interrupted"
	| "connecting"
	| "reconnecting"
	| "error";

type Phase = "idle" | "running" | "requires_action" | "stopping" | "failed" | "interrupted";
type Connection = "disconnected" | "connecting" | "connected" | "reconnecting";

const STRING_KEYS: Record<StatusKey, keyof StatusIndicatorStrings> = {
	idle: "idle",
	running: "running",
	requires_action: "requiresAction",
	stopping: "stopping",
	failed: "failed",
	interrupted: "interrupted",
	connecting: "connecting",
	reconnecting: "reconnecting",
	error: "error",
};

/** 状态推导：phase 优先，其次连接态覆盖，错误兜底（重连中的错误仍显示重连）。 */
function resolveStatusKey(
	phase: Phase | undefined,
	turnRunning: boolean,
	connected: boolean,
	connection: Connection | undefined,
	error: { code: string; message: string } | null | undefined,
): StatusKey {
	let status: StatusKey = phase ?? (turnRunning ? (connected ? "running" : "reconnecting") : "idle");
	if (connection === "connecting" || connection === "reconnecting") status = connection;
	if (error && connection !== "reconnecting") status = "error";
	return status;
}

/** 状态指示：空闲、执行、等待审批、停止、失败、中断、连接与重连；活跃态呼吸点。 */
export const StatusIndicator = defineComponent({
	name: "StatusIndicator",
	props: {
		connected: { type: Boolean, required: true },
		turnRunning: { type: Boolean, required: true },
		phase: { type: String as PropType<Phase | undefined>, default: undefined },
		connection: { type: String as PropType<Connection | undefined>, default: undefined },
		error: { type: Object as () => { code: string; message: string } | null | undefined, default: undefined },
		variant: { type: String as PropType<"default" | "badge">, default: "default" },
		strings: { type: Object as () => Partial<StatusIndicatorStrings>, default: undefined },
	},
	setup(props) {
		const strings = computed(() => resolveStrings(statusIndicatorStrings, useKitLocale(), props.strings));
		return () => {
			const status = resolveStatusKey(props.phase, props.turnRunning, props.connected, props.connection, props.error);
			const label =
				status === "error"
					? `${strings.value.errorPrefix}${props.error?.message ?? ""}`
					: strings.value[STRING_KEYS[status]];
			const active = status === "running" || status === "connecting" || status === "reconnecting";
			const tones: Record<StatusKey, string> = {
				idle: "text-[var(--kit-fg-muted)]",
				running: "text-[var(--kit-accent)]",
				requires_action: "text-[var(--kit-warning-fg)]",
				stopping: "text-[var(--kit-fg-muted)]",
				failed: "text-[var(--kit-danger)]",
				interrupted: "text-[var(--kit-danger)]",
				connecting: "text-[var(--kit-accent)]",
				reconnecting: "text-[var(--kit-accent)]",
				error: "text-[var(--kit-danger)]",
			};
			const dot = (always: boolean) =>
				always || status !== "idle"
					? h("span", {
							"aria-hidden": "true",
							class: `h-1.5 w-1.5 shrink-0 rounded-full bg-current ${active ? "motion-safe:animate-pulse" : ""}`,
						})
					: null;
			if (props.variant === "badge")
				return h(
					"span",
					{
						role: "status",
						title: label,
						class: `inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-[var(--kit-border-subtle)] bg-[var(--kit-bg-subtle)] px-2 py-1 text-[length:var(--kit-text-caption)] ${tones[status]}`,
					},
					[dot(true), h("span", { class: "min-w-0 truncate" }, label)],
				);
			return h(
				"span",
				{
					role: "status",
					class: `inline-flex min-w-0 items-center gap-1.5 text-[length:var(--kit-text-caption)] ${tones[status]}`,
				},
				[dot(false), label],
			);
		};
	},
});
