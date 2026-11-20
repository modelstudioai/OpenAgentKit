import type { SessionSummary } from "@openagentkit/sdk/protocol";
import { computed, defineComponent, h, onMounted, type PropType, ref } from "vue";
import { resolveStrings, useKitLocale } from "../kit-i18n/index.ts";
import { ProcessSpinner } from "../process/step/index.ts";
import { Tooltip } from "../tooltip/index.ts";
import sessionListStrings, { type SessionListStrings } from "./strings.ts";

export { type SessionListStrings, sessionListStrings };

type StatusMark = "running" | "attention" | "failed" | "completed";

const STATUS_MARKS: Record<StatusMark, { className?: string; spinner?: boolean; path?: string }> = {
	running: { spinner: true },
	attention: {
		className: "text-[var(--kit-warning)]",
		path: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z M12 9v4 M12 17h.01",
	},
	failed: { className: "text-[var(--kit-danger)]", path: "M6 6l12 12M18 6 6 18" },
	completed: { path: "M20 6 9 17l-5-5" },
};

const SESSION_STATUS_MARKS: Record<string, StatusMark> = {
	running: "running",
	requires_action: "attention",
	failed: "failed",
};

function rowMark(active: boolean, activeStatus: StatusMark | undefined, status: string | undefined) {
	const indexMark = status ? SESSION_STATUS_MARKS[status] : undefined;
	if (active && activeStatus) return activeStatus;
	return indexMark;
}

/** 侧栏搜索：按展示标题（title 回退 agent_slug）不区分大小写匹配。 */
export function filterSessions(sessions: SessionSummary[], keyword: string): SessionSummary[] {
	const q = keyword.trim().toLowerCase();
	if (!q) return sessions;
	return sessions.filter((session) => (session.title || session.agent_slug || "").toLowerCase().includes(q));
}

const focusClass = "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--kit-focus)]";
const editFocusClass = "outline-none focus-visible:border-[var(--kit-focus)]";

function sessionItemClasses(workspace: boolean, active: boolean) {
	if (!workspace) {
		return {
			row: `mb-0.5 flex w-full items-center gap-1 rounded-[var(--kit-radius-sm)] px-2.5 py-1.5 text-[length:var(--kit-text-label)] ${
				active ? "bg-[var(--kit-nav-active)] font-medium" : "hover:bg-[var(--kit-surface)]"
			}`,
			select: "min-w-0 flex-1 text-left",
			edit: `min-w-0 flex-1 rounded-[var(--kit-radius-sm)] border border-[var(--kit-border)] bg-[var(--kit-surface)] px-2 py-1 text-[length:var(--kit-text-label)] ${editFocusClass}`,
			actions:
				"flex size-7 shrink-0 items-center justify-center rounded opacity-60 transition-opacity duration-[var(--kit-duration-fast)] ease-[var(--kit-ease-out)] motion-reduce:transition-none hover:opacity-100",
		};
	}
	return {
		row: `group/session mb-1 flex w-full items-stretch rounded-[var(--kit-radius-sm)] text-[length:var(--kit-text-label)] ${
			active ? "bg-[var(--kit-nav-active)] font-medium" : "hover:bg-[var(--kit-nav-active)]/50"
		}`,
		select: `min-h-8 min-w-0 flex-1 cursor-pointer rounded-[var(--kit-radius-sm)] px-3 py-1.5 text-left ${focusClass}`,
		edit: `min-h-8 min-w-0 flex-1 rounded-[var(--kit-radius-sm)] border border-[var(--kit-border)] bg-[var(--kit-surface)] px-3 py-1.5 text-[length:var(--kit-text-label)] ${editFocusClass}`,
		actions: `flex w-9 shrink-0 items-center justify-center rounded-[var(--kit-radius-sm)] text-[var(--kit-fg-muted)] transition-opacity duration-[var(--kit-duration-fast)] ease-[var(--kit-ease-out)] motion-reduce:transition-none ${
			active
				? ""
				: "[@media(hover:hover)_and_(pointer:fine)_and_(not_(any-pointer:coarse))]:opacity-0 group-hover/session:opacity-100 group-focus-within/session:opacity-100"
		}`,
	};
}

const RenameInput = defineComponent({
	name: "SessionRenameInput",
	props: {
		title: { type: String, required: true },
		className: { type: String, required: true },
		renameAria: { type: String, required: true },
	},
	emits: ["finish"],
	setup(props, { emit }) {
		const input = ref<HTMLInputElement | null>(null);
		let finished = false;
		const finish = (next: string | null) => {
			if (finished) return;
			finished = true;
			emit("finish", next);
		};
		onMounted(() => {
			input.value?.focus();
			input.value?.select();
		});
		return () =>
			h("input", {
				ref: input,
				type: "text",
				value: props.title,
				"aria-label": props.renameAria,
				class: props.className,
				onBlur: () => finish(input.value?.value ?? null),
				onKeydown: (event: KeyboardEvent) => {
					if (event.key === "Enter") finish(input.value?.value ?? null);
					if (event.key === "Escape") {
						event.preventDefault();
						finish(null);
					}
				},
			});
	},
});

/** 会话列表只负责展示与操作槽；行尾菜单由调用方通过 #menu 插槽构造。 */
export const SessionList = defineComponent({
	name: "SessionList",
	props: {
		sessions: { type: Array as () => SessionSummary[], required: true },
		activeId: { type: String as PropType<string | null>, default: null },
		activeStatus: { type: String as PropType<"running" | "attention" | "failed" | "completed">, default: undefined },
		editingId: { type: String as PropType<string | null>, default: null },
		variant: { type: String as () => "default" | "workspace", default: "default" },
		ariaLabel: { type: String, default: undefined },
		className: { type: String, default: undefined },
		strings: { type: Object as () => Partial<SessionListStrings>, default: undefined },
	},
	emits: ["select", "edited", "edit-end"],
	setup(props, { slots, emit }) {
		const strings = computed(() => resolveStrings(sessionListStrings, useKitLocale(), props.strings));
		const finishEditing = (session: SessionSummary, title: string, next: string | null) => {
			if (next !== null) {
				const trimmed = next.trim().slice(0, 120);
				if (trimmed && trimmed !== title) emit("edited", session.session_id, trimmed);
			}
			emit("edit-end", session.session_id);
		};
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 行渲染按状态标记与编辑态平铺，拆分反而割裂阅读顺序
		return () => {
			return h(
				"nav",
				{
					class: `min-h-0 flex-1 overflow-y-auto px-2 pb-3 ${props.className ?? ""}`,
					"aria-label": props.ariaLabel ?? strings.value.aria,
				},
				[
					props.sessions.length === 0
						? h(
								"p",
								{ class: "p-2 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]" },
								strings.value.empty,
							)
						: null,
					...props.sessions.map((session) => {
						const active = session.session_id === props.activeId;
						const editing = session.session_id === props.editingId;
						const title = session.title || session.agent_slug;
						const itemClasses = sessionItemClasses(props.variant === "workspace", active);
						const markKey = rowMark(active, props.activeStatus, session.status);
						const mark = markKey ? STATUS_MARKS[markKey] : undefined;
						const markLabel = markKey ? strings.value.status[markKey] : undefined;
						const markNode = mark
							? h(
									"span",
									{
										role: "img",
										"aria-label": markLabel,
										title: markLabel,
										class: "mr-1.5 flex shrink-0 self-center",
									},
									mark.spinner
										? [h(ProcessSpinner, { className: "size-3.5 text-[var(--kit-accent)]" })]
										: [
												h(
													"svg",
													{
														viewBox: "0 0 24 24",
														fill: "none",
														stroke: "currentColor",
														"aria-hidden": "true",
														class: `size-3.5 ${mark.className ?? ""}`,
													},
													[
														h("path", {
															d: mark.path,
															"stroke-width": "2.5",
															"stroke-linecap": "round",
															"stroke-linejoin": "round",
														}),
													],
												),
											],
								)
							: session.status === "archived"
								? h(
										"span",
										{
											class:
												"shrink-0 self-center pr-1 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]",
										},
										strings.value.archived,
									)
								: null;
						return h("div", { key: session.session_id, class: itemClasses.row }, [
							editing
								? h(RenameInput, {
										title,
										className: itemClasses.edit,
										renameAria: strings.value.renameAria,
										onFinish: (next: string | null) => finishEditing(session, title, next),
									})
								: h(
										Tooltip,
										{ className: "block truncate", overflowOnly: true },
										{
											default: () =>
												h(
													"button",
													{
														type: "button",
														"aria-current": active ? "true" : undefined,
														class: itemClasses.select,
														onClick: () => emit("select", session),
													},
													[title],
												),
											content: () => title,
										},
									),
							markNode,
							!editing && slots.menu ? h("div", { class: itemClasses.actions }, [slots.menu({ session })]) : null,
						]);
					}),
				],
			);
		};
	},
});
