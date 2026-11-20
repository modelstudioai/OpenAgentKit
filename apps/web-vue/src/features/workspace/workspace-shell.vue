<script setup lang="ts">
import type { MemberView } from "@openagentkit/sdk/protocol";
import type { KitClient } from "@openagentkit/sdk/providers/kit";
import type { ChatProvider } from "@openagentkit/sdk/providers";
import { useAgentCatalog } from "@openagentkit/sdk/agents/hooks-vue";
import { useChat } from "@openagentkit/sdk/chat/hooks-vue";
import { useSessions } from "@openagentkit/sdk/sessions/hooks-vue";
import { Chat, EmptyState, Layout, SessionSidebar, type SessionSidebarGroup } from "@openagentpack/kit-chat-ui-vue";
import { computed, ref, watch } from "vue";
import { useTranslation } from "../../i18n/index.ts";
import type { Branding } from "../../lib/branding.ts";

const props = defineProps<{
	member: MemberView | null;
	client: KitClient;
	chatProvider: ChatProvider;
	branding: Branding;
}>();

const emit = defineEmits<{ logout: [] }>();
const { t } = useTranslation(["chat", "auth"]);

const sessions = useSessions({ client: props.client });
const agents = useAgentCatalog({ client: props.client });
const sessionId = ref<string | null>(null);
const search = ref("");
const selectedAgent = ref("");
const creating = ref(false);
const createError = ref<string | null>(null);
const chat = useChat(() => ({ sessionId: sessionId.value, provider: props.chatProvider }));

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
	() => agents.agents.value,
	(list) => {
		if (!selectedAgent.value && list[0]) selectedAgent.value = list[0].slug;
	},
	{ immediate: true },
);

function select(session: { session_id: string }) {
	sessionId.value = session.session_id;
}

async function createSession() {
	const slug = selectedAgent.value || agents.agents.value[0]?.slug;
	if (!slug || creating.value) return;
	creating.value = true;
	createError.value = null;
	try {
		const created = await props.client.createSession({ agentSlug: slug });
		sessionId.value = created.session_id;
		await sessions.reload();
	} catch (error) {
		createError.value = error instanceof Error ? error.message : String(error);
	} finally {
		creating.value = false;
	}
}

async function send(text: string, skills?: string[]) {
	if (!sessionId.value) return;
	await chat.send(text, { skills });
}
</script>

<template>
	<Layout :mobile-title="branding.productName" sidebar-label="会话导航">
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
										class="rounded-[var(--kit-radius-sm)] border border-[var(--kit-border)] px-2 py-1 text-[length:var(--kit-text-caption)]"
										@click="emit('logout')"
									>
										{{ t("auth:logout") }}
									</button>
								</div>
								<div class="flex items-center gap-2">
									<select
										v-model="selectedAgent"
										aria-label="选择智能体"
										class="min-h-8 min-w-0 flex-1 rounded-[var(--kit-radius-sm)] border border-[var(--kit-border)] bg-[var(--kit-surface)] px-2 text-[length:var(--kit-text-caption)]"
									>
										<option v-for="agent in agents.agents.value" :key="agent.slug" :value="agent.slug">
											{{ agent.display_name }}
										</option>
									</select>
									<button
										type="button"
										class="shrink-0 rounded-[var(--kit-radius-sm)] bg-[var(--kit-accent)] px-2 py-1 text-[length:var(--kit-text-caption)] text-[var(--kit-accent-fg)] disabled:opacity-50"
										:disabled="creating || agents.agents.value.length === 0"
										@click="createSession"
									>
										{{ creating ? "创建中…" : "新建" }}
									</button>
								</div>
								<p v-if="createError" role="alert" class="text-[length:var(--kit-text-caption)] text-[var(--kit-danger)]">
									{{ createError }}
								</p>
							</div>
				</template>
			</SessionSidebar>
		</template>

		<header class="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--kit-border)] px-4">
			<span class="min-w-0 truncate text-[length:var(--kit-text-label)] font-medium">
				{{ member?.display_name ?? branding.productName }}
			</span>
			<span class="text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]">Vue</span>
		</header>

		<div class="flex min-h-0 flex-1 flex-col">
			<Chat
				v-if="sessionId"
				:messages="chat.messages.value"
				variant="workspace"
				:turn-running="chat.turnRunning.value"
				:can-send="chat.canSend.value"
				:scroll-key="sessionId"
				@send="send"
				@stop="() => void chat.stop()"
			/>
			<EmptyState v-else title="选择一个会话" hint="从左侧最近会话开始，或等待新建会话入口。" />
		</div>
	</Layout>
</template>
