<script setup lang="ts">
import { computed } from "vue";
import { SUPPORTED_LOCALES, setLocale, useTranslation } from "../../i18n/index.ts";

const { t, i18n } = useTranslation();
const isEn = computed(() => i18n.resolvedLanguage?.toLowerCase().startsWith("en") ?? false);
</script>

<template>
	<fieldset
		:aria-label="t('languageSwitcher.label')"
		data-testid="language-switcher"
		class="grid w-full shrink-0 grid-cols-2 gap-0.5 rounded-full border border-[var(--kit-border)] bg-[var(--kit-bg-subtle)] p-0.5"
	>
		<button
			v-for="locale in SUPPORTED_LOCALES"
			:key="locale"
			type="button"
			:aria-pressed="isEn ? locale === 'en' : locale === 'zh-CN'"
			class="cursor-pointer rounded-full px-2 py-1.5 text-center text-[length:var(--kit-text-label)] transition-[background-color,color,box-shadow] duration-[var(--kit-duration-fast)] ease-[var(--kit-ease-out)] motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]"
			:class="
				(isEn ? locale === 'en' : locale === 'zh-CN')
					? 'bg-[var(--kit-accent)] font-semibold text-[var(--kit-accent-fg)] shadow-[0_1px_2px_rgb(0_0_0/0.14)]'
					: 'font-medium text-[var(--kit-fg-muted)] hover:bg-[var(--kit-surface)] hover:text-[var(--kit-fg)]'
			"
			@click="void setLocale(locale)"
		>
			{{ locale === "zh-CN" ? t("languageSwitcher.zh") : t("languageSwitcher.en") }}
		</button>
	</fieldset>
</template>
