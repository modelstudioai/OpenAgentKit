import { KitError } from "./errors.ts";
import type { SessionEvent } from "./events.ts";

/** 合并 SDK 的累计快照，不再把正文作为 delta 追加。缺失字段保留，显式空值替换。 */
export function mergeEventSnapshots(previous: SessionEvent | undefined, incoming: SessionEvent): SessionEvent {
	if (!previous) return incoming;
	if (previous.metadata?.event_status === "completed" && incoming.metadata?.event_status === "in_progress")
		return previous;
	const defined = Object.fromEntries(Object.entries(incoming).filter(([, value]) => value !== undefined));
	const merged = {
		...previous,
		...defined,
		...(incoming.metadata ? { metadata: { ...previous.metadata, ...incoming.metadata } } : {}),
	} as SessionEvent;
	return JSON.stringify(merged) === JSON.stringify(previous) ? previous : merged;
}

/** JSON 对象的字段顺序不代表快照版本。数组顺序仍有业务含义。 */
export function snapshotFingerprint(event: SessionEvent): string {
	return JSON.stringify(event, (_key, value: unknown) => {
		if (value && typeof value === "object" && !Array.isArray(value))
			return Object.fromEntries(
				Object.entries(value).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
			);
		return value;
	});
}

export function snapshotConflict(): KitError {
	return new KitError("provider_error", "历史与实时快照的更新顺序无法确认，请重新连接后刷新");
}

export function sameSnapshot(previous: SessionEvent, incoming: SessionEvent): boolean {
	return snapshotFingerprint(previous) === snapshotFingerprint(mergeEventSnapshots(previous, incoming));
}

/** 独立 HTTP/SSE 读取没有共同版本号，只有明确的生命周期推进可覆盖历史快照。 */
export function reconcileUnorderedSnapshot(previous: SessionEvent, incoming: SessionEvent): SessionEvent {
	const merged = mergeEventSnapshots(previous, incoming);
	if (previous === merged || snapshotFingerprint(previous) === snapshotFingerprint(merged)) return previous;
	if (previous.metadata?.event_status === "in_progress" && incoming.metadata?.event_status === "completed")
		return merged;
	throw snapshotConflict();
}

interface SnapshotUpdate {
	event: SessionEvent;
	cursor?: string;
}

/** 先验证完整恢复视图，历史快照没有实时传输游标。 */
export function reconcileSnapshotHistory(history: SessionEvent[], buffered: SnapshotUpdate[]): SnapshotUpdate[] {
	const updates: SnapshotUpdate[] = history.map((event) => ({ event }));
	const latest = new Map(history.filter((event) => event.event_id).map((event) => [event.event_id, event]));
	const historicalIds = new Set(latest.keys());
	const bufferedLatest = new Map<string, { event: SessionEvent; position: number }>();
	for (const [position, { event }] of buffered.entries()) {
		if (event.event_id && historicalIds.has(event.event_id))
			bufferedLatest.set(event.event_id, {
				event: mergeEventSnapshots(bufferedLatest.get(event.event_id)?.event, event),
				position,
			});
	}
	for (const [position, update] of buffered.entries()) {
		const { event } = update;
		if (!event.event_id) {
			updates.push(update);
			continue;
		}
		const previous = latest.get(event.event_id);
		const last = bufferedLatest.get(event.event_id);
		// 同一实时流的 completed 可以解决较早 partial 与历史重叠的歧义。
		if (last && last.position !== position) continue;
		const next =
			previous && last ? reconcileUnorderedSnapshot(previous, last.event) : mergeEventSnapshots(previous, event);
		if (next === previous) continue;
		updates.push({ ...update, event: next });
		latest.set(event.event_id, next);
	}
	return updates;
}
