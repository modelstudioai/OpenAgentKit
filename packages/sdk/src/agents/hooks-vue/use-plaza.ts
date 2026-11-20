import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { usePublicQuery } from "../../hooks-vue/shared.ts";
import type { PlazaCategory } from "../../protocol/index.ts";
import type { KitClient } from "../../providers/kit/client.ts";
import { useResolvedClient } from "../../providers/kit/vue/use-resolved-client.ts";

export function usePlaza(source: MaybeRefOrGetter<{ client?: KitClient; category?: PlazaCategory; q?: string }> = {}) {
	const client = useResolvedClient(toValue(source).client);
	const query = usePublicQuery(
		(signal) => client.plaza({ category: toValue(source).category, q: toValue(source).q }, signal),
		() => client.supports("plaza"),
		() => [toValue(source).category, toValue(source).q],
	);
	return { ...query, view: computed(() => query.data.value ?? null) };
}
