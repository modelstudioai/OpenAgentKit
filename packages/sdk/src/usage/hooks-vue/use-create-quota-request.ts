import { type MaybeRefOrGetter, toValue } from "vue";
import { useLifecycle, useSnapshot } from "../../hooks-vue/shared.ts";
import type { KitClient } from "../../providers/kit/client.ts";
import { useResolvedClient } from "../../providers/kit/vue/use-resolved-client.ts";
import { createMutation } from "../../state.ts";

export function useCreateQuotaRequest(source: MaybeRefOrGetter<{ client?: KitClient }> = {}) {
	const client = useResolvedClient(toValue(source).client);
	const controller = createMutation(client.createQuotaRequest);
	useLifecycle(controller);
	return { snapshot: useSnapshot(controller), submit: controller.run };
}
