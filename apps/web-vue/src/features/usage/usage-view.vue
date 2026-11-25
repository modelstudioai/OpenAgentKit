<script setup lang="ts">
import type { KitClient } from "@openagentkit/sdk/providers/kit";
import { useUsageLimits } from "@openagentkit/sdk/usage/hooks-vue";
import { EmptyState, ErrorState } from "@openagentpack/kit-chat-ui-vue";
import { useTranslation } from "../../i18n/index.ts";
import CreditsUsageView from "./credits-usage-view.vue";
import MemberUsageView from "./member-usage-view.vue";

const props = defineProps<{ client: KitClient }>();
const emit = defineEmits<{ openAgent: [slug: string] }>();
const { t } = useTranslation("usage");

const limits = useUsageLimits({ client: props.client });
</script>

<template>
	<MemberUsageView
		v-if="limits.data.value"
		:client="props.client"
		:view="limits.data.value"
		:loading="limits.loading.value"
		:error="limits.error.value"
		@reload="() => void limits.reload()"
	/>

	<div v-else-if="limits.error.value || limits.data.value === undefined" class="h-full min-w-0 overflow-y-auto">
		<div class="mx-auto w-full min-w-0 max-w-6xl px-4 py-6 [overflow-wrap:anywhere] md:px-8 md:py-8">
			<ErrorState
				v-if="limits.error.value"
				:message="limits.error.value"
				:on-retry="() => void limits.reload()"
			/>
			<div v-else class="rounded-[var(--kit-radius)] border border-[var(--kit-border-subtle)] bg-[var(--kit-surface)] py-6">
				<EmptyState :title="t('loadingUsage')" loading />
			</div>
		</div>
	</div>

	<CreditsUsageView v-else :client="props.client" @open-agent="(slug) => emit('openAgent', slug)" />
</template>
