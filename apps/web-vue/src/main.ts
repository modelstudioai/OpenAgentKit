import { createApp } from "vue";
import App from "./app.vue";
import { initI18n } from "./i18n/index.ts";
import { brandingFromConfig } from "./lib/branding.ts";
import { bootstrapClient } from "./lib/kit.ts";
import "./styles.css";

await initI18n();

try {
	const { controller, config, baseUrl } = await bootstrapClient();
	createApp(App, {
		controller,
		branding: brandingFromConfig(config.branding, baseUrl),
	}).mount("#root");
} catch (error) {
	createApp(App, {
		controller: null,
		branding: brandingFromConfig(null),
		bootstrapError: error instanceof Error ? error.message : String(error),
	}).mount("#root");
}
