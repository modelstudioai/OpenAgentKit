<script setup lang="ts">
import type { ChatMultiAgent } from "@openagentkit/sdk/chat";
import type {
	AgentMemoryStore,
	AgentSummary,
	ArtifactDescriptor,
	RemoteAgentResources,
} from "@openagentkit/sdk/protocol";
import { SubAgentPanel, Tooltip } from "@openagentpack/kit-chat-ui-vue";
import { computed } from "vue";
import { useTranslation } from "../../i18n/index.ts";

const props = defineProps<{
	agent: AgentSummary;
	resources: RemoteAgentResources | null;
	memories: AgentMemoryStore[] | null;
	artifacts: ArtifactDescriptor[];
	multiAgent?: ChatMultiAgent;
	onClose: () => void;
	onArtifactOpen: (fileId: string, contentType?: string) => void;
	onArtifactDownload: (fileId: string) => void;
}>();
const { t } = useTranslation("chat");

const resourceRows = computed(() => [
	...(props.resources?.skills ?? []).map((item) => ({ ...item, kind: "skill" as const })),
	...(props.resources?.mcp_servers ?? []).map((item) => ({ ...item, kind: "mcp" as const })),
]);
const toolRows = computed(() => props.resources?.tools ?? []);

function artifactBadge(name: string | undefined, type: string | undefined): string {
	const extension = name?.includes(".") ? (name.split(".").pop()?.toUpperCase() ?? "") : "";
	if (type?.startsWith("image/") || ["PNG", "JPG", "JPEG", "GIF", "WEBP", "SVG"].includes(extension)) return "IMG";
	if (type?.startsWith("audio/")) return "AUD";
	if (type?.startsWith("video/")) return "VID";
	if (type === "application/pdf" || extension === "PDF") return "PDF";
	if (["ZIP", "GZ", "TAR", "RAR", "7Z"].includes(extension)) return "ZIP";
	if (["XLS", "XLSX", "CSV"].includes(extension)) return "XLS";
	return extension.slice(0, 4) || "FILE";
}
</script>

<template>
	<div class="flex min-h-0 flex-1 flex-col">
		<div class="flex min-h-14 shrink-0 items-center gap-2 border-b border-[var(--kit-border-subtle)] px-4 md:hidden">
			<span class="min-w-0 flex-1 truncate text-[length:var(--kit-text-label)] font-medium">
				{{ t("header.asideTrigger") }}
			</span>
			<button
				type="button"
				:aria-label="t('header.asideCollapse')"
				class="grid size-8 place-items-center rounded-[var(--kit-radius-sm)] text-[var(--kit-fg-muted)] hover:bg-[var(--kit-bg-subtle)] hover:text-[var(--kit-fg)]"
				@click="onClose"
			>
				<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="size-4">
					<path d="m6 6 12 12M6 18 18 6" />
				</svg>
			</button>
		</div>
		<div class="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:py-5">
			<details open class="kit-collapse group/agent min-w-0">
				<summary class="-mx-2 flex min-w-0 cursor-pointer list-none select-none items-center gap-2 rounded-[var(--kit-radius-sm)] px-2 py-1 [&::-webkit-details-marker]:hidden">
					<span class="text-[length:var(--kit-text-label)] font-medium text-[var(--kit-fg-muted)]">{{ t("aside.agentInfo") }}</span>
					<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="ml-auto size-3.5 transition-transform group-open/agent:rotate-90">
						<path d="m9 6 6 6-6 6" />
					</svg>
				</summary>
				<div class="mt-1.5 min-w-0">
					<div class="text-[length:var(--kit-text-label)] font-medium">{{ agent.display_name }}</div>
					<p v-if="agent.description" class="mt-1 text-[length:var(--kit-text-label)] leading-6 text-[var(--kit-fg-muted)] [overflow-wrap:anywhere]">
						{{ agent.description }}
					</p>
				</div>
			</details>

			<SubAgentPanel :multi-agent="multiAgent" />

			<details v-if="resourceRows.length > 0" open class="kit-collapse group/res mt-6 min-w-0">
				<summary class="-mx-2 flex min-w-0 cursor-pointer list-none select-none items-center gap-2 rounded-[var(--kit-radius-sm)] px-2 py-1 [&::-webkit-details-marker]:hidden">
					<span class="text-[length:var(--kit-text-label)] font-medium text-[var(--kit-fg-muted)]">{{ t("aside.resources.skillsMcp") }}</span>
					<span class="text-[length:var(--kit-text-meta)] text-[var(--kit-fg-muted)]">· {{ resourceRows.length }}</span>
					<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="ml-auto size-3.5 transition-transform group-open/res:rotate-90">
						<path d="m9 6 6 6-6 6" />
					</svg>
				</summary>
				<ul class="mt-1.5 flex flex-col">
					<li v-for="item in resourceRows" :key="`${item.kind}:${item.name}`" class="rounded-[var(--kit-radius-sm)] px-1.5 py-1.5">
						<div class="flex items-center gap-1.5">
							<svg
								v-if="item.kind === 'skill'"
								aria-hidden="true"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								class="size-3.5 shrink-0 text-[var(--kit-fg-muted)]"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
								<path stroke-linecap="round" stroke-linejoin="round" d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
							</svg>
							<svg
								v-else
								aria-hidden="true"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								class="size-3.5 shrink-0 text-[var(--kit-fg-muted)]"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M9 7V2.5M15 7V2.5M7 7h10v5.5a5 5 0 0 1-5 5 5 5 0 0 1-5-5zM12 17.5v4"
								/>
							</svg>
							<div class="truncate text-[length:var(--kit-text-label)] font-medium">{{ item.name }}</div>
							<span v-if="item.permission" class="ml-auto shrink-0 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]">
								{{ item.permission === "allow" ? t("aside.permissions.allow") : t("aside.permissions.ask") }}
							</span>
						</div>
					</li>
				</ul>
			</details>

			<details v-if="toolRows.length > 0" open class="kit-collapse group/tools mt-6 min-w-0">
				<summary class="-mx-2 flex min-w-0 cursor-pointer list-none select-none items-center gap-2 rounded-[var(--kit-radius-sm)] px-2 py-1 [&::-webkit-details-marker]:hidden">
					<span class="text-[length:var(--kit-text-label)] font-medium text-[var(--kit-fg-muted)]">{{ t("aside.resources.tools") }}</span>
					<span class="text-[length:var(--kit-text-meta)] text-[var(--kit-fg-muted)]">· {{ toolRows.length }}</span>
					<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="ml-auto size-3.5 transition-transform group-open/tools:rotate-90">
						<path d="m9 6 6 6-6 6" />
					</svg>
				</summary>
				<ul class="mt-1.5 flex flex-col">
					<li v-for="item in toolRows" :key="item.name" class="rounded-[var(--kit-radius-sm)] px-1.5 py-1.5">
						<div class="flex items-center gap-1.5">
							<svg
								aria-hidden="true"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								class="size-3.5 shrink-0 text-[var(--kit-fg-muted)]"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z"
								/>
							</svg>
							<div class="truncate text-[length:var(--kit-text-label)] font-medium">{{ item.name }}</div>
							<span v-if="item.permission" class="ml-auto shrink-0 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]">
								{{ item.permission === "allow" ? t("aside.permissions.allow") : t("aside.permissions.ask") }}
							</span>
						</div>
					</li>
				</ul>
			</details>

			<details v-if="memories?.length" open class="kit-collapse group/memory mt-6 min-w-0">
				<summary class="-mx-2 flex min-w-0 cursor-pointer list-none select-none items-center gap-2 rounded-[var(--kit-radius-sm)] px-2 py-1 [&::-webkit-details-marker]:hidden">
					<span class="text-[length:var(--kit-text-label)] font-medium text-[var(--kit-fg-muted)]">{{ t("aside.resources.memory") }}</span>
					<span class="text-[length:var(--kit-text-meta)] text-[var(--kit-fg-muted)]">· {{ memories.length }}</span>
					<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="ml-auto size-3.5 transition-transform group-open/memory:rotate-90">
						<path d="m9 6 6 6-6 6" />
					</svg>
				</summary>
				<ul class="mt-1.5 flex flex-col gap-3">
					<li v-for="store in memories" :key="store.name" class="min-w-0 px-1.5">
						<div class="text-[length:var(--kit-text-label)] font-medium">{{ store.name }}</div>
						<Tooltip v-if="store.description" class="mt-0.5 block truncate text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]" :content="store.description" overflow-only>
							{{ store.description }}
						</Tooltip>
					</li>
				</ul>
			</details>

			<details open class="kit-collapse group/artifacts mt-6 min-w-0">
				<summary class="-mx-2 flex min-w-0 cursor-pointer list-none select-none items-center gap-2 rounded-[var(--kit-radius-sm)] px-2 py-1 [&::-webkit-details-marker]:hidden">
					<span class="text-[length:var(--kit-text-label)] font-medium text-[var(--kit-fg-muted)]">{{ t("aside.artifacts") }}</span>
					<span v-if="artifacts.length" class="text-[length:var(--kit-text-meta)] text-[var(--kit-fg-muted)]">· {{ artifacts.length }}</span>
					<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="ml-auto size-3.5 transition-transform group-open/artifacts:rotate-90">
						<path d="m9 6 6 6-6 6" />
					</svg>
				</summary>
				<ul v-if="artifacts.length" class="mt-1.5 flex flex-col">
					<li v-for="artifact in artifacts" :key="artifact.file_id" class="flex items-center gap-1 rounded-[var(--kit-radius-sm)] hover:bg-[var(--kit-bg-subtle)]">
						<button
							type="button"
							class="flex min-w-0 flex-1 items-center gap-2 px-1.5 py-2 text-left"
							:aria-label="t('aside.openFile', { name: artifact.filename ?? artifact.file_id })"
							@click="onArtifactOpen(artifact.file_id, artifact.content_type)"
						>
							<span class="grid size-7 shrink-0 place-items-center rounded bg-[var(--kit-surface)] text-[8px] font-semibold text-[var(--kit-fg-muted)]">
								{{ artifactBadge(artifact.filename, artifact.content_type) }}
							</span>
							<span class="min-w-0 truncate text-[length:var(--kit-text-label)]">{{ artifact.filename ?? artifact.file_id }}</span>
						</button>
						<button
							type="button"
							:aria-label="t('aside.downloadFile', { name: artifact.filename ?? artifact.file_id })"
							:title="t('aside.download')"
							class="grid size-7 shrink-0 place-items-center rounded-[var(--kit-radius-sm)] text-[var(--kit-fg-muted)] hover:bg-[var(--kit-bg-subtle)] hover:text-[var(--kit-fg)]"
							@click="onArtifactDownload(artifact.file_id)"
						>
							<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="size-4">
								<path d="M12 4v11m-4-4 4 4 4-4M5 20h14" stroke-linecap="round" stroke-linejoin="round" />
							</svg>
						</button>
					</li>
				</ul>
				<div v-else class="mt-2 rounded-[var(--kit-radius-sm)] border border-dashed border-[var(--kit-border)] px-3 py-3 text-[length:var(--kit-text-caption)] leading-relaxed text-[var(--kit-fg-muted)]">
					{{ t("aside.artifactsEmpty") }}
				</div>
			</details>
		</div>
	</div>
</template>
