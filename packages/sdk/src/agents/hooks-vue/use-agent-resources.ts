import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { usePublicQuery } from "../../hooks-vue/shared.ts";
import type { KitClient } from "../../providers/kit/client.ts";
import { useResolvedClient } from "../../providers/kit/vue/use-resolved-client.ts";

export function useAgentResources(
	slug: MaybeRefOrGetter<string | null>,
	source: MaybeRefOrGetter<{ client?: KitClient }> = {},
) {
	const client = useResolvedClient(toValue(source).client);
	const query = usePublicQuery(
		async (signal) => {
			const current = toValue(slug);
			if (!current) return null;
			const detail = await client.agent(current, signal);
			if (!detail.resources && !detail.memory_stores?.length) return null;
			return {
				tools: [],
				skills: [],
				mcp_servers: [],
				...detail.resources,
				...(detail.memory_stores ? { memory_stores: detail.memory_stores } : {}),
			};
		},
		() => Boolean(toValue(slug)) && client.supports("agent"),
		() => toValue(slug),
	);
	return { ...query, resources: computed(() => query.data.value ?? null) };
}
