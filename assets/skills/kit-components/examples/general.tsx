import type { ChatMultiAgent } from "@openagentkit/sdk/chat";
import type { ChatMessage } from "@openagentkit/sdk/messages";
import type { AgentSummary, SessionSummary } from "@openagentkit/sdk/protocol";
import {
	AgentHeader,
	Chat,
	ConfirmDialog,
	EmptyState,
	ErrorState,
	Layout,
	Menu,
	MenuContent,
	MenuItem,
	MenuTrigger,
	MessageAnchorRail,
	MessageListSkeleton,
	SessionList,
	SessionSidebar,
	StatusIndicator,
	SubAgentPanel,
	ThreadPanel,
	Tooltip,
} from "@openagentpack/kit-chat-ui";
import { useState } from "react";

export interface GeneralComponentsProps {
	agent: AgentSummary;
	agents?: AgentSummary[];
	onPickAgent?: (slug: string) => void;
	sessions: SessionSummary[];
	sessionId: string | null;
	messages: ChatMessage[];
	multiAgent?: ChatMultiAgent;
	connected: boolean;
	turnRunning: boolean;
	canSend: boolean;
	onSelect: (sessionId: string) => void;
	onCreate: () => void;
	onSend: (text: string) => Promise<void>;
	onStop: () => Promise<void>;
	onDownload: (fileId: string) => void;
	onCopy: (text: string) => Promise<void>;
	onRetry: () => void;
}

export function GeneralComponents(props: GeneralComponentsProps) {
	const [searchInput, setSearchInput] = useState("");
	return (
		<div className="h-dvh" data-kit-appearance="workspace">
			<Layout
				sidebarLabel="导航"
				header={(menuToggle) => (
					<AgentHeader
						compact
						leading={menuToggle}
						agent={props.agent}
						agents={props.agents}
						onPickAgent={props.onPickAgent}
						actions={<StatusIndicator variant="badge" connected={props.connected} turnRunning={props.turnRunning} />}
					/>
				)}
				sidebar={({ closeSidebar, closeButton }) => (
					<aside className="flex min-h-0 w-64 shrink-0 flex-col border-r border-[var(--kit-border-subtle)] bg-[var(--kit-bg-subtle)]">
						<div className="flex min-h-16 shrink-0 items-center gap-3 px-5 py-3">
							<span className="min-w-0 flex-1 truncate font-semibold">工作台</span>
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
							groups={[
								{ id: props.agent.slug, name: props.agent.display_name, sessions: props.sessions, initialized: true },
							]}
							recent={{ sessions: props.sessions, initialized: true }}
							activeId={props.sessionId}
							searchInput={searchInput}
							onSearchInput={setSearchInput}
							onSelect={(session) => {
								closeSidebar();
								props.onSelect(session.session_id);
							}}
						/>
					</aside>
				)}
			>
				<Chat
					variant="workspace"
					messages={props.messages}
					multiAgent={props.multiAgent}
					scrollKey={props.sessionId}
					canSend={props.canSend}
					turnRunning={props.turnRunning}
					onSend={props.onSend}
					onStop={props.onStop}
					onArtifactDownload={props.onDownload}
					onCopy={props.onCopy}
					empty={<EmptyState title="开始对话" hint="发送第一条消息。" />}
				/>
			</Layout>
		</div>
	);
}

// 兼容已投影好的消息。使用 Chat 的 multiAgent 浏览子 Agent 及分页历史。
export function LegacyThreadMessages({ threads }: { threads: Record<string, ChatMessage[]> }) {
	return <ThreadPanel threads={threads} />;
}

// 独立使用锚点轨道时由调用方管理状态。MessageList.anchorRail 可派生回合，
// 随滚动更新当前锚点，并在其容器内跳转。
export function ConversationAnchors() {
	const [active, setActive] = useState(0);
	return (
		<div className="relative h-72">
			<MessageAnchorRail
				items={[
					{ label: "总结报告", summary: "采用批处理后，延迟降低了 40%。" },
					{ label: "翻译结论", summary: "执行了 2 次工具调用。" },
					{ label: "起草大纲", summary: "大纲涵盖背景、发布计划和待解决的问题。" },
				]}
				activeIndex={active}
				onSelect={setActive}
			/>
		</div>
	);
}

// 切换会话后，尚无消息且流未连接时，在 MessageList.empty 中渲染骨架屏。
export function SessionLoadingSkeleton() {
	return (
		<div className="mx-auto w-full max-w-[var(--kit-chat-width)] p-4">
			<MessageListSkeleton />
		</div>
	);
}

// 文字确实被截断时才显示提示浮层。
export function OverflowTooltip() {
	return (
		<p className="w-64">
			<Tooltip
				className="block truncate"
				content="这是一个超出列表行宽度的完整会话标题，用于查看截断后的提示效果"
				overflowOnly
			>
				这是一个超出列表行宽度的完整会话标题，用于查看截断后的提示效果
			</Tooltip>
		</p>
	);
}

// SessionList 也可放入调用方管理的移动端抽屉或详情面板。
export function SessionNavigation(props: Pick<GeneralComponentsProps, "sessions" | "sessionId" | "onSelect">) {
	return (
		<SessionList
			variant="workspace"
			sessions={props.sessions}
			activeId={props.sessionId}
			onSelect={(session) => props.onSelect(session.session_id)}
		/>
	);
}

export function ConnectionFailure({ onRetry }: Pick<GeneralComponentsProps, "onRetry">) {
	return <ErrorState message="连接失败，已保留草稿。" onRetry={onRetry} />;
}

// 用命令菜单选择附件类型，每项将自己的 accept 过滤条件交给调用方的选择器。
export function AttachmentMenu({ onPick }: { onPick: (accept?: string) => void }) {
	return (
		<Menu>
			<MenuTrigger asChild>
				<button type="button">添加附件</button>
			</MenuTrigger>
			<MenuContent>
				<MenuItem onSelect={() => onPick("image/*")}>上传图片</MenuItem>
				<MenuItem onSelect={() => onPick("video/*")}>上传视频</MenuItem>
				<MenuItem onSelect={() => onPick()}>上传文件</MenuItem>
			</MenuContent>
		</Menu>
	);
}

// 此示例重置本地预览。真实删除须先获取计划，并持有与计划匹配的确认令牌。
export function ConfirmationPreview() {
	const [open, setOpen] = useState(false);
	const [resets, setResets] = useState(0);
	return (
		<div>
			<button type="button" onClick={() => setOpen(true)}>
				重置预览
			</button>
			<p role="status">已重置 {resets} 次</p>
			{open ? (
				<ConfirmDialog
					title="重置此预览？"
					body="此操作只清除本地预览状态。"
					confirmLabel="重置预览"
					cancelLabel="保留预览"
					danger={false}
					onCancel={() => setOpen(false)}
					onConfirm={() => {
						setResets((value) => value + 1);
						setOpen(false);
					}}
				/>
			) : null}
		</div>
	);
}

// 资源侧栏按子 Agent 显示名去重。点击任务行在弹窗中打开该次派发的事件时间线，
// 子线程历史独立于主消息流的分页。
function panelThread(overrides: Partial<ChatMultiAgent["threads"][number]>): ChatMultiAgent["threads"][number] {
	return {
		id: "sthr_preview",
		name: "调研助手",
		status: "idle",
		messages: [],
		loading: false,
		error: null,
		nextPageToken: null,
		historyAvailable: true,
		loaded: true,
		...overrides,
	};
}

export function SubAgentPanelPreview() {
	const multiAgent: ChatMultiAgent = {
		selectedThreadId: null,
		threads: [
			panelThread({
				id: "sthr_slide",
				name: "演示文稿助手",
				status: "running",
				task: "根据已批准的大纲起草一份 12 页的演示文稿",
				messages: [
					{
						id: "m1",
						role: "assistant",
						status: "done",
						parts: [
							{
								type: "reasoning",
								text: "先梳理演示文稿大纲，再补充每页内容。",
								status: "done",
								startedAt: "2026-11-03T00:00:01Z",
							},
							{ type: "text", text: "第 1 至 3 页已完成。" },
						],
					},
				],
			}),
			panelThread({
				id: "sthr_price",
				task: "比较国内 API 的价格和额度",
				createdAt: "2026-11-03T00:00:00Z",
				endedAt: "2026-11-03T00:00:48Z",
			}),
		],
		loading: false,
		error: null,
		selectThread: () => undefined,
		refreshThreads: async () => undefined,
		loadThreadEvents: async () => undefined,
	};
	return <SubAgentPanel multiAgent={multiAgent} />;
}
