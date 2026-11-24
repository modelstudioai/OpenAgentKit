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

/** 与侧栏运行态轮询同量级，避免给 Provider Files API 造成额外压力。 */
export const ARTIFACT_POLL_INTERVAL_MS = 4000;

/**
 * 回合执行期间的产物补取器。沙箱产出的文件只登记在 Provider Files 的 session 目录、
 * 不进入 SSE 事件流，所以只在「切会话 / 回合结束」取数会让用户等整轮跑完才在面板看到新文件；
 * 执行中按间隔补取才能接近实时。放在框架无关的共享模块里，React 与 Vue 由同一份镜像驱动。
 */
export function createArtifactPoller(refresh: () => void, intervalMs = ARTIFACT_POLL_INTERVAL_MS) {
	let timer: ReturnType<typeof setInterval> | undefined;
	return {
		/** 进入执行态时启动；重复启动不叠加定时器。 */
		start() {
			if (timer) return;
			timer = setInterval(refresh, intervalMs);
		},
		stop() {
			if (!timer) return;
			clearInterval(timer);
			timer = undefined;
		},
		get running() {
			return timer !== undefined;
		},
	};
}
