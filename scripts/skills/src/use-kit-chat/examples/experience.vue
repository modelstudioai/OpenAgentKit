<script setup lang="ts">
import { useChat, useComposer } from "@openagentkit/sdk/chat/hooks-vue";
import type { ChatProvider } from "@openagentkit/sdk/providers";
import type { KitClient } from "@openagentkit/sdk/providers/kit";
import { useSessions } from "@openagentkit/sdk/sessions/hooks-vue";
import { Chat, ToolApprovalGroup } from "@openagentpack/kit-chat-ui-vue";
import { computed, ref, watch } from "vue";

const props = defineProps<{
	client: KitClient;
	provider: ChatProvider;
	agentSlug: string;
}>();

const sessionId = ref<string | null>(null);
const draftKey = ref(0);
const stopError = ref<string | null>(null);
const {
	sessions,
	loading: sessionsLoading,
	error: sessionsError,
	reload: reloadSessions,
} = useSessions(() => ({ client: props.client, agentSlug: props.agentSlug, limit: 10 }));
const chat = useChat(() => ({ sessionId: sessionId.value, provider: props.provider }));
const { messages, multiAgent, turnRunning, approvals } = chat;
const { snapshot: delivery, send } = useComposer(() => ({
	client: props.client,
	agentSlug: props.agentSlug,
	sessionId: sessionId.value,
	files: [],
	send: chat.send,
	onSessionCreated: (id) => {
		// 首条消息可能失败，保留同一个输入框直到发送成功。
		sessionId.value = id;
		if (props.client.supports("sessions")) void reloadSessions();
	},
}));

const canSend = computed(
	() => !delivery.value.pending && (sessionId.value ? chat.canSend.value : props.client.supports("createSession")),
);
const errorMessage = computed(() => {
	const failure = delivery.value.error;
	if (failure) return failure instanceof Error ? failure.message : "消息发送失败";
	return stopError.value ?? chat.streamError.value?.message;
});

function selectSession(id: string | null) {
	sessionId.value = id;
	draftKey.value += 1;
	stopError.value = null;
}

function handleSelection(event: Event) {
	selectSession((event.currentTarget as HTMLSelectElement).value || null);
}

watch(() => props.agentSlug, () => selectSession(null));

async function sendMessage(text: string, skills?: string[]) {
	stopError.value = null;
	// 将失败交给 Chat 处理，保留当前草稿。
	await send(text, skills);
}

async function stopTurn() {
	stopError.value = null;
	try {
		await chat.stop();
	} catch (error) {
		stopError.value = error instanceof Error ? error.message : "停止生成失败";
	}
}
</script>

<template>
	<div class="flex h-dvh min-h-0 flex-col" data-kit-appearance="workspace">
		<label class="flex items-center gap-2 p-3">
			会话
			<select class="min-w-0" :value="sessionId ?? ''" @change="handleSelection">
				<option value="">新会话</option>
				<option v-for="session in sessions" :key="session.session_id" :value="session.session_id">
					{{ session.title || session.agent_slug }}
				</option>
			</select>
		</label>
		<div v-if="sessionsError" class="flex items-center gap-2 px-3">
			<p role="alert" class="text-[var(--kit-danger)]">会话列表加载失败。</p>
			<button type="button" class="underline" @click="reloadSessions">重试加载会话</button>
		</div>
		<p v-else-if="sessionsLoading" role="status" class="px-3">正在加载会话</p>
		<p v-if="errorMessage" role="alert" class="px-3 text-[var(--kit-danger)]">{{ errorMessage }}</p>
		<Chat
			:key="draftKey"
			variant="workspace"
			:scroll-key="sessionId"
			:messages="messages"
			:multi-agent="multiAgent"
			:turn-running="turnRunning"
			:sending="delivery.pending"
			:can-send="canSend"
			:on-send="sendMessage"
			:on-stop="stopTurn"
		>
			<template v-if="approvals.length" #approvals>
				<ToolApprovalGroup
					:approvals="approvals"
					:on-decision="chat.submitApproval"
					:on-refresh="chat.refreshApprovals"
					:on-stop="stopTurn"
				/>
			</template>
		</Chat>
	</div>
</template>
