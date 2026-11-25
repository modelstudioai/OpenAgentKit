import { type MaybeRefOrGetter, toValue } from "vue";
import { useLifecycle, useSnapshot } from "../../hooks-vue/shared.ts";
import type { KitClient } from "../../providers/kit/client.ts";
import { useResolvedClient } from "../../providers/kit/vue/use-resolved-client.ts";
import type { SessionAction } from "../session-actions.ts";
import { createSessionDirectory } from "../session-directory.ts";

export function useSessionDirectory(
	source: MaybeRefOrGetter<{ client?: KitClient; onExecuted?: (id: string, action: SessionAction) => void }> = {},
) {
	const client = useResolvedClient(toValue(source).client);
	const controller = createSessionDirectory(client, {
		onExecuted: (id, action) => toValue(source).onExecuted?.(id, action),
	});
	useLifecycle(controller, controller.start);
	return {
		snapshot: useSnapshot(controller),
		actions: useSnapshot(controller.actions),
		reload: controller.reload,
		reloadGroups: controller.reloadGroups,
		refreshStatuses: controller.refreshStatuses,
		rename: controller.rename,
		checkAgent: controller.checkAgent,
		observeChat: controller.observeChat,
		watchStatuses: controller.watchStatuses,
		requestAction: controller.actions.request,
		cancelAction: controller.actions.cancel,
		confirmAction: controller.actions.confirm,
	};
}
