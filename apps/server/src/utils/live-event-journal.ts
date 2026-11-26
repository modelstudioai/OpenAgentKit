import { randomUUID } from "node:crypto";
import { mergeEventSnapshots, type SessionEvent } from "@openagentkit/sdk/protocol";
import type { EventChange } from "./event-buffer.ts";

/** 每代上游连接只记录实际实时变更。内部历史补读不推进 SSE 游标。 */
export function createLiveEventJournal() {
	const epoch = randomUUID();
	const changes: EventChange[] = [];
	const latest = new Map<string, EventChange>();
	const listeners = new Set<(change?: EventChange) => void>();
	let sequence = 0;
	const cursor = () => `${epoch}:${sequence}`;
	return {
		cursor,
		lastEventId: () => changes.at(-1)?.event.event_id ?? null,
		append(incoming: SessionEvent) {
			const id = incoming.event_id;
			const previous = id ? latest.get(id)?.event : undefined;
			const event = mergeEventSnapshots(previous, incoming);
			if (event === previous) return;
			sequence += 1;
			const change = { event, cursor: cursor() };
			changes.push(change);
			if (id) latest.set(id, change);
			if (changes.length > 1024) {
				const evicted = changes.shift();
				const evictedId = evicted?.event.event_id;
				if (evictedId && latest.get(evictedId) === evicted) latest.delete(evictedId);
			}
			for (const listener of listeners) listener(change);
		},
		readAfter(after?: string): EventChange[] | undefined {
			if (after === undefined) return [];
			if (!after.startsWith(`${epoch}:`)) return;
			const value = after.slice(epoch.length + 1);
			const position = Number(value);
			const first = sequence - changes.length;
			if (!/^\d+$/.test(value) || !Number.isSafeInteger(position) || position < first || position > sequence) return;
			return changes.slice(position - first);
		},
		subscribe(listener: (change?: EventChange) => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		notify() {
			for (const listener of listeners) listener();
		},
	};
}

export type LiveEventJournal = ReturnType<typeof createLiveEventJournal>;
