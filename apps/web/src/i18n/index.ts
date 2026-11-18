import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enAuth from "./locales/en/auth.ts";
import enChat from "./locales/en/chat.ts";
import enCommon from "./locales/en/common.ts";
import enLayout from "./locales/en/layout.ts";
import enPlaza from "./locales/en/plaza.ts";
import enUsage from "./locales/en/usage.ts";
import zhAuth from "./locales/zh-CN/auth.ts";
import zhChat from "./locales/zh-CN/chat.ts";
import zhCommon from "./locales/zh-CN/common.ts";
import zhLayout from "./locales/zh-CN/layout.ts";
import zhPlaza from "./locales/zh-CN/plaza.ts";
import zhUsage from "./locales/zh-CN/usage.ts";

export const SUPPORTED_LOCALES = ["zh-CN", "en"] as const;
export type KitLocale = (typeof SUPPORTED_LOCALES)[number];
export const LOCALE_STORAGE_KEY = "kit.locale";

/** 语言解析环境由调用方注入：resolveLocale 不读全局，纯 Node 可测（方案 §9.2）。 */
export interface LocaleEnv {
	stored: string | null;
	urlParam: string | null;
	navigatorLanguage: string | undefined;
}

export function readBrowserLocaleEnv(): LocaleEnv {
	return {
		stored: localStorage.getItem(LOCALE_STORAGE_KEY),
		urlParam: new URLSearchParams(window.location.search).get("lang"),
		navigatorLanguage: typeof navigator === "undefined" ? undefined : navigator.language,
	};
}

function normalizeLocale(value: string | null | undefined): KitLocale | null {
	if (!value) return null;
	const lower = value.toLowerCase();
	if (lower === "zh" || lower.startsWith("zh-")) return "zh-CN";
	if (lower === "en" || lower.startsWith("en-")) return "en";
	return null;
}

/** 优先级：用户显式选择 > URL ?lang= > 浏览器语言 > 默认 zh-CN（方案 §4）。 */
export function resolveLocale(env: LocaleEnv): KitLocale {
	for (const candidate of [env.stored, env.urlParam, env.navigatorLanguage]) {
		const locale = normalizeLocale(candidate);
		if (locale) return locale;
	}
	return "zh-CN";
}

/** 各命名空间以 zh-CN 词表为类型来源（t 的编译期键校验）；en 键对齐由 check:i18n 守护。 */
export interface AppNamespaces {
	common: typeof zhCommon;
	auth: typeof zhAuth;
	layout: typeof zhLayout;
	chat: typeof zhChat;
	plaza: typeof zhPlaza;
	usage: typeof zhUsage;
}

/** 浏览器标签页标题跟随语言（index.html 静态中文标题在 init 后被覆盖）。 */
function applyDocumentTitle() {
	document.title = i18n.t("appTitle");
}

/** 入口在挂载前调用：资源内联，初始化即时完成，不引入 HTTP 语言包加载。 */
export async function initI18n() {
	const lng = resolveLocale(readBrowserLocaleEnv());
	await i18n.use(initReactI18next).init({
		lng,
		fallbackLng: "zh-CN",
		supportedLngs: [...SUPPORTED_LOCALES],
		defaultNS: "common",
		ns: ["common", "auth", "layout", "chat", "plaza", "usage"],
		resources: {
			"zh-CN": { common: zhCommon, auth: zhAuth, layout: zhLayout, chat: zhChat, plaza: zhPlaza, usage: zhUsage },
			en: { common: enCommon, auth: enAuth, layout: enLayout, chat: enChat, plaza: enPlaza, usage: enUsage },
		},
	});
	document.documentElement.lang = i18n.resolvedLanguage ?? lng;
	applyDocumentTitle();
	i18n.on("languageChanged", applyDocumentTitle);
	return i18n;
}

/** 切换语言：持久化用户选择、同步 <html lang>，再通知 react-i18next 订阅者。 */
export function setLocale(locale: KitLocale) {
	localStorage.setItem(LOCALE_STORAGE_KEY, locale);
	document.documentElement.lang = locale;
	return i18n.changeLanguage(locale);
}

declare module "i18next" {
	interface CustomTypeOptions {
		defaultNS: "common";
		resources: AppNamespaces;
	}
}
