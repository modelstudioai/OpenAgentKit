<script setup lang="ts">
import { useAgentCatalog } from "@openagentkit/sdk/agents/hooks-vue";
import { useChat } from "@openagentkit/sdk/chat/hooks-vue";
import type { MemberView, SessionSummary } from "@openagentkit/sdk/protocol";
import type { ChatProvider } from "@openagentkit/sdk/providers";
import type { KitClient } from "@openagentkit/sdk/providers/kit";
import type { SessionAction } from "@openagentkit/sdk/sessions";
import { useSessionDirectory } from "@openagentkit/sdk/sessions/hooks-vue";
import {
	Chat,
	ConfirmDialog,
	EmptyState,
	ErrorState,
	Layout,
	Menu,
	MenuContent,
	MenuItem,
	MenuTrigger,
	SessionSidebar,
	type SessionSidebarGroup,
	type SessionSidebarPage,
	type SessionSidebarSection,
} from "@openagentpack/kit-chat-ui-vue";
import { computed, ref, watch } from "vue";
import { useTranslation } from "../../i18n/index.ts";
import type { Branding } from "../../lib/branding.ts";
import { useRoute } from "../../lib/use-route.ts";
import PlazaView from "../plaza/plaza-view.vue";
import UsageView from "../usage/usage-view.vue";

const props = defineProps<{
	member: MemberView | null;
	client: KitClient;
	chatProvider: ChatProvider;
	branding: Branding;
}>();

const emit = defineEmits<{ logout: [] }>();
const { t } = useTranslation(["workspace", "auth", "layout", "chat"]);
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
const creating = ref(false);
const sending = ref(false);
const createError = ref<string | null>(null);
const sendError = ref<string | null>(null);
const chat = useChat(() => ({ sessionId: sessionId.value, provider: props.chatProvider }));

const currentAgent = computed(() => {
	const slug = agentSlug.value ?? selectedAgent.value;
	return agents.agents.value.find((agent) => agent.slug === slug) ?? agents.agents.value[0] ?? null;
});
const mobileTitle = computed(() => {
	if (view.value === "plaza") return t("layout:views.plaza");
	if (view.value === "usage") return t("layout:views.usage");
	return currentAgent.value?.display_name ?? props.branding.productName;
});

const agentName = (slug: string) => agents.agents.value.find((agent) => agent.slug === slug)?.display_name ?? slug;
const groups = computed<SessionSidebarGroup[]>(() => {
	return directory.snapshot.value.groups.map((group) => ({
		id: group.slug,
		name: agentName(group.slug),
		sessions: group.sessions,
		initialized: group.initialized,
		loading: group.loading,
		loadingMore: group.loadingMore,
		hasMore: group.hasMore,
	}));
});
const recent = computed<SessionSidebarPage>(() => ({
	sessions: directory.snapshot.value.recent.sessions,
	initialized: directory.snapshot.value.recent.initialized,
	loading: directory.snapshot.value.recent.loading,
	loadingMore: directory.snapshot.value.recent.loadingMore,
	hasMore: directory.snapshot.value.recent.hasMore,
	error: directory.snapshot.value.recent.error,
}));
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

// 目录只加载智能体与最近页；分组在首次出现后按需拉取，避免初始化时并发请求全部历史。
watch(
	() => directory.snapshot.value.groups.map((group) => `${group.slug}:${group.initialized}`),
	() => {
		for (const group of directory.snapshot.value.groups) {
			if (!group.initialized && !group.loading) group.load();
		}
	},
	{ immediate: true },
);

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

function confirmAction() {
	if (!actionBusy.value) void directory.confirmAction();
}

async function createSession() {
	const slug = currentAgent.value?.slug ?? selectedAgent.value;
	if (!slug || creating.value) return;
	creating.value = true;
	createError.value = null;
	try {
		const created = await props.client.createSession({ agentSlug: slug });
		navigate({ view: "chat", agent: slug, session: created.session_id }, { replace: true });
		await directory.reload();
	} catch (error) {
		createError.value = error instanceof Error ? error.message : String(error);
	} finally {
		creating.value = false;
	}
}

async function send(text: string, skills?: string[]) {
	if (sending.value) return;
	sending.value = true;
	sendError.value = null;
	try {
		let activeSessionId = sessionId.value;
		if (!activeSessionId) {
			const slug = currentAgent.value?.slug;
			if (!slug) return;
			const created = await props.client.createSession({ agentSlug: slug });
			activeSessionId = created.session_id;
			navigate({ view: "chat", agent: slug, session: activeSessionId }, { replace: true });
			await directory.reload();
		}
		// 先建会话再发送：useChat.send 显式接收 sessionId，不依赖路由更新后的 watcher 时序。
		await chat.send(text, { sessionId: activeSessionId, skills });
	} catch (error) {
		sendError.value = error instanceof Error ? error.message : String(error);
	} finally {
		sending.value = false;
	}
}
</script>

<template>
	<Layout :mobile-title="mobileTitle" :sidebar-label="t('workspace:sidebarLabel')">
		<template #sidebar="{ closeSidebar }">
			<SessionSidebar
				:groups="groups"
				:recent="recent"
				:active-id="sessionId"
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
					<div class="flex flex-col gap-2 px-3 py-2">
						<div class="flex min-h-10 items-center justify-between gap-2">
							<span class="min-w-0 truncate text-[length:var(--kit-text-label)] font-semibold">
								{{ branding.productName }}
							</span>
							<button
								type="button"
								class="rounded-[var(--kit-radius-sm)] border border-[var(--kit-border)] px-2 py-1 text-[length:var(--kit-text-caption)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]"
								@click="emit('logout')"
							>
								{{ t("auth:logout") }}
							</button>
						</div>
						<button
							type="button"
							data-testid="sidebar-usage"
							:aria-label="t('layout:views.usage')"
							:title="t('layout:views.usage')"
							:aria-pressed="view === 'usage'"
							class="flex min-h-9 w-full items-center gap-2 rounded-[var(--kit-radius-sm)] px-2.5 py-1.5 text-left text-[length:var(--kit-text-label)] transition-colors hover:bg-[var(--kit-nav-active)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]"
							:class="view === 'usage' ? 'bg-[var(--kit-nav-active)] font-medium' : 'text-[var(--kit-fg-muted)]'"
							@click="
								() => {
									goToUsage();
									closeSidebar();
								}
							"
						>
							{{ t("layout:views.usage") }}
						</button>
						<button
							type="button"
							data-testid="sidebar-nav-plaza"
							:aria-current="view === 'plaza' ? 'page' : undefined"
							class="flex min-h-9 w-full items-center gap-2 rounded-[var(--kit-radius-sm)] px-2.5 py-1.5 text-left text-[length:var(--kit-text-label)] transition-colors hover:bg-[var(--kit-nav-active)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]"
							:class="view === 'plaza' ? 'bg-[var(--kit-nav-active)] font-medium' : 'text-[var(--kit-fg-muted)]'"
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
							>
								<rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
								<rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
								<rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
								<rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
							</svg>
							{{ t("layout:plaza") }}
						</button>
						<div class="flex items-center gap-2">
							<select
								v-model="selectedAgent"
								:aria-label="t('workspace:selectAgent')"
								class="min-h-8 min-w-0 flex-1 rounded-[var(--kit-radius-sm)] border border-[var(--kit-border)] bg-[var(--kit-surface)] px-2 text-[length:var(--kit-text-caption)]"
							>
								<option v-for="agent in agents.agents.value" :key="agent.slug" :value="agent.slug">
									{{ agent.display_name }}
								</option>
							</select>
							<button
								type="button"
								data-testid="sidebar-new-chat"
								class="shrink-0 rounded-[var(--kit-radius-sm)] bg-[var(--kit-accent)] px-2 py-1 text-[length:var(--kit-text-caption)] text-[var(--kit-accent-fg)] disabled:opacity-50"
								:disabled="creating || agents.agents.value.length === 0"
								@click="createSession"
							>
								{{ creating ? t("workspace:creating") : t("layout:newChat") }}
							</button>
						</div>
						<p
							v-if="createError"
							role="alert"
							class="text-[length:var(--kit-text-caption)] text-[var(--kit-danger)]"
						>
							{{ createError }}
						</p>
					</div>
				</template>
			</SessionSidebar>
		</template>

		<template v-if="view === 'chat'" #header>
			<header class="flex min-h-11 shrink-0 items-center gap-2 border-b border-[var(--kit-border-subtle)] px-3 md:px-4">
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
				<span class="min-w-0 flex-1 truncate text-[length:var(--kit-text-base)] font-semibold">
					{{ currentAgent?.display_name ?? member?.display_name ?? branding.productName }}
				</span>
				<span class="text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]">Vue</span>
			</header>
		</template>

		<UsageView v-if="view === 'usage'" :client="props.client" @open-agent="openAgent" />
		<PlazaView v-else-if="view === 'plaza'" :client="props.client" @open="openAgent" />
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
			<div v-if="agents.error.value" class="p-6">
				<ErrorState :message="agents.error.value" :on-retry="agents.reload" />
			</div>
			<EmptyState v-else-if="agents.loading.value" :title="t('common:loading')" loading />
			<Chat
				v-else-if="currentAgent"
				:messages="chat.messages.value"
				variant="workspace"
				:turn-running="chat.turnRunning.value"
				:sending="sending"
				:can-send="sessionId ? chat.canSend.value : true"
				:scroll-key="sessionId"
				@send="send"
				@stop="() => void chat.stop()"
			>
				<template #empty>
					<div class="flex min-w-0 flex-1 items-center justify-center py-6">
						<EmptyState
							:title="currentAgent.opening_remarks || t('workspace:chatWith', { name: currentAgent.display_name })"
							:hint="t('workspace:chatHint')"
						/>
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
		:on-cancel="directory.cancelAction"
	/>
</template>
