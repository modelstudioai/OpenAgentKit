import { KitLocaleProvider } from "@openagentpack/kit-chat-ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/** chat-ui 词典跟随 app 的 i18next 语言，web 与组件文案三处一致（方案 §3.2）。 */
export function ChatUILocaleBridge({ children }: { children: ReactNode }) {
	const { i18n } = useTranslation();
	return <KitLocaleProvider locale={i18n.resolvedLanguage === "en" ? "en" : "zh-CN"}>{children}</KitLocaleProvider>;
}
