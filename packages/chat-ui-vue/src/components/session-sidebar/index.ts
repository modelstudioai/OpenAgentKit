import type { SessionSummary } from "@openagentkit/sdk/protocol";
import { computed, defineComponent, h, type PropType, ref, type VNodeChild, watch } from "vue";
import { format, resolveStrings, useKitLocale } from "../kit-i18n/index.ts";
import { SessionList } from "../session-list/index.ts";
import { ErrorState } from "../states/index.ts";
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
	onLoad?: () => void;
	onRetry?: () => void;
	onLoadMore?: () => void;
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
const HOVER_ROW =
	"transition-colors duration-[var(--kit-duration-fast)] ease-[var(--kit-ease-out)] motion-reduce:transition-none hover:bg-[var(--kit-nav-active)]";

/** 可折叠分区标题：整行可点收起展开，内容随 grid-rows 过渡（收起时 inert 隔离键盘）。 */
function SectionToggle(label: string, open: boolean, onToggle: () => void, children: VNodeChild[]) {
	return [
		h(
			"button",
			{
				type: "button",
				"aria-expanded": open,
				onClick: onToggle,
				class: `flex min-h-8 w-full cursor-pointer items-center rounded-[var(--kit-radius-sm)] px-2 py-1 text-left text-[length:var(--kit-text-caption)] font-medium text-[var(--kit-fg-muted)] ${HOVER_ROW} hover:text-[var(--kit-fg)] ${FOCUS_RING}`,
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
			[
				h(
					"div",
					{
						inert: !open || undefined,
						style: open ? undefined : { display: "none" },
						class: "min-h-0 overflow-hidden",
					},
					children,
				),
			],
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
		const openGroups = ref(new Set<string>());
		const closedSections = ref(new Set<string>());

		const toggleSection = (id: string) => {
			const next = new Set(closedSections.value);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			closedSections.value = next;
		};
		const loadGroup = (id: string) => {
			const group = props.groups.find((item) => item.id === id);
			if (group && !group.initialized && !group.loading) group.onLoad?.();
		};
		const toggleGroup = (id: string) => {
			const next = new Set(openGroups.value);
			if (next.has(id)) next.delete(id);
			else {
				next.add(id);
				loadGroup(id);
			}
			openGroups.value = next;
		};
		watch(
			() => [props.activeGroupId, props.groups.map((group) => group.id).join(",")] as const,
			([id]) => {
				if (!id) return;
				if (!openGroups.value.has(id)) openGroups.value = new Set(openGroups.value).add(id);
				loadGroup(id);
			},
			{ immediate: true },
		);

		const nameOf = (slug: string) => props.agentName?.(slug) ?? slug;
		const query = computed(() => props.searchInput.trim().toLowerCase());
		const filter = (sessions: SessionSummary[]) => {
			if (!query.value) return sessions;
			return sessions.filter((session) =>
				`${session.title ?? ""} ${nameOf(session.agent_slug)}`.toLowerCase().includes(query.value),
			);
		};
		const sectionOf = () => props.activeSection ?? "groups";

		const pageError = (page: SessionSidebarPage) =>
			h("div", { class: "px-2 py-2" }, [
				h(ErrorState, { message: page.error ?? "", onRetry: page.onRetry ?? (() => emit("reload")) }),
			]);
		const pageStatus = (page: SessionSidebarPage) =>
			h(
				"p",
				{ role: "status", class: "px-2 py-2 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]" },
				page.loadingMore
					? strings.value.loadingMore
					: format(strings.value.loadingTitle, { title: strings.value.sessionsTitle }),
			);
		const pageEmpty = (emptyText: string) =>
			h(
				"p",
				{ class: "px-2 py-2 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]" },
				query.value ? strings.value.noMatchLoaded : emptyText,
			);
		const pageList = (section: SessionSidebarSection, sessions: SessionSummary[], ariaLabel: string) =>
			h(
				SessionList,
				{
					sessions,
					activeId: sectionOf() === section ? props.activeId : null,
					activeStatus: sectionOf() === section ? props.activeStatus : undefined,
					editingId: props.editing?.section === section ? props.editing.id : null,
					variant: "workspace",
					ariaLabel,
					onSelect: (session: SessionSummary) => emit("select", session, section),
					onEdited: (id: string, title: string) => emit("edited", id, title),
					onEditEnd: (id: string) => emit("edit-end", id),
				},
				{
					menu: (scope: { session: SessionSummary }) => slots.menu?.({ session: scope.session, section }),
				},
			);
		const pageLoadMore = (page: SessionSidebarPage, section: SessionSidebarSection) =>
			h(
				"button",
				{
					type: "button",
					disabled: page.loading || page.loadingMore,
					class: `flex w-full cursor-pointer items-center justify-center rounded-[var(--kit-radius-sm)] px-2 py-2 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)] ${HOVER_ROW} hover:text-[var(--kit-fg)] disabled:cursor-wait disabled:opacity-50 ${FOCUS_RING}`,
					onClick: () => {
						if (page.onLoadMore) page.onLoadMore();
						else emit("load-more", { section });
					},
				},
				page.loadingMore ? strings.value.loadingMore : strings.value.loadMore,
			);
		const pageBody = (
			page: SessionSidebarPage,
			section: SessionSidebarSection,
			sessions: SessionSummary[],
			ariaLabel: string,
			emptyText: string,
		): VNodeChild[] => {
			const children: VNodeChild[] = [];
			if (page.error) children.push(pageError(page));
			if (page.loading || page.loadingMore) children.push(pageStatus(page));
			if (sessions.length > 0) children.push(pageList(section, sessions, ariaLabel));
			else if (!page.loading && !page.loadingMore && !page.error) children.push(pageEmpty(emptyText));
			if (page.hasMore && !page.error) children.push(pageLoadMore(page, section));
			return children;
		};

		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 侧栏按搜索、分组、最近与分页结构平铺，与 React 版保持同一阅读顺序
		return () => {
			const groupsOpen = !closedSections.value.has("agents");
			const visibleGroups = query.value
				? props.groups.filter(
						(group) =>
							group.id.toLowerCase().includes(query.value) ||
							group.name.toLowerCase().includes(query.value) ||
							filter(group.sessions).length > 0,
					)
				: props.groups;
			const groupNodes: VNodeChild[] = [];
			for (const group of visibleGroups) {
				const open = groupsOpen && openGroups.value.has(group.id);
				const rows = filter(group.sessions);
				groupNodes.push(
					h("div", { key: `group:${group.id}` }, [
						h("div", { class: `group/head flex min-w-0 items-center rounded-[var(--kit-radius-sm)] ${HOVER_ROW}` }, [
							h(
								"button",
								{
									type: "button",
									"data-testid": `sidebar-group-${group.id}`,
									"aria-expanded": open,
									onClick: () => toggleGroup(group.id),
									class: `flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-[var(--kit-radius-sm)] px-2 py-1.5 text-left ${FOCUS_RING}`,
								},
								[
									GroupAvatar(group.name),
									h(
										"span",
										{ class: "min-w-0 flex-1 truncate text-[length:var(--kit-text-label)] font-medium" },
										group.name,
									),
									group.initialized
										? h(
												"span",
												{
													title: format(strings.value.loadedCount, { count: group.sessions.length }),
													class:
														"shrink-0 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)] tabular-nums",
												},
												`${group.sessions.length}${group.hasMore ? "+" : ""}`,
											)
										: null,
								],
							),
							h(
								"button",
								{
									type: "button",
									"data-testid": `sidebar-group-new-${group.id}`,
									"aria-label": format(strings.value.newInGroup, { name: group.name }),
									title: format(strings.value.newInGroup, { name: group.name }),
									onClick: () => emit("new-chat", group.id),
									class: `mr-0.5 grid size-6 shrink-0 cursor-pointer place-items-center rounded-[var(--kit-radius-xs)] text-[var(--kit-fg-muted)] transition-[opacity,color] duration-[var(--kit-duration-fast)] ease-[var(--kit-ease-out)] motion-reduce:transition-none hover:text-[var(--kit-fg)] ${FOCUS_RING} [@media(hover:hover)_and_(pointer:fine)_and_(not_(any-pointer:coarse))]:opacity-0 group-hover/head:opacity-100 group-focus-within/head:opacity-100`,
								},
								[
									h(
										"svg",
										{
											"aria-hidden": "true",
											viewBox: "0 0 24 24",
											fill: "none",
											stroke: "currentColor",
											"stroke-width": "1.5",
											class: "size-3.5",
										},
										[h("path", { d: "M12 5v14M5 12h14", "stroke-linecap": "round" })],
									),
								],
							),
						]),
						h(
							"div",
							{
								class: `mt-1 grid transition-[grid-template-rows] duration-[var(--kit-duration-base)] ease-[var(--kit-ease-out)] motion-reduce:transition-none ${
									open ? "grid-rows-[repeat(1,minmax(0,1fr))]" : "grid-rows-[0px]"
								}`,
							},
							[
								h(
									"div",
									{
										inert: !open || undefined,
										style: open ? undefined : { display: "none" },
										class: "ml-5 min-h-0 overflow-hidden",
									},
									pageBody(
										group,
										"groups",
										rows,
										format(strings.value.listAria, { name: group.name }),
										format(strings.value.emptyTitle, { title: strings.value.sessionsTitle }),
									),
								),
							],
						),
					]),
				);
			}

			const recentRows = filter(props.recent.sessions);
			const groupsEmpty = props.groups.length === 0;
			const groupsContent: VNodeChild[] = props.error
				? [
						h(ErrorState, {
							message: props.error,
							onRetry: () => emit("reload"),
						}),
					]
				: groupsEmpty
					? [
							h(
								"p",
								{
									role: props.loading ? "status" : undefined,
									class: "px-2 py-4 text-[length:var(--kit-text-caption)] leading-relaxed text-[var(--kit-fg-muted)]",
								},
								props.loading
									? strings.value.loadingSessions
									: [strings.value.firstUse, h("span", { class: "mt-1 block" }, strings.value.firstUseHint)],
							),
						]
					: visibleGroups.length === 0
						? [
								h(
									"p",
									{ class: "px-2 py-4 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]" },
									strings.value.noMatchShort,
								),
							]
						: groupNodes;

			return h(
				"aside",
				{
					"data-testid": "experience-sidebar",
					class: `flex min-h-0 w-full shrink-0 flex-col border-r border-[var(--kit-border-subtle)] bg-[var(--kit-bg-subtle)] md:w-72 ${props.className ?? ""}`,
				},
				[
					slots.header?.(),
					h("div", { class: "shrink-0 px-3 pt-1.5 pb-3" }, [
						h(
							"div",
							{
								class:
									"flex items-center gap-2 rounded-[var(--kit-radius-sm)] border border-[var(--kit-border-subtle)] bg-[var(--kit-surface)] px-2.5 py-1.5 transition-colors duration-[var(--kit-duration-fast)] ease-[var(--kit-ease-out)] motion-reduce:transition-none focus-within:border-[var(--kit-border)]",
							},
							[
								h(
									"svg",
									{
										"aria-hidden": "true",
										viewBox: "0 0 24 24",
										fill: "none",
										stroke: "currentColor",
										"stroke-width": "1.5",
										class: "size-3.5 shrink-0 text-[var(--kit-fg-muted)]",
									},
									[
										h("circle", { cx: "10.5", cy: "10.5", r: "6.5" }),
										h("path", { d: "m16 16 4 4", "stroke-linecap": "round" }),
									],
								),
								h("input", {
									type: "search",
									"data-testid": "sidebar-search",
									value: props.searchInput,
									placeholder: strings.value.searchPlaceholder,
									"aria-label": strings.value.searchPlaceholder,
									class:
										"min-w-0 flex-1 border-none bg-transparent text-[length:var(--kit-text-label)] outline-none placeholder:text-[var(--kit-fg-muted)]",
									onInput: (event: Event) => emit("search-input", (event.target as HTMLInputElement).value),
								}),
							],
						),
					]),
					props.actionError
						? h(
								"div",
								{
									role: "alert",
									class:
										"mx-3 mb-2 flex items-start gap-2 rounded-[var(--kit-radius-sm)] bg-[var(--kit-bg)] p-2 text-[length:var(--kit-text-caption)] text-[var(--kit-danger)]",
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
					h(
						"div",
						{
							"data-testid": "session-directory-scroll",
							class: "min-h-0 flex-1 overflow-y-auto px-3 pb-3",
						},
						[
							...SectionToggle(strings.value.agents, groupsOpen, () => toggleSection("agents"), groupsContent),
							...SectionToggle(
								strings.value.recent,
								!closedSections.value.has("recent"),
								() => toggleSection("recent"),
								[
									...pageBody(
										props.recent,
										"recent",
										recentRows,
										strings.value.recentSessions,
										strings.value.firstUseHint,
									),
								],
							),
						],
					),
					slots.footer?.(),
				],
			);
		};
	},
});
