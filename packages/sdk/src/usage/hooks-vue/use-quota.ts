import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { usePublicQuery } from "../../hooks-vue/shared.ts";
import type { KitClient } from "../../providers/kit/client.ts";
import { useResolvedClient } from "../../providers/kit/vue/use-resolved-client.ts";

export function useQuota(source: MaybeRefOrGetter<{ client?: KitClient; days?: number }> = {}) {
	const client = useResolvedClient(toValue(source).client);
	const query = usePublicQuery(
		(signal) => client.quota({ days: toValue(source).days }, signal),
		() => client.supports("quota"),
		() => toValue(source).days,
	);
	return { ...query, quota: computed(() => query.data.value ?? null) };
}
