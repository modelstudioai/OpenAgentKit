import { setKitErrorMessageResolver } from "@openagentkit/sdk/state";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enAuth from "./locales/en/auth.ts";
import enBranding from "./locales/en/branding.ts";
import enCatalog from "./locales/en/catalog.ts";
import enCommon from "./locales/en/common.ts";
import enEval from "./locales/en/eval.ts";
import enMembers from "./locales/en/members.ts";
import enNavigation from "./locales/en/navigation.ts";
import enOperations from "./locales/en/operations.ts";
import enPresetPacks from "./locales/en/presetPacks.ts";
import enTemplates from "./locales/en/templates.ts";
import enUsage from "./locales/en/usage.ts";
import zhAuth from "./locales/zh-CN/auth.ts";
import zhBranding from "./locales/zh-CN/branding.ts";
import zhCatalog from "./locales/zh-CN/catalog.ts";
import zhCommon from "./locales/zh-CN/common.ts";
import zhEval from "./locales/zh-CN/eval.ts";
import zhMembers from "./locales/zh-CN/members.ts";
import zhNavigation from "./locales/zh-CN/navigation.ts";
import zhOperations from "./locales/zh-CN/operations.ts";
import zhPresetPacks from "./locales/zh-CN/presetPacks.ts";
import zhTemplates from "./locales/zh-CN/templates.ts";
import zhUsage from "./locales/zh-CN/usage.ts";
import { resolveServerErrorMessage } from "./server-error.ts";

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
	let stored: string | null = null;
	try {
		stored = localStorage.getItem(LOCALE_STORAGE_KEY);
	} catch {
		// 存储被禁用时仍按 URL / 浏览器语言初始化，避免启动白屏。
	}
	return {
		stored,
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

export interface I18nResources {
	"zh-CN": {
		common: typeof zhCommon;
		auth: typeof zhAuth;
		navigation: typeof zhNavigation;
		members: typeof zhMembers;
		usage: typeof zhUsage;
		operations: typeof zhOperations;
		branding: typeof zhBranding;
		presetPacks: typeof zhPresetPacks;
		catalog: typeof zhCatalog;
		templates: typeof zhTemplates;
		eval: typeof zhEval;
	};
	en: {
		common: typeof enCommon;
		auth: typeof enAuth;
		navigation: typeof enNavigation;
		members: typeof enMembers;
		usage: typeof enUsage;
		operations: typeof enOperations;
		branding: typeof enBranding;
		presetPacks: typeof enPresetPacks;
		catalog: typeof enCatalog;
		templates: typeof enTemplates;
		eval: typeof enEval;
	};
}

/** 入口在挂载前调用：资源内联，初始化即时完成，不引入 HTTP 语言包加载。 */
export async function initI18n() {
	const lng = resolveLocale(readBrowserLocaleEnv());
	await i18n.use(initReactI18next).init({
		lng,
		fallbackLng: "zh-CN",
		supportedLngs: [...SUPPORTED_LOCALES],
		defaultNS: "common",
		interpolation: { escapeValue: false },
		ns: [
			"common",
			"auth",
			"navigation",
			"members",
			"usage",
			"operations",
			"branding",
			"presetPacks",
			"catalog",
			"templates",
			"eval",
		],
		resources: {
			"zh-CN": {
				common: zhCommon,
				auth: zhAuth,
				navigation: zhNavigation,
				members: zhMembers,
				usage: zhUsage,
				operations: zhOperations,
				branding: zhBranding,
				presetPacks: zhPresetPacks,
				catalog: zhCatalog,
				templates: zhTemplates,
				eval: zhEval,
			},
			en: {
				common: enCommon,
				auth: enAuth,
				navigation: enNavigation,
				members: enMembers,
				usage: enUsage,
				operations: enOperations,
				branding: enBranding,
				presetPacks: enPresetPacks,
				catalog: enCatalog,
				templates: enTemplates,
				eval: enEval,
			},
		},
	});
	setKitErrorMessageResolver(resolveServerErrorMessage);
	document.documentElement.lang = i18n.resolvedLanguage ?? lng;
	return i18n;
}

/** 切换语言：持久化用户选择、同步 <html lang>，再通知 react-i18next 订阅者。 */
export function setLocale(locale: KitLocale) {
	try {
		localStorage.setItem(LOCALE_STORAGE_KEY, locale);
	} catch {
		// 无法持久化时当前页面仍可切换语言。
	}
	document.documentElement.lang = locale;
	return i18n.changeLanguage(locale);
}

declare module "i18next" {
	interface CustomTypeOptions {
		defaultNS: "common";
		resources: I18nResources["zh-CN"];
	}
}
