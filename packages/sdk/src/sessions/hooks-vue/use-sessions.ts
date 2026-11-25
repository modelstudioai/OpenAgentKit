import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { usePublicQuery } from "../../hooks-vue/shared.ts";
import type { KitClient } from "../../providers/kit/client.ts";
import { useResolvedClient } from "../../providers/kit/vue/use-resolved-client.ts";

export function useSessions(source: MaybeRefOrGetter<{ client?: KitClient; agentSlug?: string; limit?: number }> = {}) {
	const client = useResolvedClient(toValue(source).client);
	const query = usePublicQuery(
		(signal) => client.sessions({ agentSlug: toValue(source).agentSlug, limit: toValue(source).limit }, signal),
		() => client.supports("sessions"),
		() => [toValue(source).agentSlug, toValue(source).limit],
	);
	return { ...query, sessions: computed(() => query.data.value?.sessions ?? []) };
}
