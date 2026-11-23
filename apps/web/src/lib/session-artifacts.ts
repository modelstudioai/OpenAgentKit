import type { ArtifactDescriptor } from "@openagentkit/sdk/protocol";
import type { KitClient } from "@openagentkit/sdk/providers/kit";

/** 会话产物来自 Provider Files API 的 session scope；SSE 事件里的 artifact 仍由 Chat 投影提供。 */
export async function loadSessionArtifacts(
	client: KitClient,
	sessionId: string,
	signal?: AbortSignal,
): Promise<ArtifactDescriptor[]> {
	const response = await client.transport.request<{ data: ArtifactDescriptor[] }>(
		`/api/kit/sessions/${encodeURIComponent(sessionId)}/artifacts`,
		{ signal },
	);
	return response.data;
}

/** 事件产物优先保留更完整的元数据；Files API 补齐历史会话中未随事件回放的产物。 */
export function mergeArtifacts(...groups: ArtifactDescriptor[][]): ArtifactDescriptor[] {
	const merged = new Map<string, ArtifactDescriptor>();
	for (const group of groups)
		for (const artifact of group) merged.set(artifact.file_id, { ...merged.get(artifact.file_id), ...artifact });
	return [...merged.values()];
}
