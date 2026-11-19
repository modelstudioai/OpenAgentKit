import { useAgentCatalog, useAgentResources } from "@openagentkit/sdk/agents/hooks";
import type { MemberAuthController } from "@openagentkit/sdk/auth";
import { useChat, useComposer } from "@openagentkit/sdk/chat/hooks";
import { useArtifactActions, useAttachments } from "@openagentkit/sdk/files/hooks";
import { useIsMobile } from "@openagentkit/sdk/hooks";
import type { AgentSummary, SessionDetail, SessionSummary } from "@openagentkit/sdk/protocol";
import { useKitClient } from "@openagentkit/sdk/providers/kit/react";
import type { PendingSessionAction } from "@openagentkit/sdk/sessions";
import { useSessionDetails } from "@openagentkit/sdk/sessions/hooks";
import { type QuotaExceededDetails, readQuotaExceeded } from "@openagentkit/sdk/usage";
import {
	type AttachmentItem,
	Chat,
	ConfirmDialog,
	EmptyState,
	ErrorState,
	MessageListSkeleton,
	Prompts,
	StatusIndicator,
	ToolApprovalGroup,
	Tooltip,
} from "@openagentpack/kit-chat-ui";
import type { TFunction } from "i18next";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MemberAuthGate, type MemberExperienceProps } from "./features/auth/member-auth-gate.tsx";
import { AsidePanelSections } from "./features/chat/aside-panel.tsx";
import { ExperienceSender } from "./features/chat/experience-sender.tsx";
import { ExperienceLayout } from "./features/layout/experience-layout.tsx";
import { NewChatRecent } from "./features/new-chat/new-chat-view.tsx";
import { PlazaView } from "./features/plaza/plaza-view.tsx";
import { QuotaBanner } from "./features/usage/quota-banner.tsx";
import { UsageView } from "./features/usage/usage-view.tsx";
import { type Branding, DEFAULT_BRAND_PRODUCT_NAME } from "./lib/branding.ts";
import { createArtifactHost, resolveHostCapabilities } from "./lib/host.ts";
import { type NavigateFn, useRoute } from "./lib/use-route.ts";
import { type SessionDirectory, useSessionDirectory } from "./lib/use-session-directory.ts";

type ActiveStatus = "running" | "attention" | "failed" | "completed";

/** 会话级破坏性动作确认（AlertDialog 语义，AGENTS.md UI 规范 3）。 */
function SessionActionDialog({
	pending,
	busy,
	onCancel,
	onConfirm,
}: {
	pending: PendingSessionAction | null;
	busy: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	const { t } = useTranslation("chat");
	if (!pending) return null;
	const archive = pending.action === "archive";
	return (
		<ConfirmDialog
			title={archive ? t("sessionDialog.archiveTitle") : t("sessionDialog.deleteTitle")}
			busy={busy}
			confirmLabel={
				busy
					? t("sessionDialog.processing")
					: pending.plan
						? t("sessionDialog.confirm")
						: t("sessionDialog.refetchPlan")
			}
			body={
				pending.error ??
				(pending.plan
					? [
							archive ? t("sessionDialog.archiveEffect") : t("sessionDialog.deleteEffect"),
							...pending.plan.diff.map((item) => `${item.resource} → ${item.action}`),
							...(busy ? [t("sessionDialog.busyNote")] : []),
						].join("\n\n")
					: t("sessionDialog.planning"))
			}
			onCancel={onCancel}
			onConfirm={onConfirm}
		/>
	);
}

/** 侧栏状态点：打开行用实时相位——运行中（含 stopping）立即出旋转环，不能回退索引：
 * 生成中列表不重取，索引残留发送前的 requires_action/failed 会盖住真实的运行态。
 * 回合收敛后的行等列表重取回正后按索引展示。协议相位在这里映射成中性展示词，
 * 协议词汇不进组件 prop。 */
function deriveActiveStatus({
	phase,
	turnRunning,
}: Pick<ReturnType<typeof useChat>, "phase" | "turnRunning">): ActiveStatus | undefined {
	if (phase === "running" || phase === "stopping" || (!phase && turnRunning)) return "running";
	if (phase === "requires_action") return "attention";
	return phase === "failed" ? "failed" : undefined;
}

/** 会话流硬错误（如远端会话不存在）：自动重连期间不算，错误态期间的索引状态不可信。 */
function isSessionUnavailable(chat: Pick<ReturnType<typeof useChat>, "streamError" | "connection">): boolean {
	return chat.streamError !== null && chat.connection !== "reconnecting";
}

/** 侧栏状态注入：会话流报错时打开行不再用实时相位，并让该会话行压掉滞留的索引标记；
 * 「刚完成」提示并入 activeStatus 的 completed 值（只属于打开行，切换会话即清）。 */
function sidebarStatus(
	chat: Pick<ReturnType<typeof useChat>, "phase" | "turnRunning" | "streamError" | "connection">,
	sessionId: string | null,
	completedSessionId: string | null,
): { activeStatus: ActiveStatus | undefined; staleStatusId: string | null } {
	if (!isSessionUnavailable(chat))
		return {
			activeStatus: deriveActiveStatus(chat) ?? (completedSessionId === sessionId ? "completed" : undefined),
			staleStatusId: null,
		};
	return { activeStatus: undefined, staleStatusId: sessionId };
}

/** 页头标题：会话态用打开会话的标题（索引缺失时回退详情/agent_slug），新会话态用 Agent 展示名。 */
function chatHeaderTitle({
	activeSession,
	sessionDetail,
	sessionId,
	agent,
	t,
}: {
	activeSession: SessionSummary | null;
	sessionDetail: SessionDetail | null;
	sessionId: string | null;
	agent: AgentSummary | null;
	t: TFunction<"chat">;
}): string {
	const opened = activeSession ?? (sessionDetail?.session_id === sessionId ? sessionDetail : null);
	return sessionId
		? opened?.title || opened?.agent_slug || t("untitledSession")
		: (agent?.display_name ?? t("newSession"));
}

/** 输入框附件行投影：暂存（含扫描态）/失败/上传中三类来源统一成 AttachmentItem。 */
function stagedAttachmentItems({
	files,
	failures,
	pending,
	t,
}: Pick<ReturnType<typeof useAttachments>, "files" | "failures" | "pending"> & {
	t: TFunction<"chat">;
}): AttachmentItem[] {
	return [
		...files.map((file) => ({
			uid: file.file_id,
			name: file.filename,
			size: file.size,
			status: file.timedOut ? ("error" as const) : ("done" as const),
			description: file.available ? undefined : file.timedOut ? t("attachment.scanTimeout") : t("attachment.scanning"),
		})),
		...failures.map((file) => ({
			uid: file.uid,
			name: file.name,
			size: file.size,
			status: "error" as const,
			description: file.message,
		})),
		...pending.map((file) => ({ uid: file.uid, name: file.name, size: file.size, status: "uploading" as const })),
	];
}

/** 对话视图：组合会话、附件、审批与配额状态；路由态、全局目录与目录动作由 Shell 注入。 */
function ChatView({
	chatProvider,
	navigate,
	agentSlug,
	sessionId,
	directory,
	agents,
	agentsLoading,
	agentsError,
	reloadAgents,
	dialogs,
	branding,
	...account
}: {
	navigate: NavigateFn;
	/** 路由深链的 agent slug（?agent=）与会话 id（?session=）；切换即重订阅。 */
	agentSlug: string | null;
	sessionId: string | null;
	directory: SessionDirectory;
	agents: AgentSummary[];
	agentsLoading: boolean;
	agentsError: string | null;
	reloadAgents: () => void;
	/** 目录动作确认弹窗（Shell 持有一份，跨视图共用）。 */
	dialogs: ReactNode;
	branding: Branding;
} & MemberExperienceProps) {
	const client = useKitClient();
	const { t } = useTranslation(["chat", "common"]);
	const host = useMemo(resolveHostCapabilities, []);
	const { sessions, reload: reloadSessions } = directory;
	const [draftScope, setDraftScope] = useState(0);
	const [sendError, setSendError] = useState<string | null>(null);
	// 发送请求在途（含新建会话）：列表尾「发送中…」指示的数据源，回合开始后由 turnRunning 接管。
	// 配额耗尽（403 quota_exceeded）不与普通发送错误混在一起：它要出横幅 + 禁用输入，而不是一行红字
	const [quotaError, setQuotaError] = useState<QuotaExceededDetails | null>(null);
	// 资源面板桌面常驻停靠（默认展开，开合只经页头的面板开关）；移动端为覆盖层，进入页面收起。
	const isMobile = useIsMobile();
	const [asideOpen, setAsideOpen] = useState(!isMobile);
	const chat = useChat({ sessionId, provider: chatProvider });
	// 切换会话的历史回放与断线重连期间（未 connected 且暂无消息）内容区显示加载态，而不是误显示新会话欢迎页。
	// 重连中保留的旧错误不算硬错误（isSessionUnavailable），否则会退化成欢迎页。
	const sessionLoading =
		sessionId !== null && chat.messages.length === 0 && chat.connection !== "connected" && !isSessionUnavailable(chat);
	const { data: sessionDetail = null } = useSessionDetails({
		client,
		sessionId,
		setMessageFiles: chat.setMessageFiles,
	});
	const sessionUnavailable = isSessionUnavailable(chat);
	useEffect(
		() => directory.observeChat({ sessionId, phase: chat.phase, failed: sessionUnavailable }),
		[directory.observeChat, sessionId, chat.phase, sessionUnavailable],
	);
	// 回合收敛瞬间在打开行点亮「已完成」标记，点击侧栏任意行即消失（纯前端：索引终态只有 idle，
	// 没有完成语义）。只有停留观察的回合才收得到完成事件；跨会话切换的快照拼接不构成迁移。
	const [completedSessionId, setCompletedSessionId] = useState<string | null>(null);
	const lastPhaseRef = useRef<{ sessionId: string | null; phase: string }>({ sessionId: null, phase: "idle" });
	useEffect(() => {
		const prev = lastPhaseRef.current;
		lastPhaseRef.current = { sessionId, phase: chat.phase };
		// 切换会话即清完成标记：标记只属于停留观察的那一轮。
		if (prev.sessionId !== sessionId) {
			setCompletedSessionId(null);
			return;
		}
		if (chat.phase === "running") setCompletedSessionId(null);
		else if (chat.phase === "idle" && (prev.phase === "running" || prev.phase === "requires_action"))
			setCompletedSessionId(sessionId);
	}, [sessionId, chat.phase]);
	// 会话切换或回到新会话态时重置输入框草稿；首次建会话（null→id）不清，发送失败后草稿仍可重试。
	const lastSessionRef = useRef<string | null>(null);
	useEffect(() => {
		if (lastSessionRef.current !== null) setDraftScope((value) => value + 1);
		lastSessionRef.current = sessionId;
	}, [sessionId]);
	const {
		files: stagedFiles,
		pending: pendingFiles,
		failures: failedFiles,
		processing: scanningFiles,
		upload,
		remove: removeStagedFile,
		consume: consumeStagedFiles,
	} = useAttachments({ client });
	const pickAndUpload = useCallback(
		async (options?: { accept?: string }) => {
			const files = await host.pickFiles?.({ multiple: true, accept: options?.accept });
			if (files?.length) await upload(files);
		},
		[host, upload],
	);

	const agent = useMemo(() => agents.find((a) => a.slug === agentSlug) ?? agents[0] ?? null, [agents, agentSlug]);
	// Agent 资源一次拉取两处用：输入框技能选择（面板关闭时也要可用）与资源面板分区。
	const resources = useAgentResources(agent?.slug ?? null);
	const memories = resources?.memory_stores ?? null;
	/** 技能选择清单：仅名称与描述（permission 是工具执行语义，不进选择器）。 */
	const senderSkills = useMemo(
		() =>
			(resources?.skills ?? []).map(({ name, description }) => ({
				name,
				...(description ? { description } : {}),
			})),
		[resources],
	);
	const activeSession = useMemo(
		() =>
			sessions.find((session) => session.session_id === sessionId) ??
			directory.recent.sessions.find((session) => session.session_id === sessionId) ??
			null,
		[sessions, sessionId, directory.recent.sessions],
	);
	const headerTitle = chatHeaderTitle({ activeSession, sessionDetail, sessionId, agent, t });

	/** 发送失败分流：配额耗尽 → 横幅 + 禁用输入；其余 → 原有 sendError 文案。 */
	const handleComposerError = useCallback(
		(error: unknown) => {
			const exceeded = readQuotaExceeded(error);
			if (exceeded) {
				setQuotaError(exceeded);
				setSendError(null);
				return;
			}
			setSendError(t("errors.sendFailed", { message: error instanceof Error ? error.message : String(error) }));
		},
		[t],
	);

	const composer = useComposer({
		client,
		agentSlug: agent?.slug ?? null,
		sessionId,
		files: stagedFiles,
		onAccepted: consumeStagedFiles,
		send: chat.send,
		onSessionCreated: (id) => {
			// 新会话立刻写进地址（replace）并刷新目录，侧栏分组随之出现。
			navigate({ view: "chat", session: id }, { replace: true });
			reloadSessions();
		},
	});

	const delivering = composer.pending;
	const sendViaComposer = useCallback(
		async (text: string, skills?: string[]) => {
			try {
				await composer.send(text, skills);
				directory.refreshStatuses();
				return true;
			} catch (error) {
				handleComposerError(error);
				return false;
			}
		},
		[composer.send, directory.refreshStatuses, handleComposerError],
	);
	const artifactHost = useMemo(() => createArtifactHost(host), [host]);
	const artifactActions = useArtifactActions({
		client,
		host: artifactHost,
		sessionId: sessionId ?? undefined,
		artifacts: chat.artifacts,
	});
	const openArtifact = useCallback(
		(id: string, contentType?: string) =>
			artifactActions
				.open(id, contentType)
				.catch((error: unknown) => setSendError(error instanceof Error ? error.message : t("errors.previewFailed"))),
		[artifactActions.open, t],
	);
	const downloadArtifact = useCallback(
		(id: string) =>
			artifactActions
				.download(id)
				.catch((error: unknown) => setSendError(error instanceof Error ? error.message : t("errors.downloadFailed"))),
		[artifactActions.download, t],
	);

	/** 资源面板：桌面为页头之下的停靠右列（Layout 注入微表面），直接以 Agent 信息开始；
	 * 移动端覆盖层保留标题行与关闭按钮。分区（Agent 信息 / 记忆库 / 会话产物）用 details + .kit-collapse
	 * 折叠，默认展开；「会话产物」消费 chat.artifacts 紧凑文件行，点击预览、行尾按钮直接下载
	 * （与消息内 ArtifactCard 同一取数链路），无产物时保留空态占位；skills/MCP 需数据面支持（另行立项），不先上占位。 */
	const renderAsidePanel = ({ closeButton }: { closeButton: ReactNode }) => (
		<div className="flex min-h-0 flex-1 flex-col">
			{closeButton ? (
				<div className="flex min-h-14 shrink-0 items-center gap-2 border-b border-[var(--kit-border-subtle)] px-4">
					<span className="min-w-0 flex-1 truncate text-[length:var(--kit-text-label)] font-medium">
						{t("header.asideTrigger")}
					</span>
					{closeButton}
				</div>
			) : null}
			<div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:py-5">
				{agent ? (
					<AsidePanelSections
						agent={agent}
						resources={resources}
						memories={memories}
						multiAgent={chat.multiAgent}
						artifacts={chat.artifacts}
						onArtifactOpen={(fileId, contentType) => void openArtifact(fileId, contentType)}
						onArtifactDownload={(fileId) => void downloadArtifact(fileId)}
					/>
				) : null}
			</div>
		</div>
	);

	const shellProps = {
		view: "chat" as const,
		navigate,
		directory,
		agents,
		agentSlug,
		sessionId,
		dialogs,
		branding,
		...account,
	};
	if (agentsLoading)
		return (
			<ExperienceLayout {...shellProps}>
				<EmptyState title={t("common:loading")} loading />
			</ExperienceLayout>
		);
	if (agentsError)
		return (
			<ExperienceLayout {...shellProps}>
				<div className="p-6">
					<ErrorState message={agentsError} onRetry={reloadAgents} />
				</div>
			</ExperienceLayout>
		);
	if (!agent)
		return (
			<ExperienceLayout {...shellProps}>
				<EmptyState title={t("noAgents.title")} hint={t("noAgents.hint")} />
			</ExperienceLayout>
		);

	const attachmentItems = stagedAttachmentItems({
		files: stagedFiles,
		failures: failedFiles,
		pending: pendingFiles,
		t,
	});

	const { activeStatus, staleStatusId } = sidebarStatus(chat, sessionId, completedSessionId);

	return (
		<ExperienceLayout
			{...shellProps}
			activeStatus={activeStatus}
			staleStatusId={staleStatusId}
			aside={renderAsidePanel}
			asideOpen={asideOpen}
			asideLabel={t("header.asideLabel")}
			onAsideOpenChange={setAsideOpen}
			header={(menuToggle) => (
				// 通栏低页头：无边框，高度压到 44px；状态用纯文本，不用徽章按钮形态。
				<header className="flex min-h-11 shrink-0 items-center gap-2 px-3 md:px-4">
					{/* 返回广场入口：桌面在最左，移动端与抽屉开关并排。 */}
					<button
						type="button"
						data-testid="nav-plaza"
						aria-label={t("header.backToPlaza")}
						title={t("header.backToPlaza")}
						onClick={() => navigate({ view: "plaza" })}
						className="grid size-9 shrink-0 place-items-center rounded-[var(--kit-radius-sm)] text-[var(--kit-fg-muted)] transition-colors hover:bg-[var(--kit-bg-subtle)] hover:text-[var(--kit-fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]"
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							className="size-4"
						>
							<path d="M19 12H5" />
							<path d="m12 19-7-7 7-7" />
						</svg>
					</button>
					{menuToggle}
					<div className="flex min-w-0 flex-1 items-center gap-2">
						<Tooltip
							className="block min-w-0 flex-1 truncate text-[length:var(--kit-text-base)] font-semibold"
							content={headerTitle}
							overflowOnly
						>
							{headerTitle}
						</Tooltip>
						{/* 状态紧贴会话标题而不是页头最右：离视线焦点近，切换/重连/生成时更容易被注意到。 */}
						<span className="shrink-0">
							<StatusIndicator
								connected={chat.connected}
								turnRunning={chat.turnRunning}
								phase={chat.phase}
								connection={chat.connection}
								error={chat.streamError}
							/>
						</span>
					</div>
					<button
						type="button"
						aria-pressed={asideOpen}
						aria-label={asideOpen ? t("header.asideCollapse") : t("header.asideExpand")}
						title={asideOpen ? t("header.asideCollapse") : t("header.asideExpand")}
						onClick={() => setAsideOpen((value) => !value)}
						className={`grid size-9 shrink-0 place-items-center rounded-[var(--kit-radius-sm)] transition-colors hover:bg-[var(--kit-bg-subtle)] hover:text-[var(--kit-fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)] ${
							asideOpen ? "bg-[var(--kit-bg-subtle)] text-[var(--kit-fg)]" : "text-[var(--kit-fg-muted)]"
						}`}
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							className="size-4"
						>
							<rect x="3" y="4" width="18" height="16" rx="2" />
							<path d="M15 4v16" />
						</svg>
					</button>
					{/* 账号区由 ExperienceLayout 渲染在侧栏 footer，页头只保留导航与状态。 */}
				</header>
			)}
		>
			{quotaError && (
				<QuotaBanner
					details={quotaError}
					onRecovered={() => setQuotaError(null)}
					onOpenUsage={() => navigate({ view: "usage" })}
				/>
			)}
			{sendError ? (
				// 紧凑可关闭横幅：发送/下载/重命名等一次性失败提示不该是常驻大卡（对照 QuotaBanner 形态）。
				<div
					role="alert"
					className="mx-4 mt-3 flex min-w-0 shrink-0 items-start gap-2.5 rounded-[var(--kit-radius)] border border-[var(--kit-danger)]/40 bg-[var(--kit-surface)] p-3 text-[length:var(--kit-text-caption)] leading-relaxed [overflow-wrap:anywhere]"
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						className="mt-0.5 size-4 shrink-0 text-[var(--kit-danger)]"
					>
						<circle cx="12" cy="12" r="9" />
						<path d="M12 7v6m0 4h.01" />
					</svg>
					<p className="min-w-0 flex-1 text-[var(--kit-danger)]">{sendError}</p>
					<button
						type="button"
						aria-label={t("header.closeError")}
						onClick={() => setSendError(null)}
						className="grid size-6 shrink-0 place-items-center rounded-[var(--kit-radius-xs)] text-[var(--kit-fg-muted)] transition-colors duration-[var(--kit-duration-fast)] ease-[var(--kit-ease-out)] motion-reduce:transition-none hover:bg-[var(--kit-nav-active)] hover:text-[var(--kit-fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]"
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
							className="size-3.5"
						>
							<path d="M6 6l12 12M18 6L6 18" />
						</svg>
					</button>
				</div>
			) : null}
			<Chat
				variant="workspace"
				messages={chat.messages}
				multiAgent={chat.multiAgent}
				turnRunning={chat.turnRunning}
				sending={delivering}
				anchorRail
				skills={senderSkills}
				onStop={chat.stop}
				approvals={
					chat.approvals.length > 0 ? (
						<ToolApprovalGroup
							approvals={chat.approvals}
							onDecision={chat.submitApproval}
							onRefresh={chat.refreshApprovals}
							onStop={() => void chat.stop()}
						/>
					) : null
				}
				scrollKey={sessionId}
				onArtifactOpen={(fileId, contentType) => void openArtifact(fileId, contentType)}
				onArtifactDownload={(id) => void downloadArtifact(id)}
				onCopy={async (text) => {
					if (!(await host.copyText?.(text))) throw new Error(t("errors.copyFailed"));
				}}
				sender={
					<ExperienceSender
						key={draftScope}
						items={attachmentItems}
						skills={senderSkills}
						turnRunning={chat.turnRunning}
						canSend={sessionId === null || chat.canSend}
						disabled={agent === null || pendingFiles.length > 0 || quotaError !== null}
						processing={scanningFiles}
						onPickFile={(accept) => void pickAndUpload(accept ? { accept } : undefined)}
						onDrop={(files) => void upload(files)}
						onRemove={removeStagedFile}
						onSend={sendViaComposer}
						onStop={() => void chat.stop()}
					/>
				}
				empty={
					sessionLoading ? (
						<MessageListSkeleton />
					) : (
						/* 空态渲染在 MessageList 已居中的 48rem 阅读列内：此处不再加水平内缩与列宽，
						 * 否则开场白比消息内容多缩进一档，首条消息出现时会横跳。 */
						<div className="flex min-w-0 flex-1 items-center justify-center py-6">
							<div className="w-full min-w-0">
								<EmptyState
									title={agent.opening_remarks ?? t("emptyChat.chatWith", { name: agent.display_name })}
									hint={t("emptyChat.hint")}
								/>
								<Prompts
									className="w-full"
									wrap
									items={[...new Set(agent.suggested_prompts)].map((prompt) => ({
										key: prompt,
										label: prompt,
										disabled: quotaError !== null || scanningFiles,
									}))}
									onItemClick={({ data }) => void sendViaComposer(data.key)}
									classNames={{ list: "justify-center" }}
								/>
							</div>
						</div>
					)
				}
			/>
		</ExperienceLayout>
	);
}

/** 查询参数路由与统一外壳：全局目录（含目录动作确认弹窗）在壳层持有，侧栏与聊天页共用同一次列表请求。 */
function Shell({ branding, ...account }: MemberExperienceProps & { branding: Branding }) {
	const { view, agentSlug, sessionId, navigate } = useRoute();
	const { agents, loading: agentsLoading, error: agentsError, reload: reloadAgents } = useAgentCatalog();
	const directory = useSessionDirectory({
		activeSessionId: sessionId,
		// 归档/删除的正是当前打开会话时：清空地址回到新会话态，聊天页随路由重置。
		onActiveExecuted: () => navigate({ view: "chat", session: null }, { replace: true }),
	});
	const sessionDialog = (
		<SessionActionDialog
			busy={directory.actions.busy}
			pending={directory.actions.pending}
			onCancel={directory.actions.cancel}
			onConfirm={() => void directory.actions.confirm()}
		/>
	);
	if (view === "chat")
		return (
			<ChatView
				navigate={navigate}
				branding={branding}
				{...account}
				agentSlug={agentSlug}
				sessionId={sessionId}
				directory={directory}
				agents={agents}
				agentsLoading={agentsLoading}
				agentsError={agentsError}
				reloadAgents={reloadAgents}
				dialogs={sessionDialog}
			/>
		);
	return (
		<ExperienceLayout
			branding={branding}
			view={view}
			navigate={navigate}
			directory={directory}
			agents={agents}
			agentSlug={agentSlug}
			sessionId={sessionId}
			dialogs={sessionDialog}
			{...account}
		>
			{view === "usage" ? (
				<UsageView navigate={navigate} />
			) : view === "new" ? (
				/* 新建聊天页复用广场内容：只隐藏「Agent 广场」标题，前面加「最近使用」chips。 */
				<PlazaView
					navigate={navigate}
					heading={false}
					leading={<NewChatRecent navigate={navigate} directory={directory} agents={agents} />}
				/>
			) : (
				<PlazaView navigate={navigate} />
			)}
		</ExperienceLayout>
	);
}

export function App({ controller, branding }: { controller: MemberAuthController; branding: Branding }) {
	useEffect(() => {
		document.title = branding.productName.trim() || DEFAULT_BRAND_PRODUCT_NAME;
		const scheme = resolveHostCapabilities().preferredColorScheme?.();
		if (scheme === "dark") document.documentElement.dataset.kitTheme = scheme;
	}, [branding.productName]);
	return (
		<MemberAuthGate controller={controller}>{(account) => <Shell branding={branding} {...account} />}</MemberAuthGate>
	);
}
