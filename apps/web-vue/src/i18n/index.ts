import { setKitErrorMessageResolver } from "@openagentkit/sdk/state";
import i18n from "i18next";
import { computed, ref } from "vue";
// 产品文案只有一份：auth / common 直接复用 apps/web；本 app 只保留自己的 workspace 命名空间。
import enAuth from "../../../web/src/i18n/locales/en/auth.ts";
import enCommon from "../../../web/src/i18n/locales/en/common.ts";
import zhAuth from "../../../web/src/i18n/locales/zh-CN/auth.ts";
import zhCommon from "../../../web/src/i18n/locales/zh-CN/common.ts";
import enWorkspace from "./locales/en/workspace.ts";
import zhWorkspace from "./locales/zh-CN/workspace.ts";
import { resolveServerErrorMessage } from "./server-error.ts";

export const SUPPORTED_LOCALES = ["zh-CN", "en"] as const;
export type KitLocale = (typeof SUPPORTED_LOCALES)[number];
export const LOCALE_STORAGE_KEY = "kit.locale";

/** 当前语言；i18next 的 languageChanged 会同步它，模板读取它即可追踪切换。 */
const currentLocale = ref<KitLocale>("zh-CN");

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

/** 优先级：用户显式选择 > URL ?lang= > 浏览器语言 > 默认 zh-CN。 */
export function resolveLocale(env: LocaleEnv): KitLocale {
	for (const candidate of [env.stored, env.urlParam, env.navigatorLanguage]) {
		const locale = normalizeLocale(candidate);
		if (locale) return locale;
	}
	return "zh-CN";
}

function normalize(language: string | undefined): KitLocale {
	return language?.toLowerCase().startsWith("en") ? "en" : "zh-CN";
}

function applyDocumentTitle() {
	document.title = i18n.t("appTitle");
}

/** 入口在挂载前调用：资源内联，初始化即时完成，不引入 HTTP 语言包加载。 */
export async function initI18n() {
	const lng = resolveLocale(readBrowserLocaleEnv());
	await i18n.init({
		lng,
		fallbackLng: "zh-CN",
		supportedLngs: [...SUPPORTED_LOCALES],
		defaultNS: "common",
		ns: ["common", "auth", "workspace"],
		interpolation: { escapeValue: false },
		resources: {
			"zh-CN": { common: zhCommon, auth: zhAuth, workspace: zhWorkspace },
			en: { common: enCommon, auth: enAuth, workspace: enWorkspace },
		},
	});
	setKitErrorMessageResolver(resolveServerErrorMessage);
	currentLocale.value = normalize(i18n.resolvedLanguage);
	document.documentElement.lang = currentLocale.value;
	applyDocumentTitle();
	i18n.on("languageChanged", (language) => {
		currentLocale.value = normalize(language);
		document.documentElement.lang = currentLocale.value;
		applyDocumentTitle();
	});
	return i18n;
}

/** 切换语言：持久化用户选择、同步 <html lang>，再通知订阅者。 */
export function setLocale(locale: KitLocale) {
	localStorage.setItem(LOCALE_STORAGE_KEY, locale);
	document.documentElement.lang = locale;
	return i18n.changeLanguage(locale);
}

export type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * Vue 版最小翻译入口：每次调用读取 currentLocale，模板因此能追踪语言切换。
 * 命名空间默认取第一个，显式 `common:key` 写法与 i18next 一致。
 */
export function useTranslation(namespace: string | string[] = "common") {
	const defaultNS = Array.isArray(namespace) ? namespace[0] : namespace;
	const t: Translate = (key, options) =>
		String(
			i18n.t(key, {
				...options,
				lng: currentLocale.value,
				ns: defaultNS,
			}),
		);
	return { t, i18n };
}

export function useLocale() {
	return computed<KitLocale>(() => currentLocale.value);
}
