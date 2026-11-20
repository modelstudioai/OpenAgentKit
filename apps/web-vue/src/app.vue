<script setup lang="ts">
import type { MemberAuthController } from "@openagentkit/sdk/auth";
import { ErrorState } from "@openagentpack/kit-chat-ui-vue";
import MemberAuthGate from "./features/auth/member-auth-gate.vue";
import PlaceholderWorkspace from "./features/workspace/placeholder-workspace.vue";
import ChatUILocaleBridge from "./i18n/chat-ui-bridge.vue";
import type { Branding } from "./lib/branding.ts";

defineProps<{
	controller: MemberAuthController | null;
	branding: Branding;
	bootstrapError?: string | null;
}>();

function reload() {
	window.location.reload();
}
</script>

<template>
	<ChatUILocaleBridge>
		<main v-if="bootstrapError" class="p-6">
			<ErrorState :message="bootstrapError" :on-retry="reload" />
		</main>
		<MemberAuthGate v-else-if="controller" :controller="controller">
			<template #default="{ member, onLogout }">
				<PlaceholderWorkspace :member="member" :branding="branding" @logout="onLogout" />
			</template>
		</MemberAuthGate>
	</ChatUILocaleBridge>
</template>
