import { createContext, createElement, type ReactNode, useContext } from "react";

/** 组件语言集合：zh-CN 是 copy-in 默认，宿主不包裹 Provider 时行为与接入前一致。 */
export type KitLocale = "zh-CN" | "en";

/** 组件词典表：zh-CN 是唯一事实来源，en 键对齐由 pnpm check:i18n 守护。 */
export interface KitStringTable<T extends object> {
	"zh-CN": T;
	en: T;
}

const KitLocaleContext = createContext<KitLocale>("zh-CN");

/** copy-in 宿主设定语言：`<KitLocaleProvider locale="en">`；未包裹时回落 zh-CN，行为与接入前一致。 */
export function KitLocaleProvider({ locale, children }: { locale: KitLocale; children: ReactNode }) {
	return createElement(KitLocaleContext.Provider, { value: locale }, children);
}

export function useKitLocale(): KitLocale {
	return useContext(KitLocaleContext);
}

/** 纯合并：locale 取词典，再让调用方 strings 覆盖生效；无 DOM 可测。 */
export function resolveStrings<T extends object>(
	table: KitStringTable<T>,
	locale: KitLocale,
	overrides?: Partial<T>,
): T {
	const base = locale === "en" ? table.en : table["zh-CN"];
	return overrides ? { ...base, ...overrides } : base;
}

/** 组件内部取当前语言词典（不含调用方覆盖时用这个）。 */
export function useKitStrings<T extends object>(table: KitStringTable<T>): T {
	return resolveStrings(table, useKitLocale());
}

/** 轻量插值：把词典字符串里的 {{name}} 换成值；词典叶子保持字符串，check:i18n 兼容。 */
export function format(template: string, values: Record<string, string | number>): string {
	return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => String(values[key] ?? ""));
}
