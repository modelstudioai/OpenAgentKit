import { ErrorState } from "@openagentpack/kit-chat-ui";
import i18n from "i18next";
import { createRoot } from "react-dom/client";
import { App } from "./app.tsx";
import { ChatUILocaleBridge } from "./i18n/chat-ui-bridge.tsx";
import { initI18n } from "./i18n/index.ts";
import { brandingFromConfig } from "./lib/branding.ts";
import { bootstrapClient } from "./lib/kit.ts";
import "./styles.css";

const root = createRoot(document.getElementById("root") as HTMLElement);
await initI18n();
try {
	const { controller, config, baseUrl } = await bootstrapClient();
	root.render(
		<ChatUILocaleBridge>
			<App controller={controller} branding={brandingFromConfig(config.branding, baseUrl)} />
		</ChatUILocaleBridge>,
	);
} catch (error) {
	root.render(
		<main className="p-6">
			<ErrorState
				message={error instanceof Error ? error.message : i18n.t("bootstrapFailed")}
				onRetry={() => window.location.reload()}
			/>
		</main>,
	);
}
