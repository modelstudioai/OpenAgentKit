import { type MaybeRefOrGetter, toValue } from "vue";
import { usePublicQuery } from "../../hooks-vue/shared.ts";
import type { KitClient } from "../../providers/kit/client.ts";
import { useResolvedClient } from "../../providers/kit/vue/use-resolved-client.ts";

export function useUsageLimits(
	source: MaybeRefOrGetter<{ client?: KitClient; enabled?: boolean; days?: number }> = {},
) {
	const client = useResolvedClient(toValue(source).client);
	return usePublicQuery(
		(signal) => client.usageLimits({ days: toValue(source).days }, signal),
		() => toValue(source).enabled !== false && client.supports("usageLimits"),
		() => toValue(source).days,
	);
}
