import { computed, type MaybeRefOrGetter, toValue, watch } from "vue";
import { useLifecycle, useSnapshot } from "../../hooks-vue/shared.ts";
import type { KitClient } from "../../providers/kit/client.ts";
import { useResolvedClient } from "../../providers/kit/vue/use-resolved-client.ts";
import { type ComposerBinding, createComposer } from "../composer.ts";

export function useComposer(source: MaybeRefOrGetter<ComposerBinding & { client?: KitClient }>) {
	const client = useResolvedClient(toValue(source).client);
	const controller = createComposer(client);
	useLifecycle(controller);
	const binding = computed(() => toValue(source));
	watch(
		[() => binding.value.agentSlug, () => binding.value.sessionId],
		([slug, id]) => controller.setTarget(slug, id),
		{ immediate: true, flush: "sync" },
	);
	return {
		snapshot: useSnapshot(controller),
		send: (text: string, skills?: string[]) => {
			const current = binding.value;
			return controller.send(
				text,
				{
					...current,
					// 建会话可能同步提交路由；发送回调始终读最新绑定。
					send: (...args) => binding.value.send(...args),
					onSessionCreated: (id) => binding.value.onSessionCreated?.(id),
					onAccepted: (ids) => binding.value.onAccepted?.(ids),
				},
				skills,
			);
		},
	};
}
