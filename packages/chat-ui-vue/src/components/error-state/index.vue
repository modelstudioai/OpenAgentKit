<script setup lang="ts">
import { resolveStrings, useKitLocale } from "../kit-i18n/index.ts";
import errorStateStrings, { type ErrorStateStrings } from "./strings.ts";

const props = defineProps<{
	message: string;
	onRetry?: () => void;
	/** 覆盖内置文案（键见 strings.ts）；语言由 KitLocaleProvider 提供，缺省 zh-CN。 */
	strings?: Partial<ErrorStateStrings>;
}>();

const strings = resolveStrings(errorStateStrings, useKitLocale(), props.strings);
</script>

<template>
	<div
		role="alert"
		class="flex min-w-0 items-start gap-3 rounded-[var(--kit-radius)] border border-[var(--kit-border-subtle)] bg-[var(--kit-bg-subtle)] p-4 text-[var(--kit-fg)]"
	>
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linecap="round"
			class="mt-0.5 h-5 w-5 shrink-0 text-[var(--kit-danger)]"
		>
			<circle cx="12" cy="12" r="9" />
			<path d="M12 7v6m0 4h.01" />
		</svg>
		<div class="min-w-0 flex-1">
			<strong class="text-[length:var(--kit-text-base)] font-medium text-[var(--kit-danger)]">
				{{ strings.heading }}
			</strong>
			<p
				class="mt-1 whitespace-pre-wrap text-[length:var(--kit-text-label)] leading-6 text-[var(--kit-fg-muted)] [overflow-wrap:anywhere]"
			>
				{{ message }}
			</p>
			<button
				v-if="onRetry"
				type="button"
				class="mt-3 min-h-10 rounded-[var(--kit-radius-sm)] border border-[var(--kit-border)] bg-[var(--kit-surface)] px-3 py-2 text-[length:var(--kit-text-label)] font-medium transition-colors hover:bg-[var(--kit-bg-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]"
				@click="onRetry"
			>
				{{ strings.retry }}
			</button>
		</div>
	</div>
</template>
