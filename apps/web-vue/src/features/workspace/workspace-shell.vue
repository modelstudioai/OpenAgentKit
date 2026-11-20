<script setup lang="ts">
import { useAgentCatalog } from "@openagentkit/sdk/agents/hooks-vue";
import { useChat } from "@openagentkit/sdk/chat/hooks-vue";
import type { MemberView, SessionSummary } from "@openagentkit/sdk/protocol";
import type { ChatProvider } from "@openagentkit/sdk/providers";
import type { KitClient } from "@openagentkit/sdk/providers/kit";
import { useSessions } from "@openagentkit/sdk/sessions/hooks-vue";
import {
	Chat,
	EmptyState,
	ErrorState,
	Layout,
	SessionSidebar,
	type SessionSidebarGroup,
} from "@openagentpack/kit-chat-ui-vue";
import { computed, ref, watch } from "vue";
import { useTranslation } from "../../i18n/index.ts";
import type { Branding } from "../../lib/branding.ts";
import { useRoute } from "../../lib/use-route.ts";
import PlazaView from "../plaza/plaza-view.vue";

const props = defineProps<{
	member: MemberView | null;
	client: KitClient;
	chatProvider: ChatProvider;
	branding: Branding;
}>();

const emit = defineEmits<{ logout: [] }>();
const { t } = useTranslation(["workspace", "auth", "layout"]);
const { view, agentSlug, sessionId, navigate } = useRoute();

const sessions = useSessions({ client: props.client });
const agents = useAgentCatalog({ client: props.client });
const search = ref("");
const selectedAgent = ref("");
const creating = ref(false);
const sending = ref(false);
const createError = ref<string | null>(null);
const sendError = ref<string | null>(null);
const chat = useChat(() => ({ sessionId: sessionId.value, provider: props.chatProvider }));

const currentAgent = computed(() => {
	const slug = agentSlug.value ?? selectedAgent.value;
	return agents.agents.value.find((agent) => agent.slug === slug) ?? agents.agents.value[0] ?? null;
});
const mobileTitle = computed(() =>
	view.value === "plaza" ? t("layout:views.plaza") : (currentAgent.value?.display_name ?? props.branding.productName),
);

const groups = computed<SessionSidebarGroup[]>(() => {
	const slugs = new Set<string>();
	for (const session of sessions.sessions.value) slugs.add(session.agent_slug);
	for (const agent of agents.agents.value) slugs.add(agent.slug);
	return [...slugs].map((slug) => ({
		id: slug,
		name: agents.agents.value.find((agent) => agent.slug === slug)?.display_name ?? slug,
		sessions: sessions.sessions.value.filter((session) => session.agent_slug === slug),
		initialized: true,
		hasMore: false,
		loading: sessions.loading.value,
	}));
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

function goToPlaza() {
	navigate({ view: "plaza" });
}

function select(session: SessionSummary) {
	navigate({ view: "chat", agent: session.agent_slug, session: session.session_id });
}

function openAgent(slug: string) {
	selectedAgent.value = slug;
	navigate({ view: "chat", agent: slug, session: null });
}

async function createSession() {
	const slug = currentAgent.value?.slug ?? selectedAgent.value;
	if (!slug || creating.value) return;
	creating.value = true;
	createError.value = null;
	try {
		const created = await props.client.createSession({ agentSlug: slug });
		navigate({ view: "chat", agent: slug, session: created.session_id }, { replace: true });
		await sessions.reload();
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
			await sessions.reload();
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
				:recent="{ sessions: sessions.sessions.value, initialized: true, hasMore: false }"
				:active-id="sessionId"
				:search-input="search"
				:loading="sessions.loading.value"
				:error="sessions.error.value"
				:agent-name="(slug) => agents.agents.value.find((agent) => agent.slug === slug)?.display_name ?? slug"
				@select="
					(session) => {
						select(session);
						closeSidebar();
					}
				"
				@search-input="(value) => (search = value)"
			>
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

		<PlazaView v-if="view === 'plaza'" :client="props.client" @open="openAgent" />
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
</template>
