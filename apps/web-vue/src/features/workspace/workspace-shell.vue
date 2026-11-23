<script setup lang="ts">
import { useAgentCatalog, useAgentResources } from "@openagentkit/sdk/agents/hooks-vue";
import { deriveTitle } from "@openagentkit/sdk/chat";
import { useChat } from "@openagentkit/sdk/chat/hooks-vue";
import { useArtifactActions, useAttachments } from "@openagentkit/sdk/files/hooks-vue";
import { useIsMobile } from "@openagentkit/sdk/hooks-vue";
import type { MemberView, SessionSummary } from "@openagentkit/sdk/protocol";
import type { ChatProvider } from "@openagentkit/sdk/providers";
import type { KitClient } from "@openagentkit/sdk/providers/kit";
import type { SessionAction } from "@openagentkit/sdk/sessions";
import { useSessionDetails, useSessionDirectory } from "@openagentkit/sdk/sessions/hooks-vue";
import { type QuotaExceededDetails, readQuotaExceeded } from "@openagentkit/sdk/usage";
import {
	type AttachmentItem,
	Chat,
	ConfirmDialog,
	EmptyState,
	ErrorState,
	Layout,
	Menu,
	MenuContent,
	MenuItem,
	MenuTrigger,
	MessageListSkeleton,
	Prompts,
	SessionSidebar,
	type SessionSidebarGroup,
	type SessionSidebarPage,
	type SessionSidebarSection,
	StatusIndicator,
	ToolApprovalGroup,
	Tooltip,
} from "@openagentpack/kit-chat-ui-vue";
import { computed, defineComponent, nextTick, ref, type VNode, watch } from "vue";
import { useTranslation } from "../../i18n/index.ts";
import type { Branding } from "../../lib/branding.ts";
import {
	requestCompletionNotificationPermission,
	showCompletionNotification,
} from "../../lib/browser-notifications.ts";
import { createArtifactHost, resolveHostCapabilities } from "../../lib/host.ts";
import { useRoute } from "../../lib/use-route.ts";
import LanguageSwitcher from "../auth/language-switcher.vue";
import MemberAccount from "../auth/member-account.vue";
import ArtifactCard from "../chat/artifact-card.vue";
import AsidePanel from "../chat/aside-panel.vue";
import ExperienceSender from "../chat/experience-sender.vue";
import NewChatRecent from "../plaza/new-chat-recent.vue";
import PlazaView from "../plaza/plaza-view.vue";
import QuotaBanner from "../usage/quota-banner.vue";
import UsageView from "../usage/usage-view.vue";

const props = defineProps<{
	member: MemberView | null;
	client: KitClient;
	chatProvider: ChatProvider;
	branding: Branding;
}>();

const emit = defineEmits<{ logout: [] }>();
const { t } = useTranslation(["workspace", "auth", "layout", "chat"]);

/** 把 Layout 通过 header 插槽交给业务页头的 VNode 挂载到模板内。 */
const VNodeHost = defineComponent({
	name: "VNodeHost",
	props: { node: { type: Object as () => VNode | null, default: null } },
	setup(props) {
		return () => props.node;
	},
});
const { view, agentSlug, sessionId, navigate } = useRoute();
const goToUsage = () => navigate({ view: "usage" });

const directory = useSessionDirectory({
	client: props.client,
	// 归档/删除的正是当前打开会话时：清空地址回到新会话态，聊天页随路由重置。
	onExecuted: (id) => {
		if (id === sessionId.value) navigate({ view: "chat", session: null }, { replace: true });
	},
});
const agents = useAgentCatalog({ client: props.client });
const search = ref("");
const selectedAgent = ref("");
const selectedFrom = ref<{ sessionId: string; section: SessionSidebarSection } | null>(null);
const editing = ref<{ id: string; section: SessionSidebarSection } | null>(null);
const actionError = ref<string | null>(null);
/** 会话行操作菜单的触发按钮：弹窗取消后焦点必须回到它。 */
const actionTrigger = ref<HTMLElement | null>(null);
const sending = ref(false);
const sendError = ref<string | null>(null);
const quotaError = ref<QuotaExceededDetails | null>(null);
const completedSessionId = ref<string | null>(null);
const brandLogoFailed = ref(false);
const chat = useChat(() => ({ sessionId: sessionId.value, provider: props.chatProvider }));

const currentAgent = computed(() => {
	const slug = agentSlug.value ?? selectedAgent.value;
	return agents.agents.value.find((agent) => agent.slug === slug) ?? agents.agents.value[0] ?? null;
});
const activeSession = computed(() => {
	if (!sessionId.value) return null;
	for (const group of directory.snapshot.value.groups) {
		const found = group.sessions.find((session) => session.session_id === sessionId.value);
		if (found) return found;
	}
	return directory.snapshot.value.recent.sessions.find((session) => session.session_id === sessionId.value) ?? null;
});
const headerTitle = computed(() => {
	if (!sessionId.value) return currentAgent.value?.display_name ?? t("chat:newSession");
	const detail = sessionDetails.snapshot.value.data;
	const opened = activeSession.value ?? (detail?.session_id === sessionId.value ? detail : null);
	return opened?.title || opened?.agent_slug || t("chat:untitledSession");
});
const mobileTitle = computed(() => {
	if (view.value === "plaza") return t("layout:views.plaza");
	if (view.value === "usage") return t("layout:views.usage");
	if (view.value === "chat") return headerTitle.value;
	return currentAgent.value?.display_name ?? props.branding.productName;
});
/** 侧栏打开行实时状态：流式/审批/失败优先，刚完成标记只属于当前停留的会话。 */
const activeStatus = computed(() => {
	if (chat.streamError.value && chat.connection.value !== "reconnecting") return undefined;
	const phase = chat.phase.value;
	if (phase === "running" || phase === "stopping" || (!phase && chat.turnRunning.value)) return "running";
	if (phase === "requires_action") return "attention";
	if (phase === "failed") return "failed";
	if (completedSessionId.value === sessionId.value) return "completed";
	return undefined;
});
/** 会话流硬错误期间，索引里的状态不可信：压掉该行滞留状态，避免把错误显示成运行中。 */
const staleStatusId = computed(() =>
	chat.streamError.value && chat.connection.value !== "reconnecting" ? sessionId.value : null,
);
function distrustSessions(sessions: SessionSummary[]): SessionSummary[] {
	const stale = staleStatusId.value;
	if (!stale) return sessions;
	return sessions.map((session) =>
		session.session_id === stale
			? { ...session, status: session.status === "archived" ? session.status : undefined }
			: session,
	);
}
watch([sessionId, () => chat.phase.value], (next, prev) => {
	const [currentSession, phase] = next;
	const [previousSession, previousPhase] = prev;
	if (previousSession !== currentSession) {
		completedSessionId.value = null;
		return;
	}
	if (phase === "running") completedSessionId.value = null;
	else if (phase === "idle" && (previousPhase === "running" || previousPhase === "requires_action")) {
		completedSessionId.value = currentSession;
		showCompletionNotification({
			title: t("chat:notification.completedTitle", {
				name: currentAgent.value?.display_name ?? props.branding.productName,
			}),
			body: t("chat:notification.completedBody"),
			tag: currentSession ?? "kit-chat",
			...(props.branding.logoUrl ? { icon: props.branding.logoUrl } : {}),
		});
	}
});
watch(
	() => props.branding.logoUrl,
	() => (brandLogoFailed.value = false),
);
const isMobile = useIsMobile();
const asideOpen = ref(!isMobile.value);
watch(isMobile, (mobile) => {
	asideOpen.value = !mobile;
});

const attachments = useAttachments({ client: props.client });
const stagedFiles = computed(() => attachments.snapshot.value.files);
const failedFiles = computed(() => attachments.snapshot.value.failures);
const pendingFiles = computed(() => attachments.snapshot.value.pending);
const processingFiles = attachments.processing;
const attachmentItems = computed<AttachmentItem[]>(() => [
	...stagedFiles.value.map((file) => ({
		uid: file.file_id,
		name: file.filename,
		size: file.size,
		status: file.timedOut ? ("error" as const) : ("done" as const),
		description: file.available
			? undefined
			: file.timedOut
				? t("chat:attachment.scanTimeout")
				: t("chat:attachment.scanning"),
	})),
	...failedFiles.value.map((file) => ({
		uid: file.uid,
		name: file.name,
		size: file.size,
		status: "error" as const,
		description: file.message,
	})),
	...pendingFiles.value.map((file) => ({
		uid: file.uid,
		name: file.name,
		size: file.size,
		status: "uploading" as const,
	})),
]);

const currentAgentSlug = computed(() => currentAgent.value?.slug ?? null);
const agentResources = useAgentResources(currentAgentSlug, { client: props.client });
const resources = computed(() => agentResources.resources.value);
/** 输入选择器与消息气泡共用同一份技能清单：气泡按名称把 /skill 还原成 chip。 */
const senderSkills = computed(() =>
	(resources.value?.skills ?? []).map(({ name, description }) => ({
		name,
		...(description ? { description } : {}),
	})),
);
const memories = computed(() => resources.value?.memory_stores ?? null);
const host = resolveHostCapabilities();
const artifactHost = createArtifactHost(host);
const artifactActions = useArtifactActions(() => ({
	client: props.client,
	host: artifactHost,
	sessionId: sessionId.value ?? undefined,
	artifacts: chat.artifacts.value,
}));
const sessionDetails = useSessionDetails(() => ({
	client: props.client,
	sessionId: sessionId.value,
	setMessageFiles: chat.setMessageFiles,
}));

const agentName = (slug: string) => agents.agents.value.find((agent) => agent.slug === slug)?.display_name ?? slug;
const groups = computed<SessionSidebarGroup[]>(() => {
	return directory.snapshot.value.groups.map((group) => ({
		id: group.slug,
		name: agentName(group.slug),
		sessions: distrustSessions(group.sessions),
		initialized: group.initialized,
		loading: group.loading,
		loadingMore: group.loadingMore,
		hasMore: group.hasMore,
		onLoad: group.load,
		onRetry: group.retry,
		onLoadMore: group.loadMore,
	}));
});
const recent = computed<SessionSidebarPage>(() => ({
	sessions: distrustSessions(directory.snapshot.value.recent.sessions),
	initialized: directory.snapshot.value.recent.initialized,
	loading: directory.snapshot.value.recent.loading,
	loadingMore: directory.snapshot.value.recent.loadingMore,
	hasMore: directory.snapshot.value.recent.hasMore,
	error: directory.snapshot.value.recent.error,
	onRetry: directory.snapshot.value.recent.retry,
	onLoadMore: directory.snapshot.value.recent.loadMore,
}));

/** 新建聊天页「最近使用」：按会话目录里的 Agent 活动序取前 5 个，回目录补全名称与图标。 */
const recentAgents = computed(() => {
	const rows = [];
	for (const group of directory.snapshot.value.groups) {
		const agent = agents.agents.value.find((item) => item.slug === group.slug);
		if (!agent) continue;
		rows.push(agent);
		if (rows.length === 5) break;
	}
	return rows;
});
const activeSection = computed<SessionSidebarSection>(() =>
	selectedFrom.value?.sessionId === sessionId.value ? selectedFrom.value.section : "groups",
);
const activeGroupId = computed(() => (sessionId.value && activeSection.value === "groups" ? agentSlug.value : null));

const pendingAction = computed(() => directory.actions.value.pending);
const actionBusy = computed(() => directory.actions.value.busy);
const dialogTitle = computed(() =>
	pendingAction.value?.action === "archive"
		? t("chat:sessionDialog.archiveTitle")
		: t("chat:sessionDialog.deleteTitle"),
);
const dialogBody = computed(() => {
	const pending = pendingAction.value;
	if (!pending) return "";
	if (pending.error) return pending.error;
	if (!pending.plan) return t("chat:sessionDialog.planning");
	return [
		pending.action === "archive" ? t("chat:sessionDialog.archiveEffect") : t("chat:sessionDialog.deleteEffect"),
		...pending.plan.diff.map((item) => `${item.resource} → ${item.action}`),
		...(actionBusy.value ? [t("chat:sessionDialog.busyNote")] : []),
	].join("\n\n");
});
const dialogConfirmLabel = computed(() => {
	if (actionBusy.value) return t("chat:sessionDialog.processing");
	return pendingAction.value?.plan ? t("chat:sessionDialog.confirm") : t("chat:sessionDialog.refetchPlan");
});

watch(
	agentSlug,
	(slug) => {
		if (slug) selectedAgent.value = slug;
	},
	{ immediate: true },
);
watch(
	() => agents.agents.value,
	(list) => {
		if (!selectedAgent.value && list[0]) selectedAgent.value = list[0].slug;
	},
	{ immediate: true },
);

function brandLogoSrc(value: string): string {
	try {
		return new URL(value, window.location.href).toString();
	} catch {
		return value;
	}
}

function goToPlaza() {
	navigate({ view: "plaza" });
}

function select(session: SessionSummary, section: SessionSidebarSection) {
	selectedFrom.value = { sessionId: session.session_id, section };
	navigate({ view: "chat", agent: session.agent_slug, session: session.session_id });
}

function openAgent(slug: string) {
	selectedAgent.value = slug;
	selectedFrom.value = null;
	navigate({ view: "chat", agent: slug, session: null });
}

async function newSessionForAgent(slug: string) {
	actionError.value = null;
	try {
		const listed = await directory.checkAgent(slug);
		if (!listed) {
			actionError.value = t("layout:errors.agentDelisted");
			return false;
		}
		if (!agents.agents.value.some((agent) => agent.slug === slug)) {
			actionError.value = t("layout:errors.agentUpdated");
			return false;
		}
		selectedAgent.value = slug;
		navigate({ view: "chat", agent: slug, session: null });
		return true;
	} catch {
		actionError.value = t("layout:errors.agentCheckFailed");
		return false;
	}
}

function rowAction(session: SessionSummary, section: SessionSidebarSection, action: "rename" | SessionAction) {
	if (action === "rename") {
		editing.value = { id: session.session_id, section };
		return;
	}
	void directory.requestAction(session.session_id, action);
}

async function renameSession(id: string, title: string) {
	actionError.value = null;
	try {
		await directory.rename(id, title);
	} catch (error) {
		actionError.value = t("layout:errors.renameFailed", {
			message: error instanceof Error ? error.message : String(error),
		});
	}
}

function finishEditing(id: string) {
	if (editing.value?.id === id) editing.value = null;
}

function loadMore({ section, groupId }: { section: SessionSidebarSection; groupId?: string }) {
	if (section === "recent") {
		directory.snapshot.value.recent.loadMore();
		return;
	}
	directory.snapshot.value.groups.find((group) => group.slug === groupId)?.loadMore();
}

function rememberActionTrigger(event: MouseEvent) {
	if (event.currentTarget instanceof HTMLElement) actionTrigger.value = event.currentTarget;
	// 菜单在下一个 tick 挂载；把焦点交给首项，键盘 Enter 才能直接执行命令。
	let attempts = 0;
	const focusFirst = () => {
		const item = document.querySelector<HTMLElement>('[role="menu"] [role="menuitem"]');
		if (item) {
			item.focus({ preventScroll: true });
			return;
		}
		if (attempts++ < 20) requestAnimationFrame(focusFirst);
	};
	void nextTick(() => requestAnimationFrame(focusFirst));
}

function cancelAction() {
	directory.cancelAction();
	const target = actionTrigger.value;
	if (!target) return;
	void nextTick(() => requestAnimationFrame(() => target.focus({ preventScroll: true })));
}

function confirmAction() {
	if (!actionBusy.value) void directory.confirmAction();
}

function startNewChat(closeSidebar: () => void) {
	navigate({ view: "new" });
	closeSidebar();
}

async function uploadFiles(files: File[]) {
	if (files.length === 0) return;
	try {
		await attachments.upload(files);
	} catch (error) {
		sendError.value = error instanceof Error ? error.message : String(error);
	}
}

function removeAttachment(fileId: string) {
	attachments.remove(fileId);
}

async function pickAndUpload(accept?: string) {
	const files = await host.pickFiles?.({ multiple: true, accept });
	if (files?.length) await uploadFiles(files);
}

async function copyMessageText(text: string) {
	if (!(await host.copyText?.(text))) throw new Error(t("chat:errors.copyFailed"));
}

async function openArtifact(fileId: string, contentType?: string) {
	try {
		await artifactActions.open(fileId, contentType);
	} catch (error) {
		sendError.value = error instanceof Error ? error.message : t("chat:errors.previewFailed");
	}
}

async function downloadArtifact(fileId: string) {
	try {
		await artifactActions.download(fileId);
	} catch (error) {
		sendError.value = error instanceof Error ? error.message : t("chat:errors.downloadFailed");
	}
}

async function createSessionWithAttachments(
	slug: string,
	text: string,
	files: { file_id: string; filename: string }[],
): Promise<{ session_id: string }> {
	for (let attempt = 1; ; attempt += 1) {
		try {
			return await props.client.createSession({
				agentSlug: slug,
				title: deriveTitle(text),
				...(files.length ? { files } : {}),
			});
		} catch (error) {
			const shape = error as { code?: string; retryable?: boolean };
			const retry = files.length > 0 && shape?.code === "conflict" && shape.retryable === true && attempt < 3;
			if (!retry) throw error;
			await new Promise((resolve) => setTimeout(resolve, 3000));
		}
	}
}

async function send(text: string, skills?: string[]): Promise<boolean> {
	if (sending.value) return false;
	// 在发送这一用户手势内申请通知权限；浏览器不支持或拒绝时静默跳过。
	void requestCompletionNotificationPermission();
	sending.value = true;
	sendError.value = null;
	try {
		const readyFiles = stagedFiles.value.filter((file) => file.available);
		const attachmentRefs = readyFiles.map((file) => ({ file_id: file.file_id, filename: file.filename }));
		let activeSessionId = sessionId.value;
		if (!activeSessionId) {
			const slug = currentAgent.value?.slug;
			if (!slug) return false;
			const created = await createSessionWithAttachments(slug, text, attachmentRefs);
			activeSessionId = created.session_id;
			navigate({ view: "chat", agent: slug, session: activeSessionId }, { replace: true });
			await directory.reload();
		}
		// 先建会话再发送：useChat.send 显式接收 sessionId，不依赖路由更新后的 watcher 时序。
		await chat.send(text, {
			sessionId: activeSessionId,
			...(attachmentRefs.length ? { attachments: attachmentRefs } : {}),
			skills,
		});
		attachments.consume(readyFiles.map((file) => file.file_id));
		directory.refreshStatuses();
		return true;
	} catch (error) {
		const exceeded = readQuotaExceeded(error);
		if (exceeded) {
			quotaError.value = exceeded;
			sendError.value = null;
			return false;
		}
		sendError.value = error instanceof Error ? error.message : String(error);
		return false;
	} finally {
		sending.value = false;
	}
}
</script>

<template>
	<Layout
		:mobile-title="mobileTitle"
		:aside-open="asideOpen"
		:aside-label="t('chat:header.asideLabel')"
		@aside-open-change="(open) => (asideOpen = open)"
	>
		<template #aside>
			<AsidePanel
				v-if="currentAgent"
				:agent="currentAgent"
				:resources="resources"
				:memories="memories"
				:artifacts="chat.artifacts.value"
				:multi-agent="chat.multiAgent.value"
				:on-close="() => (asideOpen = false)"
				:on-artifact-open="openArtifact"
				:on-artifact-download="downloadArtifact"
			/>
		</template>
		<template #sidebar="{ closeSidebar, closeButton }">
			<SessionSidebar
				:groups="groups"
				:recent="recent"
				:active-id="sessionId"
				:active-status="activeStatus"
				:active-section="activeSection"
				:active-group-id="activeGroupId"
				:editing="editing"
				:action-error="actionError"
				:search-input="search"
				:loading="directory.snapshot.value.loading"
				:error="directory.snapshot.value.error"
				:agent-name="agentName"
				@select="
					(session, section) => {
						select(session, section);
						closeSidebar();
					}
				"
				@new-chat="
					(slug) => void newSessionForAgent(slug).then((opened) => opened && closeSidebar())
				"
				@edited="renameSession"
				@edit-end="finishEditing"
				@load-more="loadMore"
				@dismiss-error="actionError = null"
				@reload="() => void directory.reload()"
				@search-input="(value) => (search = value)"
			>
				<template #menu="{ session, section }">
					<Menu>
						<MenuTrigger as-child>
							<button
								type="button"
								:aria-label="t('layout:moreActions')"
								:title="t('layout:moreActions')"
								class="grid size-full cursor-pointer place-items-center rounded-[var(--kit-radius-sm)] outline-none"
								@click="rememberActionTrigger"
							>
								<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4">
									<circle cx="5" cy="12" r="1.5" />
									<circle cx="12" cy="12" r="1.5" />
									<circle cx="19" cy="12" r="1.5" />
								</svg>
							</button>
						</MenuTrigger>
						<MenuContent align="end">
							<MenuItem @select="rowAction(session, section, 'rename')">{{ t("layout:rename") }}</MenuItem>
							<MenuItem @select="rowAction(session, section, 'archive')">{{ t("layout:archive") }}</MenuItem>
							<MenuItem class="text-[var(--kit-danger)]" @select="rowAction(session, section, 'delete')">
								{{ t("layout:delete") }}
							</MenuItem>
						</MenuContent>
					</Menu>
				</template>
				<template #header>
					<div class="flex min-h-14 shrink-0 items-center gap-3 px-5 py-3">
						<img
							v-if="branding.logoUrl && !brandLogoFailed"
							data-testid="brand-logo"
							:src="brandLogoSrc(branding.logoUrl)"
							alt=""
							aria-hidden="true"
							class="size-8 shrink-0 rounded-[var(--kit-radius-sm)] object-contain"
							@error="brandLogoFailed = true"
						/>
						<div
							v-else
							data-testid="brand-logo-fallback"
							aria-hidden="true"
							class="grid size-8 shrink-0 place-items-center rounded-[var(--kit-radius-sm)] bg-[var(--kit-fg)] text-[length:var(--kit-text-label)] font-semibold text-[var(--kit-bg)]"
						>
							{{ (branding.productName.trim() || "K").charAt(0).toUpperCase() }}
						</div>
						<span
							data-testid="brand-name"
							:title="branding.productName"
							class="min-w-0 flex-1 truncate text-[length:var(--kit-text-base)] leading-tight font-semibold"
						>
							{{ branding.productName }}
						</span>
						<VNodeHost v-if="closeButton" :node="closeButton" />
					</div>
					<div class="shrink-0 px-3 pb-1">
						<button
							type="button"
							data-testid="sidebar-new-chat"
							:disabled="agents.agents.value.length === 0"
							class="flex w-full cursor-pointer items-center gap-2 rounded-[var(--kit-radius)] bg-[var(--kit-accent)] px-3 py-2 text-left text-[length:var(--kit-text-label)] font-medium text-[var(--kit-accent-fg)] transition-[opacity,transform] duration-[var(--kit-duration-fast)] ease-[var(--kit-ease-out)] motion-reduce:transition-none hover:opacity-90 active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)] disabled:cursor-not-allowed disabled:opacity-50"
							@click="startNewChat(closeSidebar)"
						>
							<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-3.5">
								<path d="M12 5v14M5 12h14" stroke-linecap="round" />
							</svg>
							{{ t("layout:newChat") }}
						</button>
					</div>
					<nav :aria-label="t('layout:navAria')" class="shrink-0 px-3 pt-1 pb-1">
						<button
							type="button"
							data-testid="sidebar-nav-plaza"
							:aria-current="view === 'plaza' ? 'page' : undefined"
							class="flex w-full items-center gap-2 rounded-[var(--kit-radius-sm)] px-2.5 py-1.5 text-left text-[length:var(--kit-text-label)] transition-colors duration-[var(--kit-duration-fast)] ease-[var(--kit-ease-out)] motion-reduce:transition-none hover:bg-[var(--kit-nav-active)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]"
							:class="view === 'plaza' ? 'bg-[var(--kit-nav-active)] font-medium' : ''"
							@click="
								() => {
									goToPlaza();
									closeSidebar();
								}
							"
						>
							<svg
								aria-hidden="true"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								class="size-4 shrink-0"
								:class="view === 'plaza' ? 'text-[var(--kit-fg)]' : 'text-[var(--kit-fg-muted)]'"
							>
								<rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
								<rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
								<rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
								<rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
							</svg>
							{{ t("layout:plaza") }}
						</button>
					</nav>
				</template>
				<template #footer>
					<div class="flex shrink-0 items-center gap-1 border-t border-[var(--kit-border-subtle)] px-3 py-2">
						<MemberAccount :member="member" :on-logout="() => emit('logout')">
							<template #language><LanguageSwitcher /></template>
						</MemberAccount>
						<span class="min-w-0 flex-1" />
						<button
							type="button"
							data-testid="sidebar-usage"
							:aria-label="t('layout:views.usage')"
							:title="t('layout:views.usage')"
							:aria-pressed="view === 'usage'"
							class="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--kit-radius-sm)] px-2.5 py-1.5 text-[length:var(--kit-text-label)] transition-colors duration-[var(--kit-duration-fast)] ease-[var(--kit-ease-out)] motion-reduce:transition-none hover:bg-[var(--kit-nav-active)] hover:text-[var(--kit-fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]"
							:class="view === 'usage' ? 'bg-[var(--kit-nav-active)] text-[var(--kit-fg)]' : 'text-[var(--kit-fg-muted)]'"
							@click="
								() => {
									goToUsage();
									closeSidebar();
								}
							"
						>
							<svg
								aria-hidden="true"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="size-4"
							>
								<path d="M3 12h4l3-8 4 16 3-8h4" />
							</svg>
							{{ t("layout:views.usage") }}
						</button>
					</div>
				</template>
			</SessionSidebar>
		</template>

		<template v-if="view === 'chat'" #header="{ menuToggle }">
			<header class="flex min-h-11 shrink-0 items-center gap-2 px-3 md:px-4">
				<button
					type="button"
					data-testid="nav-plaza"
					:aria-label="t('workspace:backToPlaza')"
					:title="t('workspace:backToPlaza')"
					class="grid size-9 shrink-0 place-items-center rounded-[var(--kit-radius-sm)] text-[var(--kit-fg-muted)] transition-colors hover:bg-[var(--kit-bg-subtle)] hover:text-[var(--kit-fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]"
					@click="goToPlaza"
				>
					<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="size-4">
						<path d="M19 12H5" />
						<path d="m12 19-7-7 7-7" />
					</svg>
				</button>
				<VNodeHost v-if="menuToggle" :node="menuToggle" />
				<Tooltip
					class="block min-w-0 flex-1 truncate text-[length:var(--kit-text-base)] font-semibold"
					:content="headerTitle"
					overflow-only
				>
					{{ headerTitle }}
				</Tooltip>
				<StatusIndicator
					:connected="chat.connected.value"
					:turn-running="chat.turnRunning.value"
					:phase="chat.phase.value"
					:connection="chat.connection.value"
					:error="chat.streamError.value"
				/>
				<button
					type="button"
					:aria-pressed="asideOpen"
					:aria-label="asideOpen ? t('chat:header.asideCollapse') : t('chat:header.asideExpand')"
					:title="asideOpen ? t('chat:header.asideCollapse') : t('chat:header.asideExpand')"
					class="grid size-9 shrink-0 place-items-center rounded-[var(--kit-radius-sm)] transition-colors hover:bg-[var(--kit-bg-subtle)] hover:text-[var(--kit-fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]"
					:class="asideOpen ? 'bg-[var(--kit-bg-subtle)] text-[var(--kit-fg)]' : 'text-[var(--kit-fg-muted)]'"
					@click="asideOpen = !asideOpen"
				>
					<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="size-4">
						<rect x="3" y="4" width="18" height="16" rx="2" />
						<path d="M15 4v16" />
					</svg>
				</button>
			</header>
		</template>

		<UsageView v-if="view === 'usage'" :client="props.client" @open-agent="openAgent" />
		<PlazaView
			v-else-if="view === 'plaza' || view === 'new'"
			:client="props.client"
			:heading="view !== 'new'"
			@open="openAgent"
		>
			<NewChatRecent v-if="view === 'new'" :agents="recentAgents" @open="openAgent" />
		</PlazaView>
		<div v-else class="flex min-h-0 flex-1 flex-col">
			<div
				v-if="sendError"
				role="alert"
				class="mx-4 mt-3 flex min-w-0 shrink-0 items-start gap-2.5 rounded-[var(--kit-radius)] border border-[var(--kit-danger)]/40 bg-[var(--kit-surface)] p-3 text-[length:var(--kit-text-caption)] leading-relaxed [overflow-wrap:anywhere]"
			>
				<p class="min-w-0 flex-1 text-[var(--kit-danger)]">{{ sendError }}</p>
				<button
					type="button"
					:aria-label="t('workspace:closeError')"
					class="grid size-6 shrink-0 place-items-center rounded-[var(--kit-radius-xs)] text-[var(--kit-fg-muted)] hover:bg-[var(--kit-nav-active)] hover:text-[var(--kit-fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]"
					@click="sendError = null"
				>
					<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="size-4">
						<path d="M6 6l12 12M18 6 6 18" />
					</svg>
				</button>
			</div>
			<QuotaBanner
				v-if="quotaError"
				:client="props.client"
				:details="quotaError"
				:on-recovered="() => (quotaError = null)"
				:on-open-usage="() => navigate({ view: 'usage' })"
			/>
			<div v-if="agents.error.value" class="p-6">
				<ErrorState :message="agents.error.value" :on-retry="agents.reload" />
			</div>
			<EmptyState v-else-if="agents.loading.value" :title="t('common:loading')" loading />
			<Chat
				v-else-if="currentAgent"
				:messages="chat.messages.value"
				variant="workspace"
				anchor-rail
				:turn-running="chat.turnRunning.value"
				:sending="sending"
				:can-send="sessionId ? chat.canSend.value : true"
				:skills="senderSkills"
				:on-copy="copyMessageText"
				:scroll-key="sessionId"
				:multi-agent="chat.multiAgent.value"
				@stop="() => void chat.stop()"
			>
				<template #sender>
					<ExperienceSender
						:reset-key="sessionId ?? 'new'"
						:items="attachmentItems"
						:skills="senderSkills"
						:turn-running="chat.turnRunning.value"
						:sending="sending"
						:can-send="sessionId ? chat.canSend.value : true"
						:disabled="!currentAgent || attachmentItems.some((item) => item.status === 'uploading') || quotaError !== null"
						:processing="processingFiles"
						:on-drop="uploadFiles"
						:on-pick-file="pickAndUpload"
						:on-remove="removeAttachment"
						:on-send="send"
						:on-stop="() => void chat.stop()"
					/>
				</template>
				<template #artifact="{ part }">
					<ArtifactCard
						:artifact="part.artifact"
						:on-open="openArtifact"
						:on-download="downloadArtifact"
					/>
				</template>
				<template v-if="chat.approvals.value.length > 0" #approvals>
					<ToolApprovalGroup
						:approvals="chat.approvals.value"
						:on-decision="chat.submitApproval"
						:on-refresh="chat.refreshApprovals"
						:on-stop="() => void chat.stop()"
					/>
				</template>
				<template #empty>
					<MessageListSkeleton v-if="sessionId && sessionDetails.snapshot.value.loading" />
					<div v-else class="flex min-w-0 flex-1 items-center justify-center py-6">
						<div class="w-full min-w-0">
							<EmptyState
								:title="currentAgent.opening_remarks || t('workspace:chatWith', { name: currentAgent.display_name })"
								:hint="t('workspace:chatHint')"
							/>
							<Prompts
								class="w-full"
								wrap
								:items="
									[...new Set(currentAgent.suggested_prompts)].map((prompt) => ({
										key: prompt,
										label: prompt,
										disabled: quotaError !== null || processingFiles,
									}))
								"
								:class-names="{ list: 'justify-center' }"
								:on-item-click="({ data }) => void send(data.key)"
							/>
						</div>
					</div>
				</template>
			</Chat>
			<EmptyState v-else :title="t('common:loading')" />
		</div>
	</Layout>

	<ConfirmDialog
		v-if="pendingAction"
		:title="dialogTitle"
		:body="dialogBody"
		:busy="actionBusy"
		:confirm-label="dialogConfirmLabel"
		:on-confirm="confirmAction"
		:on-cancel="cancelAction"
	/>
</template>