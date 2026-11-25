import { type MaybeRefOrGetter, toValue, watch } from "vue";
import { useLifecycle, useSnapshot } from "../../hooks-vue/shared.ts";
import type { KitClient } from "../../providers/kit/client.ts";
import { useResolvedClient } from "../../providers/kit/vue/use-resolved-client.ts";
import { createSessionSearch } from "../session-directory.ts";

export function useSessionSearch(
	input: MaybeRefOrGetter<string>,
	source: MaybeRefOrGetter<{ client?: KitClient; debounceMs?: number }> = {},
) {
	const client = useResolvedClient(toValue(source).client);
	const controller = createSessionSearch(client, toValue(source).debounceMs);
	useLifecycle(controller);
	watch(
		() => toValue(input),
		(query) => controller.setQuery(query),
		{ immediate: true },
	);
	return {
		snapshot: useSnapshot(controller),
		load: controller.load,
		reload: controller.reload,
		loadMore: controller.loadMore,
		retry: controller.retry,
	};
}
