import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { useLifecycle, useSnapshot } from "../../hooks-vue/shared.ts";
import type { KitClient } from "../../providers/kit/client.ts";
import { useResolvedClient } from "../../providers/kit/vue/use-resolved-client.ts";
import { type AttachmentsOptions, createAttachments } from "../attachments.ts";

export function useAttachments(source: MaybeRefOrGetter<AttachmentsOptions & { client?: KitClient }> = {}) {
	const client = useResolvedClient(toValue(source).client);
	const controller = createAttachments(client, {
		pollIntervalMs: toValue(source).pollIntervalMs,
		scanTimeoutMs: toValue(source).scanTimeoutMs,
	});
	useLifecycle(controller);
	const snapshot = useSnapshot(controller);
	return {
		snapshot,
		uploading: computed(() => snapshot.value.pending.length > 0),
		processing: computed(() => snapshot.value.files.some((file) => !file.available)),
		upload: controller.upload,
		remove: controller.remove,
		clear: controller.clear,
		consume: controller.consume,
	};
}
