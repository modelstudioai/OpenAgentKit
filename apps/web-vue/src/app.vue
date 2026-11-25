<script setup lang="ts">
import type { MemberAuthController } from "@openagentkit/sdk/auth";
import { ErrorState } from "@openagentpack/kit-chat-ui-vue";
import { watch } from "vue";
import MemberAuthGate from "./features/auth/member-auth-gate.vue";
import WorkspaceShell from "./features/workspace/workspace-shell.vue";
import ChatUILocaleBridge from "./i18n/chat-ui-bridge.vue";
import type { Branding } from "./lib/branding.ts";

const props = defineProps<{
	controller: MemberAuthController | null;
	branding: Branding;
	bootstrapError?: string | null;
}>();

watch(
	() => props.branding.productName,
	(productName) => {
		document.title = productName.trim() || "OpenAgentKit";
	},
	{ immediate: true },
);

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
			<template #default="{ member, onLogout, client, chatProvider }">
				<WorkspaceShell
					v-if="client && chatProvider"
					:member="member"
					:client="client"
					:chat-provider="chatProvider"
					:branding="branding"
					@logout="onLogout"
				/>
			</template>
		</MemberAuthGate>
	</ChatUILocaleBridge>
</template>
