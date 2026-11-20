import type { SessionSummary } from "@openagentkit/sdk/protocol";
import { computed, defineComponent, h, type PropType, ref, type VNodeChild } from "vue";
import { format, resolveStrings, useKitLocale } from "../kit-i18n/index.ts";
import { SessionList } from "../session-list/index.ts";
import sessionSidebarStrings, { type SessionSidebarStrings } from "./strings.ts";

export { type SessionSidebarStrings, sessionSidebarStrings };

export type SessionSidebarSection = "groups" | "recent";

export interface SessionSidebarPage {
	sessions: SessionSummary[];
	initialized?: boolean;
	loading?: boolean;
	loadingMore?: boolean;
	hasMore?: boolean;
	error?: string | null;
}

export interface SessionSidebarGroup extends SessionSidebarPage {
	id: string;
	name: string;
}

export interface SessionSidebarEditing {
	id: string;
	section: SessionSidebarSection;
}

function GroupAvatar(name: string) {
	return h(
		"span",
		{
			"aria-hidden": "true",
			class:
				"grid size-5 shrink-0 place-items-center rounded-[var(--kit-radius-xs)] border border-[var(--kit-border-subtle)] bg-[var(--kit-surface)] text-[10px] font-semibold text-[var(--kit-fg-muted)]",
		},
		name.slice(0, 1),
	);
}

const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]";

/** 可折叠分区标题：整行可点收起展开。 */
function SectionToggle(label: string, open: boolean, onToggle: () => void, children: VNodeChild[]) {
	return [
		h(
			"button",
			{
				type: "button",
				"aria-expanded": open,
				onClick: onToggle,
				class: `flex min-h-8 w-full cursor-pointer items-center rounded-[var(--kit-radius-sm)] px-2 py-1 text-left text-[length:var(--kit-text-caption)] font-medium text-[var(--kit-fg-muted)] transition-colors duration-[var(--kit-duration-fast)] ease-[var(--kit-ease-out)] motion-reduce:transition-none hover:bg-[var(--kit-nav-active)] hover:text-[var(--kit-fg)] ${FOCUS_RING}`,
			},
			label,
		),
		h(
			"div",
			{
				class: `mt-3 grid transition-[grid-template-rows] duration-[var(--kit-duration-base)] ease-[var(--kit-ease-out)] motion-reduce:transition-none ${
					open ? "grid-rows-[repeat(1,minmax(0,1fr))]" : "grid-rows-[0px]"
				}`,
			},
			[h("div", { inert: !open || undefined, class: "min-h-0 overflow-hidden" }, children)],
		),
	];
}

/** 会话侧栏：搜索、智能体分组、最近会话与分页入口；具体数据与菜单由调用方注入。 */
export const SessionSidebar = defineComponent({
	name: "SessionSidebar",
	props: {
		groups: { type: Array as () => SessionSidebarGroup[], required: true },
		recent: { type: Object as () => SessionSidebarPage, required: true },
		loading: { type: Boolean, default: false },
		error: { type: String as PropType<string | null>, default: null },
		activeId: { type: String as PropType<string | null>, default: null },
		activeSection: { type: String as PropType<SessionSidebarSection>, default: undefined },
		activeStatus: { type: String as () => "running" | "attention" | "failed" | "completed", default: undefined },
		activeGroupId: { type: String as PropType<string | null>, default: null },
		searchInput: { type: String, default: "" },
		editing: { type: Object as () => SessionSidebarEditing | null, default: null },
		actionError: { type: String as PropType<string | null>, default: null },
		agentName: { type: Function as PropType<(slug: string) => string>, default: undefined },
		className: { type: String, default: undefined },
		strings: { type: Object as () => Partial<SessionSidebarStrings>, default: undefined },
	},
	emits: ["select", "new-chat", "search-input", "edited", "edit-end", "load-more", "dismiss-error", "reload"],
	setup(props, { slots, emit }) {
		const strings = computed(() => resolveStrings(sessionSidebarStrings, useKitLocale(), props.strings));
		const closed = ref(new Set<string>());
		const isClosed = (id: string) => closed.value.has(id);
		const toggle = (id: string) => {
			const next = new Set(closed.value);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			closed.value = next;
		};
		const nameOf = (slug: string) => props.agentName?.(slug) ?? slug;
		const query = computed(() => props.searchInput.trim().toLowerCase());
		const filter = (sessions: SessionSummary[]) => {
			if (!query.value) return sessions;
			return sessions.filter((session) =>
				`${session.title ?? ""} ${nameOf(session.agent_slug)}`.toLowerCase().includes(query.value),
			);
		};
		const sectionProps = (section: SessionSidebarSection) => ({
			sessions: filter(section === "groups" ? [] : props.recent.sessions),
			activeId: props.activeId,
			activeStatus:
				props.activeSection === section || (!props.activeSection && section === "recent")
					? props.activeStatus
					: undefined,
			editingId: props.editing?.section === section ? props.editing.id : null,
			variant: "workspace" as const,
			ariaLabel:
				section === "recent"
					? format(strings.value.listAria, { name: strings.value.recentSessions })
					: format(strings.value.listAria, { name: strings.value.agents }),
			onSelect: (session: SessionSummary) => emit("select", session, section),
			onEdited: (id: string, title: string) => emit("edited", id, title),
			onEditEnd: (id: string) => emit("edit-end", id),
		});

		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 侧栏按搜索、分组、最近与分页结构平铺，与 React 版保持同一阅读顺序
		return () => {
			const groupNodes: VNodeChild[] = [];
			for (const group of props.groups) {
				const open = !isClosed(group.id) || group.id === props.activeGroupId;
				const rows = filter(group.sessions);
				groupNodes.push(
					h("div", { key: `header:${group.id}`, class: "mt-2 flex min-h-8 items-center gap-2 px-2" }, [
						GroupAvatar(group.name),
						h(
							"span",
							{ class: "min-w-0 flex-1 truncate text-[length:var(--kit-text-caption)] font-medium" },
							group.name,
						),
						group.initialized
							? h(
									"span",
									{ class: "shrink-0 text-[length:var(--kit-text-meta)] text-[var(--kit-fg-muted)]" },
									format(strings.value.loadedCount, { count: group.sessions.length }),
								)
							: null,
						h(
							"button",
							{
								type: "button",
								"aria-label": format(strings.value.newInGroup, { name: group.name }),
								class: `grid size-6 shrink-0 place-items-center rounded-[var(--kit-radius-sm)] text-[var(--kit-fg-muted)] hover:bg-[var(--kit-nav-active)] ${FOCUS_RING}`,
								onClick: () => emit("new-chat", group.id),
							},
							"+",
						),
						h(
							"button",
							{
								type: "button",
								"aria-label": format(strings.value.listAria, { name: group.name }),
								"aria-expanded": open,
								class: `grid size-6 shrink-0 place-items-center rounded-[var(--kit-radius-sm)] text-[var(--kit-fg-muted)] hover:bg-[var(--kit-nav-active)] ${FOCUS_RING}`,
								onClick: () => toggle(group.id),
							},
							open ? "▾" : "▸",
						),
					]),
				);
				if (!open) continue;
				groupNodes.push(
					h(
						SessionList,
						{
							key: `list:${group.id}`,
							sessions: rows,
							activeId: props.activeId,
							activeStatus: props.activeSection === "groups" ? props.activeStatus : undefined,
							editingId: props.editing?.section === "groups" && props.editing.id ? props.editing.id : null,
							variant: "workspace",
							ariaLabel: format(strings.value.listAria, { name: group.name }),
							onSelect: (session: SessionSummary) => emit("select", session, "groups"),
							onEdited: (id: string, title: string) => emit("edited", id, title),
							onEditEnd: (id: string) => emit("edit-end", id),
						},
						{
							menu: (scope: { session: SessionSummary }) => slots.menu?.({ session: scope.session, section: "groups" }),
						},
					),
				);
				if (group.hasMore)
					groupNodes.push(
						h(
							"button",
							{
								key: `more:${group.id}`,
								type: "button",
								class: `mt-1 w-full rounded-[var(--kit-radius-sm)] px-2 py-1 text-left text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)] hover:bg-[var(--kit-nav-active)] ${FOCUS_RING}`,
								onClick: () => emit("load-more", { section: "groups", groupId: group.id }),
							},
							group.loadingMore ? strings.value.loadingMore : strings.value.loadMore,
						),
					);
			}

			const recentOpen = !isClosed("recent");
			const recentRows = filter(props.recent.sessions);
			return h("aside", { class: `flex min-h-0 flex-col bg-[var(--kit-bg-subtle)] ${props.className ?? ""}` }, [
				slots.header?.(),
				h("div", { class: "px-3 pt-3" }, [
					h("input", {
						type: "search",
						value: props.searchInput,
						placeholder: strings.value.searchPlaceholder,
						"aria-label": strings.value.searchPlaceholder,
						class: `min-h-9 w-full rounded-[var(--kit-radius-sm)] border border-[var(--kit-border)] bg-[var(--kit-surface)] px-3 text-[length:var(--kit-text-label)] ${FOCUS_RING}`,
						onInput: (event: Event) => emit("search-input", (event.target as HTMLInputElement).value),
					}),
				]),
				props.actionError
					? h(
							"div",
							{
								role: "alert",
								class:
									"mx-3 mt-2 flex items-start gap-2 rounded-[var(--kit-radius-sm)] bg-[var(--kit-bg)] p-2 text-[length:var(--kit-text-caption)] text-[var(--kit-danger)]",
							},
							[
								h("span", { class: "min-w-0 flex-1" }, props.actionError),
								h(
									"button",
									{
										type: "button",
										"aria-label": strings.value.closeError,
										class: `shrink-0 ${FOCUS_RING}`,
										onClick: () => emit("dismiss-error"),
									},
									"✕",
								),
							],
						)
					: null,
				h("div", { class: "min-h-0 flex-1 overflow-y-auto px-2 pb-3" }, [
					props.loading && props.groups.length === 0
						? h(
								"p",
								{ class: "p-2 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]" },
								strings.value.loadingSessions,
							)
						: null,
					props.error
						? h(
								"div",
								{
									role: "alert",
									class:
										"m-2 rounded-[var(--kit-radius-sm)] bg-[var(--kit-bg)] p-2 text-[length:var(--kit-text-caption)] text-[var(--kit-danger)]",
								},
								[
									h("p", null, props.error),
									h(
										"button",
										{
											type: "button",
											class: `mt-1 underline underline-offset-2 ${FOCUS_RING}`,
											onClick: () => emit("reload"),
										},
										strings.value.loadMore,
									),
								],
							)
						: null,
					...SectionToggle(strings.value.agents, true, () => undefined, groupNodes),
					...SectionToggle(strings.value.recent, recentOpen, () => toggle("recent"), [
						h(SessionList, sectionProps("recent"), {
							menu: (scope: { session: SessionSummary }) => slots.menu?.({ session: scope.session, section: "recent" }),
						}),
						props.recent.hasMore
							? h(
									"button",
									{
										type: "button",
										class: `mt-1 w-full rounded-[var(--kit-radius-sm)] px-2 py-1 text-left text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)] hover:bg-[var(--kit-nav-active)] ${FOCUS_RING}`,
										onClick: () => emit("load-more", { section: "recent" }),
									},
									props.recent.loadingMore ? strings.value.loadingMore : strings.value.loadMore,
								)
							: null,
						recentRows.length === 0 && !query.value
							? h(
									"p",
									{ class: "p-2 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]" },
									strings.value.firstUseHint,
								)
							: null,
					]),
				]),
				slots.footer?.(),
			]);
		};
	},
});
