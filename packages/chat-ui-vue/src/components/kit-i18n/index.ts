import { computed, defineComponent, type InjectionKey, inject, type PropType, provide, type Ref, ref } from "vue";

/** 组件语言集合：zh-CN 是 copy-in 默认，宿主不包裹 Provider 时行为与接入前一致。 */
export type KitLocale = "zh-CN" | "en";

/** 组件词典表：zh-CN 是唯一事实来源，en 键对齐由 pnpm check:i18n 守护。 */
export interface KitStringTable<T extends object> {
	"zh-CN": T;
	en: T;
}

const DEFAULT_LOCALE: Ref<KitLocale> = ref("zh-CN");
const KitLocaleKey: InjectionKey<Ref<KitLocale>> = Symbol("kit-locale");

/** copy-in 宿主设定语言：`<KitLocaleProvider locale="en">`；未包裹时回落 zh-CN。 */
export const KitLocaleProvider = defineComponent({
	name: "KitLocaleProvider",
	props: {
		locale: { type: String as PropType<KitLocale>, required: true },
	},
	setup(props, { slots }) {
		provide(
			KitLocaleKey,
			computed(() => props.locale),
		);
		return () => slots.default?.();
	},
});

/** 在渲染函数或 computed 中调用才具备响应性；模板内直接调用同样会追踪。 */
export function useKitLocale(): KitLocale {
	return inject(KitLocaleKey, DEFAULT_LOCALE).value;
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

/** 组件内部取当前语言词典；返回 computed，语言切换后模板自动更新。 */
export function useKitStrings<T extends object>(table: KitStringTable<T>) {
	return computed(() => resolveStrings(table, useKitLocale()));
}

/** 轻量插值：把词典字符串里的 {{name}} 换成值；词典叶子保持字符串，check:i18n 兼容。 */
export function format(template: string, values: Record<string, string | number>): string {
	return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => String(values[key] ?? ""));
}
