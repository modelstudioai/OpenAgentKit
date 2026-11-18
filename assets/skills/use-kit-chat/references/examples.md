# 可编译示例

本页由随附的示例源文件生成。请按应用需求调整回调和运行时配置。

## agent-resources-panel.tsx

[源文件](../examples/agent-resources-panel.tsx)

```tsx
import { ArtifactCard, SubAgentPanel } from "@openagentpack/kit-chat-ui";
import type { ChatMultiAgent } from "@openagentpack/kit-sdk/chat";
import type {
	AgentMemoryStore,
	AgentResourceItem,
	AgentSummary,
	ArtifactDescriptor,
	RemoteAgentResources,
} from "@openagentpack/kit-sdk/protocol";
import type { ReactNode } from "react";

function ResourceSection({ title, children }: { title: string; children: ReactNode }) {
	return (
		<details open className="kit-collapse min-w-0 py-2">
			<summary className="cursor-pointer font-medium text-[var(--kit-fg)]">{title}</summary>
			<div className="mt-2 min-w-0 text-sm text-[var(--kit-fg-muted)]">{children}</div>
		</details>
	);
}

function ResourceList({ items }: { items: AgentResourceItem[] }) {
	return (
		<ul className="space-y-1">
			{items.map(({ name, permission }) => (
				<li key={name} className="wrap-anywhere">
					{name}
					{permission ? <span className="ml-2">{permission === "ask" ? "每次询问" : "始终允许"}</span> : null}
				</li>
			))}
		</ul>
	);
}

export function AgentResourcesPanel({
	agent,
	resources,
	multiAgent,
	artifacts,
	onArtifactOpen,
	onArtifactDownload,
}: {
	agent: AgentSummary | null;
	resources: (RemoteAgentResources & { memory_stores?: AgentMemoryStore[] }) | null;
	multiAgent?: ChatMultiAgent;
	artifacts: ArtifactDescriptor[];
	onArtifactOpen?: (fileId: string, contentType?: string) => void;
	onArtifactDownload?: (fileId: string) => void;
}) {
	return (
		<section aria-label="Agent 详情与资源" className="min-w-0 space-y-2">
			<ResourceSection title="Agent 信息">
				<p className="wrap-anywhere font-medium text-[var(--kit-fg)]">{agent?.display_name ?? "暂无 Agent 详情"}</p>
				{agent?.description ? <p className="mt-1 wrap-anywhere">{agent.description}</p> : null}
			</ResourceSection>
			<SubAgentPanel multiAgent={multiAgent} />
			{resources?.skills.length ? (
				<ResourceSection title="技能">
					<ResourceList items={resources.skills} />
				</ResourceSection>
			) : null}
			{resources?.mcp_servers.length ? (
				<ResourceSection title="MCP 服务">
					<ResourceList items={resources.mcp_servers} />
				</ResourceSection>
			) : null}
			{resources?.tools.length ? (
				<ResourceSection title="工具">
					<ResourceList items={resources.tools} />
				</ResourceSection>
			) : null}
			{resources?.memory_stores?.length ? (
				<ResourceSection title="记忆库">
					<ul className="space-y-2">
						{resources.memory_stores.map((store) => (
							<li key={store.name} className="wrap-anywhere">
								<p className="font-medium text-[var(--kit-fg)]">{store.name}</p>
								{store.description ? <p>{store.description}</p> : null}
							</li>
						))}
					</ul>
				</ResourceSection>
			) : null}
			<ResourceSection title="会话产物">
				{artifacts.length ? (
					<ul className="space-y-2">
						{artifacts.map(({ file_id, filename, content_type }) => (
							<li key={file_id} className="flex min-w-0">
								<ArtifactCard
									filename={filename ?? file_id}
									contentType={content_type}
									onOpen={onArtifactOpen && (() => onArtifactOpen(file_id, content_type))}
									onDownload={onArtifactDownload && (() => onArtifactDownload(file_id))}
								/>
							</li>
						))}
					</ul>
				) : (
					<p>本会话生成的文件会显示在这里。</p>
				)}
			</ResourceSection>
		</section>
	);
}
```

## approval-list.tsx

[源文件](../examples/approval-list.tsx)

```tsx
import { ToolApprovalCard } from "@openagentpack/kit-chat-ui";
import type { UseChatResult } from "@openagentpack/kit-sdk/chat/hooks";

export function ApprovalList({ chat }: { chat: UseChatResult }) {
	return (
		<section aria-label="工具审批">
			{chat.approvals.map((approval) => (
				<ToolApprovalCard
					key={JSON.stringify([approval.batch_id, approval.call_id])}
					approval={approval}
					onDecision={chat.submitApproval}
					onRefresh={chat.refreshApprovals}
				/>
			))}
		</section>
	);
}
```

## call-state.ts

[源文件](../examples/call-state.ts)

```ts
import { createMutation, createObservable, createQuery, type QuerySnapshot } from "@openagentpack/kit-sdk/state";

interface ResourceView<T> {
	query: QuerySnapshot<T>;
	mutation: { pending: boolean; error: string | null };
	editing: boolean;
}

/** 宿主提供后端调用，SDK 管理可订阅的调用状态。 */
export function bindResource<T, Input>(
	read: (signal: AbortSignal) => Promise<T>,
	write: (input: Input) => Promise<void>,
	render: (view: ResourceView<T>) => void,
) {
	const query = createQuery(read);
	const mutation = createMutation(write);
	const editing = createObservable(false);
	const publish = () =>
		render({ query: query.getSnapshot(), mutation: mutation.getSnapshot(), editing: editing.getSnapshot() });
	const subscriptions = [query.subscribe(publish), mutation.subscribe(publish), editing.subscribe(publish)];
	publish();
	void query.refresh();
	return {
		refresh: query.refresh,
		// 仅在用户显式操作后调用，错误会拒绝，写入禁止自动重试。
		save: mutation.run,
		setEditing: editing.set,
		dispose() {
			for (const unsubscribe of subscriptions) unsubscribe();
			query.dispose();
			mutation.dispose();
		},
	};
}
```

## controller.ts

[源文件](../examples/controller.ts)

```ts
import {
	createChatController,
	createSessionStore,
	type SessionSnapshot,
	type SessionStoreOptions,
} from "@openagentpack/kit-sdk/chat";
import type { ChatProvider } from "@openagentpack/kit-sdk/providers";

// 控制器可独立于 React 使用，由宿主负责销毁。
export function observeSession(
	provider: ChatProvider,
	sessionId: string,
	onChange: (snapshot: SessionSnapshot) => void,
) {
	const controller = createChatController(provider, sessionId);
	const unsubscribe = controller.subscribe(() => onChange(controller.getSnapshot()));
	const dispose = () => {
		unsubscribe();
		controller.dispose();
	};
	const ready = controller.connect().catch((error) => {
		dispose();
		throw error;
	});
	return { controller, ready, dispose };
}

// 直接使用 Store 时，宿主须通过 applyEvent 提供 SDK SessionEvent 快照，并管理生命周期。
// 常规对话接入用上面的控制器。
export function createLocalStore(sessionId: string, provider: ChatProvider) {
	const options: SessionStoreOptions = { transformMessage: provider.transformMessage?.bind(provider) };
	return createSessionStore(sessionId, options);
}
```

## custom-chat.tsx

[源文件](../examples/custom-chat.tsx)

```tsx
import { Chat, Sender } from "@openagentpack/kit-chat-ui";
import { useChat } from "@openagentpack/kit-sdk/chat/hooks";
import { KitError } from "@openagentpack/kit-sdk/protocol";
import type { ChatProvider } from "@openagentpack/kit-sdk/providers";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ApprovalList } from "./approval-list.tsx";

// 应用提供稳定的 Provider 实例和 createSession 函数。
// createSession 调用应用后端，返回真实的会话 ID。
export function CustomChat({
	provider,
	createSession,
}: {
	provider: ChatProvider;
	createSession: () => Promise<string>;
}) {
	const binding = useMemo(() => ({ provider, createSession }), [provider, createSession]);
	const [selection, setSelection] = useState<{ binding: typeof binding; id: string } | null>(null);
	const sessionId = selection?.binding === binding ? selection.id : null;
	const [draft, setDraft] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const sending = useRef<object | null>(null);
	const chat = useChat({ sessionId, provider });
	const active = useRef<typeof binding | null>(binding);
	useLayoutEffect(() => {
		active.current = binding;
		sending.current = null;
		setBusy(false);
		setError(null);
		return () => {
			active.current = null;
		};
	}, [binding]);
	const report = (cause: unknown) => {
		if (active.current === binding) setError(cause instanceof KitError ? cause.message : "请求失败，已保留草稿。");
	};
	const finish = (operation: object) => {
		// 旧请求结束时不能清理新后端的待处理状态。
		if (sending.current !== operation) return;
		sending.current = null;
		if (active.current === binding) setBusy(false);
	};

	async function send(text: string) {
		if (!text.trim() || sending.current || (sessionId !== null && !chat.canSend)) return;
		const operation = {};
		sending.current = operation;
		setBusy(true);
		setError(null);
		try {
			const target = sessionId ?? (await createSession());
			if (active.current !== binding) return;
			setSelection({ binding, id: target });
			// React 可能尚未提交新的会话选择，因此显式传入目标 ID。
			await chat.send(text.trim(), { sessionId: target });
			if (active.current === binding) setDraft((current) => (current === text ? "" : current));
		} catch (cause) {
			report(cause);
		} finally {
			finish(operation);
		}
	}

	return (
		<div className="flex h-full min-h-0 flex-col" data-kit-appearance="workspace">
			{(error || chat.streamError) && <p role="alert">{error ?? chat.streamError?.message}</p>}
			<Chat
				variant="workspace"
				messages={chat.messages}
				multiAgent={chat.multiAgent}
				scrollKey={sessionId}
				turnRunning={chat.turnRunning}
				approvals={chat.approvals.length > 0 ? <ApprovalList chat={chat} /> : null}
				onStop={() => chat.stop().catch(report)}
				sender={
					<Sender
						variant="workspace"
						value={draft}
						onChange={setDraft}
						loading={chat.turnRunning}
						submitDisabled={busy || (sessionId !== null && !chat.canSend)}
						onSubmit={(text) => void send(text)}
						onCancel={() => void chat.stop().catch(report)}
						placeholder={sessionId ? "发送消息" : "输入第一条消息以创建会话"}
					/>
				}
			/>
		</div>
	);
}
```

## default-chat.tsx

[源文件](../examples/default-chat.tsx)

```tsx
import { Chat, Sender } from "@openagentpack/kit-chat-ui";
import { useChat } from "@openagentpack/kit-sdk/chat/hooks";
import { KitError } from "@openagentpack/kit-sdk/protocol";
import { createKitClient, type KitClient } from "@openagentpack/kit-sdk/providers/kit";
import { KitProvider } from "@openagentpack/kit-sdk/providers/kit/react";
import { useRef, useState } from "react";
import { ApprovalList } from "./approval-list.tsx";

// 只初始化一次，从运行时配置读取 apiBaseUrl。
// getAppToken 只提供应用身份，百炼 API Key 保留在后端。
export function createDefaultClient(apiBaseUrl: string, getAppToken: () => Promise<string>) {
	return createKitClient({
		baseUrl: apiBaseUrl,
		headers: async () => ({ Authorization: `Bearer ${await getAppToken()}` }),
	});
}

export function DefaultChat({ client, sessionId }: { client: KitClient; sessionId: string | null }) {
	return (
		<KitProvider client={client}>
			<ChatPanel key={sessionId ?? "unselected"} sessionId={sessionId} />
		</KitProvider>
	);
}

function ChatPanel({ sessionId }: { sessionId: string | null }) {
	const chat = useChat(sessionId);
	const [draft, setDraft] = useState("");
	const [error, setError] = useState<string | null>(null);
	const sending = useRef(false);
	const report = (cause: unknown) => setError(cause instanceof KitError ? cause.message : "请求失败。");

	async function send(text: string) {
		if (!text.trim() || !chat.canSend || sending.current) return;
		sending.current = true;
		setError(null);
		try {
			await chat.send(text.trim());
			setDraft((current) => (current === text ? "" : current));
		} catch (cause) {
			report(cause);
		} finally {
			sending.current = false;
		}
	}

	return (
		<div className="flex h-full min-h-0 flex-col" data-kit-appearance="workspace">
			<p role="status">{`${chat.connection} / ${chat.phase}`}</p>
			{(error || chat.streamError) && <p role="alert">{error ?? chat.streamError?.message}</p>}
			<Chat
				variant="workspace"
				messages={chat.messages}
				multiAgent={chat.multiAgent}
				scrollKey={sessionId}
				turnRunning={chat.turnRunning}
				canSend={chat.canSend}
				onStop={() => chat.stop().catch(report)}
				approvals={chat.approvals.length > 0 ? <ApprovalList chat={chat} /> : null}
				sender={
					<Sender
						variant="workspace"
						value={draft}
						onChange={setDraft}
						loading={chat.turnRunning}
						submitDisabled={!chat.canSend}
						onSubmit={(text) => void send(text)}
						onCancel={() => void chat.stop().catch(report)}
						placeholder={sessionId ? "发送消息" : "选择会话后开始对话"}
					/>
				}
			/>
		</div>
	);
}
```

## discovery-usage.tsx

[源文件](../examples/discovery-usage.tsx)

```tsx
import { usePlaza } from "@openagentpack/kit-sdk/agents/hooks";
import { useKitClient } from "@openagentpack/kit-sdk/providers/kit/react";
import { useQuota, useQuotaRequests } from "@openagentpack/kit-sdk/usage/hooks";
import { useState } from "react";

// 与默认会话页挂载在同一个 KitProvider 内。
// 这些 Hook 使用 KitClient，显式 ChatProvider 只接管对话操作。
export function DiscoveryAndUsage() {
	const client = useKitClient();
	const plaza = usePlaza({ category: "general" });
	const usage = useQuota();
	const history = useQuotaRequests();
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function requestCredits() {
		if (pending) return;
		setPending(true);
		setError(null);
		try {
			await client.createQuotaRequest({ requestedCredits: 100, reason: "项目新增工作需要更多额度" });
			usage.reload();
			history.reload();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "请求失败");
		} finally {
			setPending(false);
		}
	}

	return (
		<section>
			<h2>可用 Agent</h2>
			{plaza.error ? <p role="alert">{plaza.error}</p> : null}
			<ul>
				{plaza.view?.agents.map((agent) => (
					<li key={agent.slug}>{agent.display_name}</li>
				))}
			</ul>
			<h2>月度用量</h2>
			{usage.error ? <p role="alert">{usage.error}</p> : null}
			<p>{usage.quota ? `已用 ${usage.quota.used} Credits` : "正在加载用量"}</p>
			<button
				type="button"
				disabled={pending || usage.loading || !usage.quota || Boolean(usage.quota.pending_request)}
				onClick={() => void requestCredits()}
			>
				申请 100 Credits
			</button>
			{error ? <p role="alert">{error}</p> : null}
			<ul>
				{history.requests.map((request) => (
					<li key={request.id}>{request.status}</li>
				))}
			</ul>
		</section>
	);
}
```

## experience-controller.ts

[源文件](../examples/experience-controller.ts)

```ts
import { createComposer, deriveTitle } from "@openagentpack/kit-sdk/chat";
import {
	type ArtifactHost,
	createArtifactActions,
	createAttachments,
	previewableArtifactType,
	resolveArtifactType,
} from "@openagentpack/kit-sdk/files";
import type { MemberUsageLimitView } from "@openagentpack/kit-sdk/protocol";
import type { KitClient } from "@openagentpack/kit-sdk/providers/kit";
import {
	createSessionActions,
	createSessionDetails,
	createSessionDirectory,
	createSessionSearch,
} from "@openagentpack/kit-sdk/sessions";
import { createQuotaRecovery, readQuotaExceeded, usageLimitsAllowSending } from "@openagentpack/kit-sdk/usage";

// 非 React 宿主管理订阅和销毁。每个控制器负责一项独立能力。
export function createExperienceControllers(client: KitClient, host: ArtifactHost) {
	const directory = createSessionDirectory(client);
	const search = createSessionSearch(client);
	const details = createSessionDetails(client, null);
	const actions = createSessionActions(client, () => directory.reload());
	const attachments = createAttachments(client);
	const composer = createComposer(client);
	const artifacts = createArtifactActions(client, host);
	const quota = createQuotaRecovery(client);
	directory.start();
	return {
		directory,
		search,
		details,
		actions,
		attachments,
		composer,
		artifacts,
		quota,
		dispose() {
			for (const controller of [directory, search, details, actions, attachments, composer, artifacts, quota])
				controller.dispose();
		},
	};
}
export function presentationHelpers(error: unknown, limits: MemberUsageLimitView) {
	return {
		title: deriveTitle("第一条消息"),
		quotaError: readQuotaExceeded(error),
		canRecover: usageLimitsAllowSending(limits),
		type: resolveArtifactType(undefined, "report.pdf", "application/octet-stream"),
		canPreview: previewableArtifactType("application/pdf"),
	};
}
```

## experience-data.tsx

[源文件](../examples/experience-data.tsx)

```tsx
import { useAgentResources } from "@openagentpack/kit-sdk/agents/hooks";
import { useChat } from "@openagentpack/kit-sdk/chat/hooks";
import type { ChatProvider } from "@openagentpack/kit-sdk/providers";
import type { KitClient } from "@openagentpack/kit-sdk/providers/kit";
import { useSessionDetails } from "@openagentpack/kit-sdk/sessions/hooks";
import { useUsageLimits } from "@openagentpack/kit-sdk/usage/hooks";

// 数据 Hook 支持显式 Client，也可通过 Context 兼容接入。
export function AgentResourceSummary({ slug }: { slug: string | null }) {
	const resources = useAgentResources(slug);
	return (
		<div>
			<p>{resources?.skills?.map((skill) => skill.name).join("、") || "暂无技能信息"}</p>
			<p>{resources?.memory_stores?.map((store) => store.name).join("、") || "暂无记忆库"}</p>
		</div>
	);
}

export function MemberLimitSummary() {
	const limits = useUsageLimits({ days: 30 });
	if (limits.loading) return <p role="status">正在加载限额…</p>;
	if (limits.error) return <p role="alert">{String(limits.error)}</p>;
	if (!limits.data) return <p>当前身份不是 Kit 本地成员</p>;
	return (
		<button type="button" onClick={() => void limits.reload()}>
			刷新用量限制
		</button>
	);
}

// 文件关联记录来自应用元数据。
export function ChatWithFileMetadata({
	client,
	sessionId,
	provider,
}: {
	client: KitClient;
	sessionId: string;
	provider: ChatProvider;
}) {
	const chat = useChat({ sessionId, provider });
	const details = useSessionDetails({ client, sessionId, setMessageFiles: chat.setMessageFiles });
	return details.error ? <p role="alert">{details.error}</p> : <p>{chat.messages.length} 条消息</p>;
}

export async function readUploadStatus(client: KitClient, fileId: string) {
	const status = await client.fileStatus(fileId);
	// 文件就绪前保留草稿，服务端也会校验文件状态和归属。
	return { ready: status.available, status: status.status };
}
```

## experience.tsx

[源文件](../examples/experience.tsx)

```tsx
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
import { useAgentCatalog, useAgentResources } from "@openagentpack/kit-sdk/agents/hooks";
import { useChat, useComposer } from "@openagentpack/kit-sdk/chat/hooks";
import type { ArtifactHost } from "@openagentpack/kit-sdk/files";
import { useArtifactActions, useAttachments } from "@openagentpack/kit-sdk/files/hooks";
import type { ChatProvider } from "@openagentpack/kit-sdk/providers";
import type { KitClient } from "@openagentpack/kit-sdk/providers/kit";
import { useSessionDetails, useSessionDirectory, useSessionSearch } from "@openagentpack/kit-sdk/sessions/hooks";
import { useQuotaRecovery, useUsageLimits } from "@openagentpack/kit-sdk/usage/hooks";
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
```

## member-auth.tsx

[源文件](../examples/member-auth.tsx)

```tsx
import {
	createMemberAuthController,
	type MemberAuthController,
	type MemberAuthOptions,
} from "@openagentpack/kit-sdk/auth";
import { useMemberAuth } from "@openagentpack/kit-sdk/auth/hooks";
import { KitProvider } from "@openagentpack/kit-sdk/providers/kit/react";
import type { FormEvent, ReactNode } from "react";

// 公开配置解析出最终 API URL 后调用一次。宿主存储按带路径前缀的完整 URL 隔离，
// 只保存会话令牌及有效期。
export function createLogin(options: MemberAuthOptions) {
	return createMemberAuthController(options);
}

export function MemberRoot({ controller, children }: { controller: MemberAuthController; children: ReactNode }) {
	const auth = useMemberAuth(controller);
	if (auth.status === "checking") return <p>正在恢复登录…</p>;
	if (auth.status === "error") {
		return (
			<section>
				<p role="alert">{auth.error}</p>
				<button type="button" onClick={() => void auth.retry()}>
					重试
				</button>
			</section>
		);
	}
	if (!auth.client) {
		const submit = async (event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			const form = event.currentTarget;
			const data = new FormData(form);
			try {
				await auth.login({
					username: String(data.get("username") ?? ""),
					password: String(data.get("password") ?? ""),
				});
			} catch {
				// 控制器在快照中提供可安全展示的错误。
			} finally {
				const password = form.elements.namedItem("password");
				if (password instanceof HTMLInputElement) password.value = "";
			}
		};
		return (
			<form onSubmit={submit}>
				<label>
					用户名 <input name="username" autoComplete="username" required disabled={auth.pending} />
				</label>
				<label>
					密码{" "}
					<input name="password" type="password" autoComplete="current-password" required disabled={auth.pending} />
				</label>
				{auth.error && <p role="alert">{auth.error}</p>}
				<button type="submit" disabled={auth.pending}>
					登录
				</button>
			</form>
		);
	}
	return (
		<KitProvider key={auth.generation} client={auth.client}>
			<header>
				{auth.member?.display_name}
				{auth.member && (
					<button type="button" onClick={() => void auth.logout()}>
						退出登录
					</button>
				)}
			</header>
			{children}
		</KitProvider>
	);
}
```
