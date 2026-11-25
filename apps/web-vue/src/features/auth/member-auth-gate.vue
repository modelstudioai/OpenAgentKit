<script setup lang="ts">
import type { MemberAuthController } from "@openagentkit/sdk/auth";
import { useMemberAuth } from "@openagentkit/sdk/auth/hooks-vue";
import { EmptyState, ErrorState } from "@openagentpack/kit-chat-ui-vue";
import { computed } from "vue";
import { useLocale, useTranslation } from "../../i18n/index.ts";
import { resolveServerErrorMessage } from "../../i18n/server-error.ts";
import MemberLoginForm from "./member-login-form.vue";

const props = defineProps<{ controller: MemberAuthController }>();
const { t } = useTranslation("auth");
const { snapshot, login, logout, retry } = useMemberAuth(() => props.controller);
const locale = useLocale();
const loginError = computed(() => {
	// 翻译读取 i18next 当前语言，订阅切换以更新已显示的错误。
	void locale.value;
	return resolveServerErrorMessage(snapshot.value.errorDetail) ?? snapshot.value.error;
});
</script>

<template>
	<main v-if="snapshot.status === 'checking'" class="flex min-h-full min-w-0 items-center justify-center">
		<EmptyState :title="t('restoring')" loading />
	</main>
	<template v-else-if="snapshot.client && (snapshot.status === 'signed-in' || snapshot.status === 'anonymous')">
		<ErrorState v-if="!snapshot.chatProvider" :message="t('missingProvider')" />
		<!-- 身份 generation 变化时整棵业务视图重挂载：旧会话、草稿、附件不进入新身份。 -->
		<div v-else :key="snapshot.generation" class="h-full min-h-0">
			<slot
				:member="snapshot.member"
				:on-logout="logout"
				:client="snapshot.client"
				:chatProvider="snapshot.chatProvider"
			/>
		</div>
	</template>
	<MemberLoginForm
		v-else
		:pending="snapshot.pending"
		:error="loginError"
		:on-login="controller.passwordLogin ? login : undefined"
		:on-oidc-login="controller.mode === 'oidc' ? controller.loginWithOidc : undefined"
		:on-retry="retry"
	/>
</template>
