import { type MaybeRefOrGetter, toValue } from "vue";
import { useLifecycle, useSnapshot } from "../../hooks-vue/shared.ts";
import type { ArtifactDescriptor } from "../../protocol/index.ts";
import type { KitClient } from "../../providers/kit/client.ts";
import { useResolvedClient } from "../../providers/kit/vue/use-resolved-client.ts";
import { type ArtifactHost, createArtifactActions } from "../artifacts.ts";

export function useArtifactActions(
	source: MaybeRefOrGetter<{
		client?: KitClient;
		host: ArtifactHost;
		sessionId?: string;
		artifacts?: ArtifactDescriptor[];
	}>,
) {
	const client = useResolvedClient(toValue(source).client);
	const controller = createArtifactActions(client, toValue(source).host);
	useLifecycle(controller);
	return {
		snapshot: useSnapshot(controller),
		open: (id: string, contentType?: string) =>
			controller.open(id, {
				sessionId: toValue(source).sessionId,
				artifacts: toValue(source).artifacts,
				contentType,
			}),
		download: (id: string) =>
			controller.download(id, { sessionId: toValue(source).sessionId, artifacts: toValue(source).artifacts }),
	};
}
