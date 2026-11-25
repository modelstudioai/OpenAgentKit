import { type MaybeRefOrGetter, toValue } from "vue";
import { useLifecycle, useSnapshot } from "../../hooks-vue/shared.ts";
import type { KitClient } from "../../providers/kit/client.ts";
import { useResolvedClient } from "../../providers/kit/vue/use-resolved-client.ts";
import { createQuotaRecovery } from "../quota.ts";

export function useQuotaRecovery(source: MaybeRefOrGetter<{ client?: KitClient }> = {}) {
	const client = useResolvedClient(toValue(source).client);
	const controller = createQuotaRecovery(client);
	useLifecycle(controller);
	return { snapshot: useSnapshot(controller), recheck: controller.recheck };
}
