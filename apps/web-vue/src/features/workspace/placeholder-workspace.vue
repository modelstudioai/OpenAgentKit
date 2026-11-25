<script setup lang="ts">
import type { MemberView } from "@openagentkit/sdk/protocol";
import { useTranslation } from "../../i18n/index.ts";
import type { Branding } from "../../lib/branding.ts";

defineProps<{
	member: MemberView | null;
	branding: Branding;
}>();

const emit = defineEmits<{ logout: [] }>();
const { t } = useTranslation(["workspace", "auth"]);
</script>

<template>
	<div class="flex min-h-dvh flex-col bg-[var(--kit-bg-subtle)]">
		<header
			class="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--kit-border-subtle)] bg-[var(--kit-surface)] px-4 sm:px-6"
		>
			<div class="flex min-w-0 items-center gap-2.5">
				<span
					class="grid size-8 shrink-0 place-items-center rounded-[var(--kit-radius-icon-sm)] bg-[var(--kit-user-bubble)] text-[length:var(--kit-text-label)] font-medium text-[var(--kit-accent)]"
				>
					{{ branding.productName.slice(0, 1) }}
				</span>
				<span class="min-w-0 truncate text-[length:var(--kit-text-label)] font-medium">
					{{ branding.productName }}
				</span>
				<span
					class="shrink-0 rounded-full bg-[var(--kit-bg-subtle)] px-2 py-0.5 text-[length:var(--kit-text-meta)] text-[var(--kit-fg-muted)]"
				>
					Vue
				</span>
			</div>
			<div class="flex min-w-0 items-center gap-2">
				<span
					v-if="member"
					class="min-w-0 max-w-40 truncate text-[length:var(--kit-text-label)] text-[var(--kit-fg-muted)]"
					:title="member.username"
				>
					{{ member.display_name }}
				</span>
				<button
					v-if="member"
					type="button"
					class="rounded-[var(--kit-radius-sm)] border border-[var(--kit-border)] bg-[var(--kit-surface)] px-3 py-1.5 text-[length:var(--kit-text-label)] transition-colors hover:bg-[var(--kit-bg-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]"
					@click="emit('logout')"
				>
					{{ t("auth:logout") }}
				</button>
			</div>
		</header>
		<main class="grid flex-1 place-items-center px-4 py-10">
			<section
				class="w-full max-w-lg rounded-[var(--kit-radius)] border border-[var(--kit-border-subtle)] bg-[var(--kit-surface)] p-8 text-center shadow-[var(--kit-shadow)]"
			>
				<p class="text-[length:var(--kit-text-caption)] font-medium text-[var(--kit-fg-muted)]">
					{{ t("next") }}
				</p>
				<h1 class="mt-3 text-[length:var(--kit-text-display)] font-medium leading-snug">{{ t("title") }}</h1>
				<p class="mx-auto mt-3 max-w-md text-[length:var(--kit-text-label)] leading-6 text-[var(--kit-fg-muted)]">
					{{ t("body") }}
				</p>
			</section>
		</main>
	</div>
</template>
