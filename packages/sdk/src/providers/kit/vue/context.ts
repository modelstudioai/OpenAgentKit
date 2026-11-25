import { defineComponent, type InjectionKey, inject, type PropType, provide, type Slots } from "vue";
import type { KitClient } from "../client.ts";

interface KitContextValue {
	client: KitClient;
}

const KitContextKey: InjectionKey<KitContextValue> = Symbol("kit-context");

/** Kit Client 的 Vue 注入点；身份切换时由宿主用 key 重挂载整棵视图。 */
export const KitProvider = defineComponent({
	name: "KitProvider",
	props: {
		client: { type: Object as PropType<KitClient>, required: true },
	},
	setup(props, { slots }: { slots: Slots }) {
		provide(KitContextKey, { client: props.client });
		return () => slots.default?.();
	},
});

/** 仅供可注入 Provider 的 Hook 使用；公开 Context/Client Hook 仍要求 KitProvider。 */
export function useOptionalKitContext(): KitContextValue | null {
	return inject(KitContextKey, null);
}

export function useKitContext(): KitContextValue {
	const context = useOptionalKitContext();
	if (!context) throw new Error("kit-sdk/providers/kit/vue: 组件必须位于 <KitProvider> 内");
	return context;
}

export function useKitClient(): KitClient {
	return useKitContext().client;
}
