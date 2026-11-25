<script setup lang="ts">
import type { MemberView } from "@openagentkit/sdk/protocol";
import { ref } from "vue";
import { useTranslation } from "../../i18n/index.ts";

const props = defineProps<{
	member: MemberView | null;
	onLogout: () => void | Promise<void>;
}>();
const { t } = useTranslation("auth");
const open = ref(false);

function logout() {
	open.value = false;
	void Promise.resolve(props.onLogout()).catch(() => undefined);
}
</script>

<template>
	<div class="group relative flex min-h-10 min-w-0 items-center justify-end">
		<button
			type="button"
			:aria-label="member ? t('accountAria', { name: member.display_name }) : t('accountInfo')"
			:aria-expanded="open"
			class="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full border border-[var(--kit-border)] bg-[var(--kit-surface)] text-[var(--kit-fg-muted)] transition-colors hover:bg-[var(--kit-nav-active)] hover:text-[var(--kit-fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]"
			@click="open = !open"
		>
			<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="h-5 w-5">
				<circle cx="12" cy="8" r="3.5" />
				<path d="M5 20v-1a7 7 0 0 1 14 0v1" stroke-linecap="round" />
			</svg>
		</button>
		<span
			v-if="member"
			:title="member.username"
			class="ml-2 min-w-0 max-w-40 truncate whitespace-nowrap text-[length:var(--kit-text-label)] font-medium"
		>
			{{ member.display_name }}
		</span>
		<!-- 侧栏页脚左侧：浮层从头像向右、向上展开；8px 透明桥接区保证鼠标滑入时 hover 不中断。 -->
		<div
			class="absolute left-0 bottom-full z-20 pb-2 transition-[opacity,transform,visibility] duration-[var(--kit-duration-fast)] ease-[var(--kit-ease-out)]"
			:class="
				open
					? 'visible translate-y-0 opacity-100'
					: 'pointer-events-none invisible translate-y-1 opacity-0 group-hover:pointer-events-auto group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100'
			"
		>
			<div
				class="flex min-w-40 flex-col items-stretch gap-2 rounded-[var(--kit-radius)] border border-[var(--kit-border)] bg-[var(--kit-surface)] p-3 shadow-[var(--kit-shadow)]"
			>
				<span
					:title="member?.username"
					class="min-w-0 truncate whitespace-nowrap text-[length:var(--kit-text-label)] font-medium"
				>
					{{ member?.display_name ?? t("defaultUser") }}
				</span>
				<div v-if="$slots.language" class="border-t border-[var(--kit-border-subtle)] pt-2">
					<slot name="language" />
				</div>
				<button
					v-if="member"
					type="button"
					class="flex items-center gap-2 rounded-[var(--kit-radius-sm)] px-2 py-1.5 text-[length:var(--kit-text-label)] text-[var(--kit-fg-muted)] transition-colors hover:bg-[var(--kit-bg-subtle)] hover:text-[var(--kit-fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]"
					@click="logout"
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="h-4 w-4"
					>
						<path d="M10 4H5v16h5M9 12h11m-4-4 4 4-4 4" />
					</svg>
					{{ t("logout") }}
				</button>
			</div>
		</div>
	</div>
</template>
