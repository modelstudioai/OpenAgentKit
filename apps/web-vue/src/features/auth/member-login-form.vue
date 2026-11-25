<script setup lang="ts">
import { ErrorState } from "@openagentpack/kit-chat-ui-vue";
import { ref } from "vue";
import { setLocale, useTranslation } from "../../i18n/index.ts";

const props = defineProps<{
	pending: boolean;
	error: string | null;
	onLogin?: (input: { username: string; password: string }) => Promise<void>;
	onOidcLogin?: () => Promise<void>;
	onRetry: () => Promise<void>;
}>();

const fieldClass =
	"mt-2 block min-h-11 w-full min-w-0 rounded-[var(--kit-radius-sm)] border border-[var(--kit-border)] bg-[var(--kit-bg-subtle)] px-3 py-2.5 text-[length:var(--kit-text-heading)] transition-colors focus-visible:border-[var(--kit-focus)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)] disabled:opacity-50";

const { t, i18n } = useTranslation(["auth", "common"]);
const username = ref("");
const password = ref("");

function submit(event: Event) {
	event.preventDefault();
	if (props.pending || !props.onLogin) return;
	void props
		.onLogin({ username: username.value.trim(), password: password.value })
		.catch(() => undefined)
		.finally(() => {
			password.value = "";
		});
}

function beginSso() {
	if (!props.pending) void props.onOidcLogin?.().catch(() => undefined);
}

function retry() {
	if (props.pending) return;
	void props.onRetry().catch(() => undefined);
}
</script>

<template>
	<main class="grid min-h-full min-w-0 place-items-center px-4 py-8 sm:px-6">
		<form
			aria-labelledby="member-login-heading"
			class="relative w-full min-w-0 max-w-sm space-y-6 rounded-[var(--kit-radius)] border border-[var(--kit-border-subtle)] bg-[var(--kit-surface)] p-6 shadow-[var(--kit-shadow)] sm:p-8"
			@submit="submit"
		>
			<button
				type="button"
				:aria-label="
					t('common:languageSwitcher.switchTo', {
						language: i18n.resolvedLanguage === 'en' ? t('common:languageSwitcher.zh') : t('common:languageSwitcher.en'),
					})
				"
				class="absolute top-3 right-3 inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[length:var(--kit-text-label)] text-[var(--kit-fg-muted)] transition-colors duration-[var(--kit-duration-fast)] ease-[var(--kit-ease-out)] hover:bg-[var(--kit-bg-subtle)] hover:text-[var(--kit-fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)] motion-reduce:transition-none"
				@click="setLocale(i18n.resolvedLanguage === 'en' ? 'zh-CN' : 'en')"
			>
				<svg
					aria-hidden="true"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					class="size-3.5"
				>
					<circle cx="12" cy="12" r="9" />
					<path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
				</svg>
				<span>{{ i18n.resolvedLanguage === "en" ? "中文" : "English" }}</span>
			</button>
			<header class="text-center">
				<p class="mb-3 text-[length:var(--kit-text-caption)] font-medium text-[var(--kit-fg-muted)]">
					Managed Agent
				</p>
				<h1 id="member-login-heading" class="text-[length:var(--kit-text-display)] font-medium leading-snug">
					{{ t("heading") }}
				</h1>
				<p class="mt-3 text-[length:var(--kit-text-label)] leading-6 text-[var(--kit-fg-muted)]">
					{{ t(onOidcLogin ? (onLogin ? "dualIntro" : "oidcIntro") : "intro") }}
				</p>
			</header>
			<ErrorState
				v-if="error"
				:message="error"
				:on-retry="pending ? undefined : retry"
			/>
			<fieldset :disabled="pending" class="min-w-0 space-y-5">
				<legend class="sr-only">{{ t("legend") }}</legend>
				<template v-if="onLogin">
					<div>
						<label for="login-username" class="text-[length:var(--kit-text-label)] font-medium">
							{{ t("username") }}
						</label>
						<input
							id="login-username"
							v-model="username"
							name="username"
							autocomplete="username"
							required
							maxlength="32"
							:class="fieldClass"
						/>
					</div>
					<div>
						<label for="login-password" class="text-[length:var(--kit-text-label)] font-medium">
							{{ t("password") }}
						</label>
						<input
							id="login-password"
							v-model="password"
							name="password"
							type="password"
							autocomplete="current-password"
							required
							maxlength="128"
							:class="fieldClass"
						/>
					</div>
				</template>
				<button
					v-if="onLogin"
					type="submit"
					:aria-busy="pending"
					class="flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--kit-radius-sm)] bg-[var(--kit-accent)] px-4 py-2.5 text-[length:var(--kit-text-base)] font-medium text-[var(--kit-accent-fg)] transition-opacity enabled:hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)] disabled:cursor-not-allowed disabled:opacity-50"
				>
					<span
						v-if="pending"
						aria-hidden="true"
						class="h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-pulse"
					/>
					{{ t(pending ? "processing" : onOidcLogin ? "passwordSubmit" : "submit") }}
				</button>
				<button
					v-if="onOidcLogin"
					type="button"
					:aria-busy="pending"
					class="flex min-h-11 w-full items-center justify-center rounded-[var(--kit-radius-sm)] px-4 py-2.5 text-[length:var(--kit-text-base)] font-medium transition-opacity enabled:hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)] disabled:cursor-not-allowed disabled:opacity-50"
					:class="onLogin ? 'border border-[var(--kit-border)] text-[var(--kit-fg)]' : 'bg-[var(--kit-accent)] text-[var(--kit-accent-fg)]'"
					@click="beginSso"
				>
					{{ t("oidcSubmit") }}
				</button>
			</fieldset>
		</form>
	</main>
</template>
