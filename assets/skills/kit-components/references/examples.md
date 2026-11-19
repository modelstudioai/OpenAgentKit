# 可编译示例

本页由随附的示例源文件生成。请按应用需求调整回调和运行时配置。

## agent-icon.tsx

[源文件](../examples/agent-icon.tsx)

```tsx
import { isIconImageSource } from "@openagentpack/kit-chat-ui";

// 自定义图标布局时，复用统一的图片或文本判断规则。
export function AgentIcon({ icon }: { icon?: string }) {
	return <span aria-hidden>{isIconImageSource(icon) ? <img src={icon} alt="" /> : (icon ?? "🤖")}</span>;
}
```

## approval-card.tsx

[源文件](../examples/approval-card.tsx)

```tsx
import type { ChatToolApproval } from "@openagentkit/sdk/chat";
import type { ToolApprovalDecision } from "@openagentkit/sdk/protocol";
import { ToolApprovalCard } from "@openagentpack/kit-chat-ui";

export interface ApprovalCardProps {
	approval: ChatToolApproval;
	submitApproval: (decision: ToolApprovalDecision) => Promise<void>;
	refreshApprovals: () => Promise<void>;
	stop: () => void;
}

// 直接展示一项待审批请求，单击允许或拒绝即可提交。
// 有多项审批时使用 ToolApprovalGroup。
export function ApprovalCard({ approval, submitApproval, refreshApprovals, stop }: ApprovalCardProps) {
	return (
		<ToolApprovalCard approval={approval} onDecision={submitApproval} onRefresh={refreshApprovals} onStop={stop} />
	);
}
```

## approvals.tsx

[源文件](../examples/approvals.tsx)

```tsx
import type { ChatToolApproval } from "@openagentkit/sdk/chat";
import type { ToolApprovalDecision } from "@openagentkit/sdk/protocol";
import { ToolApprovalGroup } from "@openagentpack/kit-chat-ui";

export interface ApprovalListProps {
	approvals: ChatToolApproval[];
	submitApproval: (decision: ToolApprovalDecision) => Promise<void>;
	refreshApprovals: () => Promise<void>;
	stop: () => void;
}

// 传入 useChat 的 approvals、submitApproval、refreshApprovals 和 stop。
// 单击允许或拒绝即可提交。多项待审批请求横向分页，每次展示一张卡片。
// 审批有效性由后端校验。
export function ApprovalList({ approvals, submitApproval, refreshApprovals, stop }: ApprovalListProps) {
	if (approvals.length === 0) return null;
	return (
		<ToolApprovalGroup approvals={approvals} onDecision={submitApproval} onRefresh={refreshApprovals} onStop={stop} />
	);
}
```

## attachment-sender.tsx

[源文件](../examples/attachment-sender.tsx)

```tsx
import { skillInputTokens } from "@openagentkit/sdk/protocol";
import {
	type AttachmentItem,
	Attachments,
	type AttachmentsRef,
	Sender,
	type SenderRef,
	type SenderSelection,
	type SenderSkill,
	SkillGlyph,
	Suggestion,
} from "@openagentpack/kit-chat-ui";
import { useEffect, useRef, useState } from "react";

interface UploadedAttachment extends AttachmentItem {
	fileId?: string;
}

export interface AttachmentSenderProps {
	uploadFile: (file: File) => Promise<{ file_id: string }>;
	// 在应用回调中处理会话挂载，上传只得到文件引用。
	onSubmit: (text: string, fileIds: string[], skills?: string[]) => Promise<void>;
	skills?: SenderSkill[];
	onStop: () => void;
	canSend: boolean;
	turnRunning: boolean;
}

const maxCount = 8;

export function AttachmentSender({
	uploadFile,
	onSubmit,
	onStop,
	canSend,
	turnRunning,
	skills,
}: AttachmentSenderProps) {
	const [draft, setDraft] = useState("");
	const [selection, setSelection] = useState<SenderSelection>({ start: 0, end: 0 });
	const sender = useRef<SenderRef>(null);
	const [files, setFiles] = useState<UploadedAttachment[]>([]);
	const [open, setOpen] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const attachments = useRef<AttachmentsRef>(null);
	const currentFiles = useRef(files);
	const mounted = useRef(false);
	const sending = useRef(false);

	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	const updateFiles = (update: (previous: UploadedAttachment[]) => UploadedAttachment[]) => {
		if (!mounted.current) return;
		currentFiles.current = update(currentFiles.current);
		setFiles(currentFiles.current);
	};

	const selectFiles = (selected: File[]) => {
		if (turnRunning || sending.current) return;
		const accepted = selected.slice(0, Math.max(0, maxCount - currentFiles.current.length));
		const uploads = accepted.map((file) => ({
			file,
			item: {
				uid: crypto.randomUUID(),
				name: file.name,
				size: file.size,
				type: file.type,
				status: "uploading" as const,
			},
		}));
		updateFiles((previous) => [...previous, ...uploads.map(({ item }) => item)]);
		setOpen(true);
		setError(null);
		for (const { file, item } of uploads) {
			// 让应用上传函数抛出的同步异常也进入失败处理。
			void Promise.resolve()
				.then(() => uploadFile(file))
				.then(
					(result) =>
						updateFiles((previous) =>
							previous.map((entry) =>
								entry.uid === item.uid
									? { ...entry, fileId: result.file_id, status: "done", description: "已就绪" }
									: entry,
							),
						),
					() =>
						updateFiles((previous) =>
							previous.map((entry) =>
								entry.uid === item.uid
									? { ...entry, status: "error", description: "上传失败，请移除后重新选择。" }
									: entry,
							),
						),
				);
		}
	};

	const submit = async (text: string, selectedSkills?: string[]) => {
		const selected = currentFiles.current;
		if (
			!canSend ||
			turnRunning ||
			sending.current ||
			!text.trim() ||
			selected.some((file) => file.status !== "done" || !file.fileId)
		) {
			return;
		}
		sending.current = true;
		setSubmitting(true);
		setError(null);
		try {
			await onSubmit(
				text.trim(),
				selected.flatMap((file) => (file.fileId ? [file.fileId] : [])),
				selectedSkills,
			);
			if (!mounted.current) return;
			setDraft((current) => (current === text ? "" : current));
			const submitted = new Set(selected.map((file) => file.uid));
			updateFiles((previous) => previous.filter((file) => !submitted.has(file.uid)));
		} catch {
			if (mounted.current) setError("发送失败，已保留草稿和文件。");
		} finally {
			sending.current = false;
			if (mounted.current) setSubmitting(false);
		}
	};

	const filesBlocked = files.some((file) => file.status !== "done" || !file.fileId);
	const skillNames = skills?.map((skill) => skill.name) ?? [];

	return (
		<div className="flex flex-col gap-2" data-kit-appearance="workspace">
			<Suggestion
				block
				items={(skills ?? []).map((skill) => ({
					value: skill.name,
					label: skill.name,
					description: skill.description,
					icon: <SkillGlyph className="size-4" />,
				}))}
				value={draft}
				caret={selection.end}
				trigger="/"
				filter={(item, query) =>
					item.value.toLowerCase().startsWith(query.toLowerCase()) &&
					!skillInputTokens(draft, skillNames).includes(item.value)
				}
				onSelect={(_, item, context) => {
					if (!context) return;
					const end = draft[context.end] === " " ? context.end + 1 : context.end;
					sender.current?.replaceRange(context.start, end, `/${item.value} `);
				}}
			>
				{({ onKeyDown, inputProps }) => (
					<Sender
						ref={sender}
						onSelectionChange={setSelection}
						onKeyDown={onKeyDown}
						inputProps={inputProps}
						variant="workspace"
						value={draft}
						skills={skills}
						onChange={setDraft}
						placeholder="输入消息或粘贴文件"
						loading={turnRunning}
						submitDisabled={!canSend || submitting || filesBlocked}
						onSubmit={(text, selectedSkills) => void submit(text, selectedSkills)}
						onCancel={onStop}
						onPasteFile={selectFiles}
						header={
							<Sender.Header title="附件" open={open} onOpenChange={setOpen}>
								<Attachments
									ref={attachments}
									items={files}
									maxCount={maxCount}
									disabled={turnRunning || submitting}
									onSelectFiles={selectFiles}
									onRemove={(item) => updateFiles((previous) => previous.filter((file) => file.uid !== item.uid))}
									placeholder={(type) => ({
										title: type === "drop" ? "松开以添加文件" : "选择文件",
										description: type === "inline" ? "选择、粘贴或拖放文件" : undefined,
									})}
								/>
							</Sender.Header>
						}
						prefix={
							<button
								type="button"
								disabled={turnRunning || submitting}
								onClick={() => {
									if (open) attachments.current?.select();
									else setOpen(true);
								}}
							>
								添加文件
							</button>
						}
						suffix={(_origin, { components }) =>
							turnRunning ? (
								<components.LoadingButton>停止</components.LoadingButton>
							) : (
								<components.SendButton>{submitting ? "发送中" : "发送"}</components.SendButton>
							)
						}
						footer={({ components }) => <components.ClearButton>清空输入</components.ClearButton>}
					/>
				)}
			</Suggestion>
			{error ? <p role="alert">{error}</p> : null}
		</div>
	);
}
```

## chat-runtime.tsx

[源文件](../examples/chat-runtime.tsx)

```tsx
import { useChat } from "@openagentkit/sdk/chat/hooks";
import { Chat, type SenderSkill, ToolApprovalCard } from "@openagentpack/kit-chat-ui";
import { useState } from "react";

// 在已配置的 KitProvider 内渲染，并为 Layout 内容区设置有界高度。
// 接入自建后端时，同一组件也可使用 useChat({ sessionId, provider })。
export function SessionChat({ sessionId, skills }: { sessionId: string | null; skills?: SenderSkill[] }) {
	const chat = useChat(sessionId);
	const [error, setError] = useState<string | null>(null);
	const report = (cause: unknown) => setError(cause instanceof Error ? cause.message : "请求失败。");

	return (
		<div className="flex min-h-0 flex-1 flex-col" data-kit-appearance="workspace">
			{error || chat.streamError ? <p role="alert">{error ?? chat.streamError?.message}</p> : null}
			<Chat
				variant="workspace"
				messages={chat.messages}
				skills={skills}
				multiAgent={chat.multiAgent}
				scrollKey={sessionId}
				turnRunning={chat.turnRunning}
				canSend={chat.canSend}
				onSend={async (text, selectedSkills) => {
					setError(null);
					try {
						await chat.send(text, { skills: selectedSkills });
					} catch (cause) {
						report(cause);
						throw cause; // 让 Chat 在发送失败时保留草稿。
					}
				}}
				onStop={() => chat.stop().catch(report)}
				approvals={
					chat.approvals.length > 0
						? chat.approvals.map((approval) => (
								<ToolApprovalCard
									key={JSON.stringify([approval.batch_id, approval.call_id])}
									approval={approval}
									onDecision={chat.submitApproval}
									onRefresh={chat.refreshApprovals}
									onStop={() => void chat.stop().catch(report)}
								/>
							))
						: null
				}
			/>
		</div>
	);
}
```

## content.tsx

[源文件](../examples/content.tsx)

```tsx
import type { ChatMessage, MessagePart } from "@openagentkit/sdk/messages";
import {
	Actions,
	ActionsCopy,
	ActionsFeedback,
	type ActionsFeedbackValue,
	ArtifactCard,
	AttachmentFileCard,
	type AttachmentItem,
	Attachments,
	CodeHighlighter,
	FileCard,
	Markdown,
	Mermaid,
	Message,
	MessageList,
	ReasoningBlock,
	SenderHeader,
	ToolCallCard,
} from "@openagentpack/kit-chat-ui";
import { useState } from "react";

export interface ContentExamplesProps {
	messages: ChatMessage[];
	tool: Extract<MessagePart, { type: "tool" }>;
	attachment: AttachmentItem;
	onDownload: (fileId: string) => void;
	onCopy: (text: string) => Promise<void>;
}

// 在高度有界的容器内渲染消息列表。
export function ContentExamples({ messages, tool, attachment, onDownload, onCopy }: ContentExamplesProps) {
	const [feedback, setFeedback] = useState<ActionsFeedbackValue>("default");
	const message = messages[0];
	return (
		<div className="flex flex-col gap-3" data-kit-appearance="workspace">
			{message ? (
				<Message variant="workspace" message={message} onArtifactDownload={onDownload} onCopy={onCopy} />
			) : null}
			<div className="flex h-full min-h-0 flex-col">
				<MessageList
					variant="workspace"
					messages={messages}
					autoScroll={false}
					onArtifactDownload={onDownload}
					onCopy={onCopy}
					empty={<p>暂无消息</p>}
				/>
			</div>
			<ReasoningBlock text="先比较已获得的证据，再给出回答。" status="done" />
			<ToolCallCard part={tool} />
			<ArtifactCard
				filename="report.pdf"
				contentType="application/pdf"
				onDownload={() => onDownload("output-report")}
			/>
			<FileCard name="notes.txt" onDownload={() => onDownload("notes")} />
			<Markdown>
				{"## 结果\n\n下面是经过**净化**的 Markdown 表格。\n\n| 项目 | 状态 |\n| --- | --- |\n| 报告 | 已就绪 |"}
			</Markdown>
			<CodeHighlighter lang="typescript" header="示例代码" showLineNumbers>
				{'const status: string = "ready";'}
			</CodeHighlighter>
			<Mermaid header="请求流程" defaultRenderType="image">
				{"flowchart LR\n  User[用户] --> Backend[后端]\n  Backend --> Agent[智能体]"}
			</Mermaid>
			<Actions
				aria-label="回复操作"
				items={[{ key: "download", label: "下载报告", onItemClick: () => onDownload("output-report") }]}
			>
				<Actions.Copy text="报告已完成。" onCopy={onCopy} label="复制回答" />
				<Actions.Feedback value={feedback} onChange={setFeedback} />
			</Actions>
			{/* 按需导入时也可使用等效的独立导出。 */}
			<ActionsCopy text="另一段摘录。" onCopy={onCopy} label="复制摘录" />
			<ActionsFeedback value={feedback} onChange={setFeedback} />
			<SenderHeader title="已准备的文件" open closable={false}>
				<Attachments.FileCard item={attachment} />
				<AttachmentFileCard item={attachment} />
			</SenderHeader>
			<p role="status">当前反馈为 {feedback}。持久化由调用方负责。</p>
		</div>
	);
}
```

## discovery-usage.tsx

[源文件](../examples/discovery-usage.tsx)

```tsx
import type { PlazaCategory, PlazaEntry } from "@openagentkit/sdk/protocol";
import { ActivityHeatmap, CategoryTabs, MeterBar, PlazaCard, type PlazaTabId } from "@openagentpack/kit-chat-ui";

export interface DiscoveryUsageProps {
	entries: PlazaEntry[];
	categories: { id: PlazaCategory; name: string; count: number }[];
	active: PlazaTabId;
	onCategoryChange: (next: PlazaTabId) => void;
	onOpen: (slug: string) => void;
	used: number;
	limit: number;
	unlimited: boolean;
	days: { day: string; turns: number }[];
}

// 调用方通过 Hook 获取数据，并负责筛选、导航和额度策略。
export function DiscoveryUsage(props: DiscoveryUsageProps) {
	return (
		<section>
			<CategoryTabs categories={props.categories} active={props.active} onChange={props.onCategoryChange} />
			<div className="grid gap-4">
				{props.entries.map((entry) => (
					<PlazaCard key={entry.slug} entry={entry} onOpen={props.onOpen} />
				))}
			</div>
			<h2>月度用量</h2>
			<MeterBar value={props.used} max={props.limit} unlimited={props.unlimited} />
			<ActivityHeatmap days={props.days} />
		</section>
	);
}
```

## general.tsx

[源文件](../examples/general.tsx)

```tsx
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
```

## layout.tsx

[源文件](../examples/layout.tsx)

```tsx
import type { AgentSummary, SessionSummary } from "@openagentkit/sdk/protocol";
import { AgentHeader, Chat, Layout, SessionSidebar } from "@openagentpack/kit-chat-ui";
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
```

## prompts-suggestion.tsx

[源文件](../examples/prompts-suggestion.tsx)

```tsx
import {
	Prompts,
	Sender,
	type SenderRef,
	type SenderSelection,
	SkillGlyph,
	Suggestion,
} from "@openagentpack/kit-chat-ui";
import { useRef, useState } from "react";

const promptText: Record<string, string> = {
	summary: "总结当前报告。",
	compare: "比较这两个方案。",
};

export function PromptComposer({ onSend, canSend }: { onSend: (text: string) => Promise<void>; canSend: boolean }) {
	const [draft, setDraft] = useState("");
	const [selection, setSelection] = useState<SenderSelection>({ start: 0, end: 0 });
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const sender = useRef<SenderRef>(null);
	const sending = useRef(false);

	const send = async (text: string) => {
		if (!canSend || sending.current || !text.trim()) return;
		sending.current = true;
		setSubmitting(true);
		setError(null);
		try {
			await onSend(text);
			setDraft((current) => (current === text ? "" : current));
		} catch {
			setError("发送失败，已保留草稿。");
		} finally {
			sending.current = false;
			setSubmitting(false);
		}
	};

	return (
		<div className="flex flex-col gap-3" data-kit-appearance="workspace">
			<Prompts
				title="试着问一个问题"
				wrap
				items={[
					{ key: "summary", label: "总结", description: "提取主要内容。" },
					{ key: "compare", label: "比较", description: "分析两个可选方案。" },
				]}
				onItemClick={({ data }) => {
					setDraft(promptText[data.key] ?? "");
					sender.current?.focus();
				}}
			/>
			<Suggestion
				block
				items={[
					{ value: "summary", label: "总结报告", icon: <SkillGlyph className="size-4" /> },
					{ value: "compare", label: "比较方案", icon: <SkillGlyph className="size-4" /> },
				]}
				value={draft}
				caret={selection.end}
				trigger="/"
				onSelect={(_, item, context) => {
					if (!context) return;
					sender.current?.replaceRange(context.start, context.end, promptText[item.value] ?? "");
					sender.current?.focus();
				}}
			>
				{({ onKeyDown, inputProps }) => (
					<Sender
						variant="workspace"
						ref={sender}
						value={draft}
						placeholder="输入 / 选择命令"
						onChange={setDraft}
						onSelectionChange={setSelection}
						onKeyDown={onKeyDown}
						inputProps={inputProps}
						submitDisabled={!canSend || submitting}
						onSubmit={(text) => void send(text)}
						suffix={(_origin, { components }) => <components.SendButton>发送</components.SendButton>}
					/>
				)}
			</Suggestion>
			{error ? <p role="alert">{error}</p> : null}
		</div>
	);
}
```

## reasoning.tsx

[源文件](../examples/reasoning.tsx)

```tsx
import { ReasoningBlock } from "@openagentpack/kit-chat-ui";
import { useState } from "react";

// 实际对话中，每个推理分片的状态来自 Provider。
// 下列操作在同一个组件实例上演示各阶段切换。
export function ReasoningLifecycle() {
	const [status, setStatus] = useState<"streaming" | "done" | "failed" | "interrupted">("done");
	return (
		<div className="flex flex-col gap-3" data-kit-appearance="workspace">
			<fieldset className="flex flex-wrap gap-3">
				<legend className="sr-only">推理阶段操作</legend>
				<button type="button" onClick={() => setStatus("streaming")}>
					开始推理
				</button>
				<button type="button" onClick={() => setStatus("done")}>
					完成
				</button>
				<button type="button" onClick={() => setStatus("interrupted")}>
					中断
				</button>
				<button type="button" onClick={() => setStatus("failed")}>
					失败
				</button>
			</fieldset>
			<ReasoningBlock text="先比较证据，再给出回答。" status={status} />
		</div>
	);
}
```
