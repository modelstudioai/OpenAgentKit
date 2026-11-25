<script setup lang="ts">
import { KitLocaleProvider } from "@openagentpack/kit-chat-ui-vue";
import { useLocale } from "./index.ts";

const locale = useLocale();
</script>

<template>
	<KitLocaleProvider :locale="locale">
		<slot />
	</KitLocaleProvider>
</template>
