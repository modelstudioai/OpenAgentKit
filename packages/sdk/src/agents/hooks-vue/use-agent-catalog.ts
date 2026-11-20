import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { usePublicQuery } from "../../hooks-vue/shared.ts";
import type { KitClient } from "../../providers/kit/client.ts";
import { useResolvedClient } from "../../providers/kit/vue/use-resolved-client.ts";

export function useAgentCatalog(source: MaybeRefOrGetter<{ client?: KitClient }> = {}) {
	const client = useResolvedClient(toValue(source).client);
	const query = usePublicQuery(
		(signal) => client.agents(signal),
		() => client.supports("agents"),
	);
	return { ...query, agents: computed(() => query.data.value ?? []) };
}
