<script setup lang="ts">
import { useIsMobile } from "@openagentkit/sdk/hooks-vue";
import type { ChatMessage } from "@openagentkit/sdk/messages";
import type { SessionSummary } from "@openagentkit/sdk/protocol";
import { Chat, Layout, SessionList } from "@openagentpack/kit-chat-ui-vue";
import { ref, watch } from "vue";

defineProps<{
	agentName: string;
	sessions: SessionSummary[];
	sessionId: string | null;
	messages: ChatMessage[];
	canSend: boolean;
	turnRunning?: boolean;
	sending?: boolean;
	// 主动换会话时更新，首次发送获得会话 ID 时沿用当前值。
	draftKey?: number | string;
	onSend: (text: string, skills?: string[]) => Promise<void>;
	onStop: () => void | Promise<void>;
}>();

const emit = defineEmits<{ select: [sessionId: string] }>();
const isMobile = useIsMobile();
const asideOpen = ref(!isMobile.value);
watch(isMobile, (mobile) => {
	asideOpen.value = !mobile;
});

function selectSession(session: SessionSummary, closeSidebar: () => void) {
	emit("select", session.session_id);
	closeSidebar();
}
</script>

<template>
	<div class="h-dvh" data-kit-appearance="workspace">
		<Layout aside-label="Agent 信息" :aside-open="asideOpen" @aside-open-change="asideOpen = $event">
			<template #header="{ menuToggle }">
				<header class="flex shrink-0 items-center gap-3 border-b border-[var(--kit-border)] px-3 py-2">
					<component :is="menuToggle" v-if="menuToggle" />
					<h1 class="min-w-0 flex-1 truncate font-medium">{{ agentName }}</h1>
					<button type="button" :aria-expanded="asideOpen" @click="asideOpen = !asideOpen">Agent 信息</button>
				</header>
			</template>
			<template #sidebar="{ closeSidebar, closeButton }">
				<aside class="flex min-h-0 w-64 shrink-0 flex-col bg-[var(--kit-bg-subtle)]">
					<div class="flex items-center justify-between gap-2 p-3">
						<h2>会话</h2>
						<component :is="closeButton" v-if="closeButton" />
					</div>
					<SessionList
						variant="workspace"
						:sessions="sessions"
						:active-id="sessionId"
						@select="(session) => selectSession(session, closeSidebar)"
					/>
				</aside>
			</template>
			<Chat
				:key="draftKey"
				variant="workspace"
				:scroll-key="sessionId"
				:messages="messages"
				:can-send="canSend && !sending"
				:turn-running="turnRunning"
				:sending="sending"
				:on-send="onSend"
				:on-stop="onStop"
			/>
			<template #aside="{ closeButton }">
				<div class="min-h-0 flex-1 overflow-y-auto p-4">
					<div class="flex items-center justify-between gap-2">
						<h2 class="font-medium">Agent 信息</h2>
						<component :is="closeButton" v-if="closeButton" />
					</div>
					<p class="mt-2 wrap-anywhere">{{ agentName }}</p>
					<slot name="resources" />
				</div>
			</template>
		</Layout>
	</div>
</template>
