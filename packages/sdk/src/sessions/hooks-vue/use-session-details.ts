import { type MaybeRefOrGetter, onScopeDispose, shallowRef, toValue, watch } from "vue";
import type { MessageFileAssociation } from "../../protocol/index.ts";
import type { KitClient } from "../../providers/kit/client.ts";
import { useResolvedClient } from "../../providers/kit/vue/use-resolved-client.ts";
import { createSessionDetails } from "../session-details.ts";

export function useSessionDetails(
	source: MaybeRefOrGetter<{
		client?: KitClient;
		sessionId: string | null;
		setMessageFiles?: (entries: MessageFileAssociation[] | null) => void;
	}>,
) {
	const client = useResolvedClient(toValue(source).client);
	let target = toValue(source).sessionId;
	const create = (sessionId: string | null) =>
		createSessionDetails(client, sessionId, (entries) => {
			// 旧目标的迟到通知不能写入当前会话。
			if (target === sessionId) toValue(source).setMessageFiles?.(entries);
		});
	let controller = create(target);
	const snapshot = shallowRef(controller.getSnapshot());
	let unsubscribe = controller.subscribe(() => {
		snapshot.value = controller.getSnapshot();
	});
	if (client.supports("session")) void controller.refresh();

	watch(
		() => toValue(source).sessionId,
		(sessionId) => {
			target = sessionId;
			unsubscribe();
			controller.dispose();
			controller = create(sessionId);
			unsubscribe = controller.subscribe(() => {
				snapshot.value = controller.getSnapshot();
			});
			snapshot.value = controller.getSnapshot();
			if (client.supports("session")) void controller.refresh();
		},
	);
	onScopeDispose(() => {
		unsubscribe();
		controller.dispose();
	});

	return { snapshot, reload: () => controller.refresh() };
}
