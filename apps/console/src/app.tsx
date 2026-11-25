import type { KitRuntimeConfig } from "@openagentkit/sdk/protocol";
import { KitLocaleProvider } from "@openagentpack/kit-chat-ui";
import { App as AntdApp, ConfigProvider } from "antd";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./app.module.less";
import { EvalPage } from "./eval-page.tsx";
import { AdminLogin } from "./features/auth/admin-login.tsx";
import { BrandingPage } from "./features/branding/branding-page.tsx";
import { MembersPage } from "./features/members/members-page.tsx";
import { ConsoleLayout } from "./features/navigation/console-layout.tsx";
import { type ConsoleTab, consoleRouteTab } from "./features/navigation/console-route.ts";
import { ConsoleRouter, useConsoleRoute } from "./features/navigation/console-router.tsx";
import { OperationsPage } from "./features/operations/operations-page.tsx";
import { CreateTemplatePage } from "./features/templates/create-template-page.tsx";
import { TemplateDebugCleanupNotice } from "./features/templates/template-debug-cleanup-notice.tsx";
import { TemplateExitConfirmationProvider } from "./features/templates/template-exit-confirmation.tsx";
import { TemplateListPage } from "./features/templates/template-list-page.tsx";
import { SessionUsagePage } from "./features/usage/session-usage-page.tsx";
import { antdTheme } from "./lib/antd-theme.ts";
import { adminToken } from "./lib/api.ts";

const PAGE_COMPONENTS = {
	operations: OperationsPage,
	usage: SessionUsagePage,
	branding: BrandingPage,
	eval: EvalPage,
};

function getSimplePage(tab: ConsoleTab) {
	return tab in PAGE_COMPONENTS ? PAGE_COMPONENTS[tab as keyof typeof PAGE_COMPONENTS] : null;
}

export function App({ auth }: { auth?: KitRuntimeConfig["auth"] }) {
	const { i18n } = useTranslation();
	// antd / dayjs 内置文案跟随当前语言（业务自写中文的迁移在后续阶段）。
	const antdLocale = i18n.resolvedLanguage === "en" ? enUS : zhCN;
	useEffect(() => {
		const applyDayjs = (lng: string) => dayjs.locale(lng === "en" ? "en" : "zh-cn");
		applyDayjs(i18n.language);
		i18n.on("languageChanged", applyDayjs);
		return () => {
			i18n.off("languageChanged", applyDayjs);
		};
	}, [i18n]);
	// button/wave 对齐百炼 BailianConfigProvider：按钮无点击波纹、两字按钮不自动拆分
	return (
		<ConfigProvider theme={antdTheme} locale={antdLocale} button={{ autoInsertSpace: false }} wave={{ disabled: true }}>
			{/* chat-ui 词典与 antd 共用同一语言来源，保证三处文案一致（方案 §3.2）。 */}
			<KitLocaleProvider locale={i18n.resolvedLanguage === "en" ? "en" : "zh-CN"}>
				<AntdApp>
					<TemplateExitConfirmationProvider>
						<ConsoleRouter>
							<ConsoleApp auth={auth} />
						</ConsoleRouter>
					</TemplateExitConfirmationProvider>
				</AntdApp>
			</KitLocaleProvider>
		</ConfigProvider>
	);
}

function ConsoleApp({ auth }: { auth?: KitRuntimeConfig["auth"] }) {
	const { t } = useTranslation("common");
	const { route, navigate, complete, locked: navigationLocked, setLocked: setNavigationLocked } = useConsoleRoute();
	const tab = consoleRouteTab(route);
	const [token, setToken] = useState(adminToken());
	const [savedTemplateName, setSavedTemplateName] = useState<string>();
	if (!token) return <AdminLogin onLogin={setToken} />;
	const Page = getSimplePage(tab);
	return (
		<ConsoleLayout
			tab={tab}
			onChange={(next) => {
				if (next === route.page && !route.id && !route.tab && !route.preset) return;
				setSavedTemplateName(undefined);
				navigate({ page: next });
			}}
			disabled={navigationLocked}
		>
			<TemplateDebugCleanupNotice />
			{Page ? (
				<Page />
			) : tab === "template-create" ? (
				<CreateTemplatePage
					onPendingChange={setNavigationLocked}
					onCancel={() => navigate({ page: "template-list" })}
					onSaved={(template) => {
						setSavedTemplateName(template.name);
						complete({ page: "template-list" });
					}}
				/>
			) : tab === "template-list" ? (
				<TemplateListPage
					savedName={savedTemplateName}
					onPendingChange={setNavigationLocked}
					onCreate={() => {
						setSavedTemplateName(undefined);
						navigate({ page: "template-create" });
					}}
				/>
			) : (
				<MembersPage
					onPendingChange={setNavigationLocked}
					oidcIssuer={auth?.oidc?.issuer}
					passwordLogin={auth?.passwordLogin ?? true}
				/>
			)}
			{tab !== "template-create" && tab !== "template-list" ? (
				<p className={styles.pageFootnote}>{t("footnote.agentAssets")}</p>
			) : null}
		</ConsoleLayout>
	);
}
