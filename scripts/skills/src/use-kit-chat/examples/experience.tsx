import { useAgentCatalog, useAgentResources } from "@openagentkit/sdk/agents/hooks";
import { useChat, useComposer } from "@openagentkit/sdk/chat/hooks";
import type { ArtifactHost } from "@openagentkit/sdk/files";
import { useArtifactActions, useAttachments } from "@openagentkit/sdk/files/hooks";
import type { ChatProvider } from "@openagentkit/sdk/providers";
import type { KitClient } from "@openagentkit/sdk/providers/kit";
import { useSessionDetails, useSessionDirectory, useSessionSearch } from "@openagentkit/sdk/sessions/hooks";
import { useQuotaRecovery, useUsageLimits } from "@openagentkit/sdk/usage/hooks";
import {
	AgentHeader,
	type AttachmentItem,
	Attachments,
	Chat,
	ConfirmDialog,
	Layout,
	SessionSidebar,
	type SessionSidebarSection,
} from "@openagentpack/kit-chat-ui";
import { useState } from "react";
import { AgentResourcesPanel } from "./agent-resources-panel.tsx";
import { ApprovalList } from "./approval-list.tsx";

interface ConversationSelection {
	agentSlug: string;
	sessionId: string | null;
	section: SessionSidebarSection;
}

function SessionDeletionDialog({ actions }: { actions: ReturnType<typeof useSessionDirectory>["actions"] }) {
	const { pending, busy } = actions;
	if (!pending) return null;
	const { plan, error } = pending;
	const body = error ?? (plan ? JSON.stringify(plan.diff, null, 2) : "正在准备删除计划…");
	return (
		<ConfirmDialog
			title="确认删除会话"
			body={body}
			busy={busy}
			confirmLabel={plan ? "删除会话" : "准备计划"}
			cancelLabel="取消"
			onCancel={actions.cancel}
			onConfirm={() => void actions.confirm()}
		/>
	);
}

// 在组件外保持显式 Client、Provider 和宿主实例稳定。
export function Experience({
	client,
	provider,
	host,
	agentSlug: initialAgentSlug,
}: {
	client: KitClient;
	provider: ChatProvider;
	host: ArtifactHost;
	agentSlug: string;
}) {
	const [{ agentSlug, sessionId, section }, setSelection] = useState<ConversationSelection>({
		agentSlug: initialAgentSlug,
		sessionId: null,
		section: "groups",
	});
	const [keyword, setKeyword] = useState("");
	const [asideOpen, setAsideOpen] = useState(true);
	const [draftKey, setDraftKey] = useState(0);
	const chat = useChat({ sessionId, provider });
	const attachments = useAttachments({ client });
	function selectConversation(next: ConversationSelection) {
		if (next.sessionId !== sessionId || next.agentSlug !== agentSlug) {
			attachments.clear();
			setDraftKey((key) => key + 1);
		}
		setSelection(next);
	}
	const directory = useSessionDirectory({
		client,
		onExecuted: (id) => {
			if (id === sessionId) selectConversation({ agentSlug, sessionId: null, section: "groups" });
		},
	});
	const search = useSessionSearch(keyword, { client });
	const details = useSessionDetails({ client, sessionId, setMessageFiles: chat.setMessageFiles });
	const attachmentItems: AttachmentItem[] = [
		...attachments.pending.map((file) => ({ ...file, status: "uploading" as const })),
		...attachments.files.map((file) => ({
			uid: file.file_id,
			name: file.filename,
			size: file.size,
			status: file.timedOut ? ("error" as const) : ("done" as const),
			description: file.timedOut ? "扫描超时，请移除文件后重试。" : file.available ? null : "正在扫描…",
		})),
		...attachments.failures.map(({ message, ...file }) => ({
			...file,
			status: "error" as const,
			description: message,
		})),
	];
	// 等所有文件可用后再发送。先移除上传失败的文件。
	const attachmentsReady = !attachments.uploading && !attachments.processing && attachments.failures.length === 0;
	const composer = useComposer({
		client,
		agentSlug,
		sessionId,
		files: attachments.files,
		send: chat.send,
		onSessionCreated: (id) => {
			// 保留当前草稿以发送首条消息，并刷新侧栏目录。
			setSelection({ agentSlug, sessionId: id, section: "groups" });
			directory.reload();
		},
		onAccepted: attachments.consume,
	});
	const artifacts = useArtifactActions({ client, host, sessionId: sessionId ?? undefined, artifacts: chat.artifacts });
	const recovery = useQuotaRecovery({ client });
	const { agents } = useAgentCatalog({ client });
	const agent = agents.find((item) => item.slug === agentSlug) ?? null;
	const agentName = (slug: string) => agents.find((item) => item.slug === slug)?.display_name ?? slug;
	const resources = useAgentResources(agentSlug, { client });
	const skills = resources?.skills.map(({ name, description }) => ({ name, description }));
	const limits = useUsageLimits({ client });
	const canCreateSession = client.supports("createSession");
	const canSend = (sessionId ? chat.canSend : canCreateSession) && attachmentsReady && !composer.pending;
	const canReadArtifacts = Boolean(sessionId) && client.supports("downloadFile");
	const openArtifact = canReadArtifacts
		? (id: string, type?: string) => void artifacts.open(id, type).catch(() => undefined)
		: undefined;
	const downloadArtifact = canReadArtifacts
		? (id: string) => void artifacts.download(id).catch(() => undefined)
		: undefined;
	return (
		<div className="h-dvh" data-kit-appearance="workspace">
			<Layout
				sidebarLabel="会话"
				header={(menuToggle) => (
					<AgentHeader
						compact
						agent={agent}
						leading={menuToggle}
						actions={
							<button type="button" aria-expanded={asideOpen} onClick={() => setAsideOpen((open) => !open)}>
								资源
							</button>
						}
					/>
				)}
				sidebar={({ closeSidebar, closeButton }) => (
					<aside
						aria-label="会话导航"
						className="flex min-h-0 w-64 shrink-0 flex-col border-r border-[var(--kit-border-subtle)] bg-[var(--kit-bg-subtle)]"
					>
						<div className="flex shrink-0 items-center justify-between gap-2 p-3">
							{canCreateSession && (
								<button
									type="button"
									onClick={() => {
										selectConversation({ agentSlug, sessionId: null, section: "groups" });
										closeSidebar();
									}}
								>
									新建会话
								</button>
							)}
							{closeButton}
						</div>
						<SessionSidebar
							activeId={sessionId}
							activeSection={section}
							activeGroupId={section === "groups" && sessionId ? agentSlug : null}
							agentName={agentName}
							loading={directory.loading}
							error={directory.error}
							onReload={directory.reloadGroups}
							groups={directory.groups.map((group) => ({
								...group,
								id: group.slug,
								name: agentName(group.slug),
								onLoad: group.load,
								onLoadMore: group.loadMore,
								onRetry: group.retry,
							}))}
							recent={{ ...directory.recent, onLoadMore: directory.recent.loadMore, onRetry: directory.recent.retry }}
							searchInput={keyword}
							onSearchInput={setKeyword}
							search={keyword.trim() ? { ...search, onLoadMore: search.loadMore, onRetry: search.retry } : undefined}
							onSelect={(session, source) => {
								selectConversation({ agentSlug: session.agent_slug, sessionId: session.session_id, section: source });
								closeSidebar();
							}}
						/>
						{sessionId && client.supports("sessionPlan") && client.supports("deleteSession") && (
							<button
								type="button"
								className="shrink-0 p-3 text-left"
								onClick={() => void directory.actions.request(sessionId, "delete")}
							>
								准备删除
							</button>
						)}
					</aside>
				)}
				asideLabel="Agent 资源"
				asideOpen={asideOpen}
				onAsideOpenChange={setAsideOpen}
				aside={({ closeButton }) => (
					<div className="flex min-h-0 flex-1 flex-col">
						{closeButton ? (
							<div className="flex shrink-0 items-center justify-between gap-2 p-3">
								<span>资源</span>
								{closeButton}
							</div>
						) : null}
						<div className="min-h-0 flex-1 overflow-y-auto p-4">
							{artifacts.error ? <p role="alert">{artifacts.error}</p> : null}
							<AgentResourcesPanel
								agent={agent}
								resources={resources}
								multiAgent={chat.multiAgent}
								artifacts={chat.artifacts}
								onArtifactOpen={openArtifact}
								onArtifactDownload={downloadArtifact}
							/>
						</div>
					</div>
				)}
				dialogs={<SessionDeletionDialog actions={directory.actions} />}
			>
				<section aria-label="对话" className="flex min-h-0 flex-1 flex-col">
					{details.error ? <p role="alert">{details.error}</p> : null}
					{client.supports("uploadFile") && client.supports("fileStatus") && (
						<Attachments
							items={attachmentItems}
							onSelectFiles={(files) => void attachments.upload(files)}
							onRemove={(file) => attachments.remove(file.uid)}
						/>
					)}
					<Chat
						key={draftKey}
						variant="workspace"
						messages={chat.messages}
						multiAgent={chat.multiAgent}
						scrollKey={sessionId}
						turnRunning={chat.turnRunning}
						sending={composer.pending}
						canSend={canSend}
						skills={skills}
						approvals={chat.approvals.length ? <ApprovalList chat={chat} /> : null}
						onSend={composer.send}
						onStop={chat.stop}
						onArtifactOpen={openArtifact}
						onArtifactDownload={downloadArtifact}
					/>
					{composer.error ? <p role="alert">发送失败，已保留草稿和附件。</p> : null}
					{limits.error && <p role="alert">{limits.error}</p>}
					<button type="button" disabled={recovery.loading} onClick={() => void recovery.recheck()}>
						重新检查服务端限额
					</button>
				</section>
			</Layout>
		</div>
	);
}
