<script setup lang="ts">
import type { AgentSummary } from "@openagentkit/sdk/protocol";
import { isIconImageSource } from "@openagentpack/kit-chat-ui-vue";
import { useTranslation } from "../../i18n/index.ts";

defineProps<{ agents: AgentSummary[] }>();
const emit = defineEmits<{ open: [slug: string] }>();
const { t } = useTranslation("chat");
</script>

<template>
	<section v-if="agents.length" class="mt-8 min-w-0" :aria-label="t('recent')">
		<h2 class="mb-4 text-[length:var(--kit-text-heading)] font-semibold">{{ t("recent") }}</h2>
		<div class="flex min-w-0 flex-wrap gap-3">
			<button
				v-for="agent in agents"
				:key="agent.slug"
				type="button"
				:data-testid="`new-recent-${agent.slug}`"
				class="flex min-w-0 cursor-pointer items-center gap-2.5 rounded-[var(--kit-radius)] border border-[var(--kit-border)] bg-[var(--kit-surface)] py-2 pr-4 pl-2 text-left transition-colors duration-[var(--kit-duration-fast)] ease-[var(--kit-ease-out)] motion-reduce:transition-none hover:bg-[var(--kit-bg-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]"
				@click="emit('open', agent.slug)"
			>
				<span
					aria-hidden="true"
					class="grid size-9 shrink-0 place-items-center rounded-[var(--kit-radius-sm)] bg-[var(--kit-bg-subtle)] text-[length:var(--kit-text-base)]"
				>
					<img v-if="isIconImageSource(agent.icon)" :src="agent.icon" alt="" class="h-3/5 w-3/5 object-contain" />
					<template v-else>{{ agent.icon ?? "🤖" }}</template>
				</span>
				<span class="min-w-0">
					<span class="block truncate text-[length:var(--kit-text-label)] font-medium">{{ agent.display_name }}</span>
				</span>
			</button>
		</div>
	</section>
</template>
