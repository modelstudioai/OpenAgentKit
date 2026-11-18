import { AgentHeader, Chat, Layout, SessionSidebar } from "@openagentpack/kit-chat-ui";
import type { AgentSummary, SessionSummary } from "@openagentpack/kit-sdk/protocol";
import { type ComponentProps, type ReactNode, useState } from "react";

export interface WorkspaceLayoutProps {
	agent: AgentSummary | null;
	sessions: SessionSummary[];
	sessionId: string | null;
	onSelect: (sessionId: string) => void;
	onCreate: () => void;
	onOpenUsage: () => void;
	account?: ReactNode;
	dialogs?: ReactNode;
	resources?: ReactNode;
	// 将选中会话的 Chat 作为 children 传入。
	children: ReactNode;
}

export function WorkspaceChat({
	chat,
	...layout
}: Omit<WorkspaceLayoutProps, "children"> & {
	chat: ComponentProps<typeof Chat>;
}) {
	return (
		<WorkspaceLayout {...layout}>
			<Chat {...chat} variant="workspace" scrollKey={layout.sessionId} />
		</WorkspaceLayout>
	);
}

// 路由、身份、会话状态和确认计划由调用方管理。
// 品牌、新建会话、目录、导航及账号区域由调用方组合，SessionSidebar 负责会话目录。
export function WorkspaceLayout(props: WorkspaceLayoutProps) {
	const [searchInput, setSearchInput] = useState("");
	const [asideOpen, setAsideOpen] = useState(true);
	return (
		<div className="h-dvh" data-kit-appearance="workspace">
			<Layout
				mobileTitle="工作台"
				sidebarLabel="导航"
				header={(menuToggle) => (
					<AgentHeader
						compact
						agent={props.agent}
						leading={menuToggle}
						actions={
							<button type="button" aria-expanded={asideOpen} onClick={() => setAsideOpen((open) => !open)}>
								资源
							</button>
						}
					/>
				)}
				sidebar={({ closeSidebar, closeButton }) => (
					<aside className="flex min-h-0 w-64 shrink-0 flex-col border-r border-[var(--kit-border-subtle)] bg-[var(--kit-bg-subtle)]">
						<div className="flex min-h-16 shrink-0 items-center gap-3 px-5 py-3">
							<span className="min-w-0 flex-1 truncate font-semibold">托管 Agent</span>
							{closeButton}
						</div>
						<button
							type="button"
							onClick={() => {
								closeSidebar();
								props.onCreate();
							}}
							className="mx-3 mb-1 min-h-10 shrink-0 rounded-[var(--kit-radius-sm)] border border-dashed border-[var(--kit-border)] px-3 text-sm text-[var(--kit-fg-muted)] transition-colors duration-[var(--kit-duration-fast)] ease-[var(--kit-ease-out)] motion-reduce:transition-none hover:border-[var(--kit-border)] hover:text-[var(--kit-fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]"
						>
							新建会话
						</button>
						<SessionSidebar
							groups={
								props.agent
									? [
											{
												id: props.agent.slug,
												name: props.agent.display_name,
												sessions: props.sessions,
												initialized: true,
											},
										]
									: []
							}
							recent={{ sessions: props.sessions, initialized: true }}
							activeId={props.sessionId}
							searchInput={searchInput}
							onSearchInput={setSearchInput}
							onSelect={(session) => {
								closeSidebar();
								props.onSelect(session.session_id);
							}}
						/>
						<nav aria-label="工作台导航" className="shrink-0 px-3 py-1">
							<button
								type="button"
								onClick={() => {
									closeSidebar();
									props.onOpenUsage();
								}}
								className="min-h-10 w-full rounded-[var(--kit-radius-sm)] px-3 py-2 text-left hover:bg-[var(--kit-surface)] focus-visible:outline-2 focus-visible:outline-[var(--kit-focus)]"
							>
								我的用量
							</button>
						</nav>
						{props.account}
					</aside>
				)}
				asideLabel="Agent 资源"
				asideOpen={asideOpen}
				onAsideOpenChange={setAsideOpen}
				aside={({ closeButton }) => (
					<div className="min-h-0 flex-1 overflow-y-auto p-4">
						<div className="flex items-center justify-between gap-2">
							<h2 className="font-medium">Agent 信息</h2>
							{closeButton}
						</div>
						<p className="mt-2 wrap-anywhere">{props.agent?.display_name ?? "选择一个 Agent"}</p>
						{props.agent?.description ? (
							<p className="mt-1 wrap-anywhere text-sm text-[var(--kit-fg-muted)]">{props.agent.description}</p>
						) : null}
						{props.resources}
					</div>
				)}
				dialogs={props.dialogs}
			>
				{props.children}
			</Layout>
		</div>
	);
}
