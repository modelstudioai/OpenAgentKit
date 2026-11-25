<script setup lang="ts">
defineProps<{
	title: string;
	hint?: string;
	/** 在同一状态布局内展示加载进度，并向辅助技术播报状态。 */
	loading?: boolean;
}>();
</script>

<template>
	<div
		:role="loading ? 'status' : undefined"
		:aria-busy="loading || undefined"
		class="grid min-w-0 flex-1 place-items-center px-4 py-8 text-center text-[var(--kit-fg-muted)]"
	>
		<div class="mx-auto flex w-full min-w-0 max-w-lg flex-col items-center gap-3 [overflow-wrap:anywhere]">
			<span
				v-if="loading"
				aria-hidden="true"
				class="grid h-10 w-10 place-items-center rounded-full bg-[var(--kit-bg-subtle)]"
			>
				<span class="h-2 w-2 rounded-full bg-[var(--kit-fg-muted)] motion-safe:animate-pulse" />
			</span>
			<div class="text-[length:var(--kit-text-title)] font-medium leading-snug text-[var(--kit-fg)]">{{ title }}</div>
			<div v-if="hint" class="max-w-md text-[length:var(--kit-text-label)] leading-6">{{ hint }}</div>
		</div>
	</div>
</template>
