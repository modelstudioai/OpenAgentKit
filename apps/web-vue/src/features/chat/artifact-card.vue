<script setup lang="ts">
import type { ArtifactDescriptor } from "@openagentkit/sdk/protocol";

defineProps<{
	artifact: ArtifactDescriptor;
	onOpen: (fileId: string, contentType?: string) => void;
	onDownload: (fileId: string) => void;
}>();
</script>

<template>
	<div class="my-1.5 flex w-64 max-w-full items-center gap-2 rounded-[var(--kit-radius-sm)] border border-[var(--kit-border)] bg-[var(--kit-bg-subtle)] p-2">
		<span
			aria-hidden="true"
			class="grid h-9 w-9 shrink-0 place-items-center rounded bg-[var(--kit-surface)] text-[9px] font-semibold text-[var(--kit-fg-muted)]"
		>
			FILE
		</span>
		<button
			type="button"
			:aria-label="`打开 ${artifact.filename ?? artifact.file_id}`"
			:title="artifact.filename ?? artifact.file_id"
			class="min-w-0 flex-1 truncate text-left text-[length:var(--kit-text-label)] hover:underline"
			@click="onOpen(artifact.file_id, artifact.content_type)"
		>
			{{ artifact.filename ?? artifact.file_id }}
		</button>
		<button
			type="button"
			:aria-label="`下载 ${artifact.filename ?? artifact.file_id}`"
			:title="`下载 ${artifact.filename ?? artifact.file_id}`"
			class="grid size-7 shrink-0 place-items-center rounded-[var(--kit-radius-sm)] text-[var(--kit-fg-muted)] hover:bg-[var(--kit-surface)] hover:text-[var(--kit-fg)]"
			@click="onDownload(artifact.file_id)"
		>
			<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="size-4">
				<path d="M12 4v11m-4-4 4 4 4-4M5 20h14" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
		</button>
	</div>
</template>
