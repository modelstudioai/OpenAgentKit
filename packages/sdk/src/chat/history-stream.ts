import { AbortScope } from "../internal/abort-scope.ts";
import { KitError, reconcileSnapshotHistory, type SessionEvent } from "../protocol/index.ts";
import type { ChatProvider, StreamSessionOptions } from "../providers/contract.ts";

const MAX_BUFFERED_EVENTS = 1024;
const MAX_BUFFERED_BYTES = 8 * 1024 * 1024;

async function readHistory(listEvents: NonNullable<ChatProvider["listEvents"]>, sessionId: string, scope: AbortScope) {
	const events: SessionEvent[] = [];
	const seen = new Set<string>();
	let pageToken: string | undefined;
	do {
		scope.check();
		const page = await scope.wait(listEvents(sessionId, { limit: 100, pageToken, signal: scope.signal }));
		if (!Array.isArray(page?.data) || page.data.some((event) => typeof event?.type !== "string"))
			throw new KitError("provider_error", "后端会话历史格式无效");
		events.push(...page.data);
		const next = page.next_page_token;
		if (next != null && (typeof next !== "string" || !next || seen.has(next)))
			throw new KitError("provider_error", "会话历史分页游标无效或重复");
		if (next != null) seen.add(next);
		pageToken = next ?? undefined;
	} while (pageToken);
	return events;
}

/** 先订阅以覆盖分页期间的实时更新，成功后一次性提交下一份事件集合。 */
export async function streamWithSessionHistory(
	client: ChatProvider,
	sessionId: string,
	handlers: StreamSessionOptions,
): Promise<void> {
	if (!client.listEvents) return client.stream(sessionId, handlers);
	const listEvents = client.listEvents.bind(client);
	const scope = new AbortScope(handlers.signal);
	let rebuild = !handlers.after;
	let ready = false;
	let loading: Promise<void> | undefined;
	let done: Parameters<NonNullable<StreamSessionOptions["onDone"]>>[0] | undefined;
	const pending: { event: SessionEvent; cursor?: string }[] = [];
	let bytes = 0;
	const encoder = new TextEncoder();
	async function rebuildHistory(info: Parameters<NonNullable<StreamSessionOptions["onReady"]>>[0]) {
		const deadline = setTimeout(
			() => scope.fail(new KitError("provider_error", "读取会话历史超时", { retryable: true })),
			30_000,
		);
		try {
			const history = await readHistory(listEvents, sessionId, scope);
			scope.check();
			const updates = reconcileSnapshotHistory(history, pending);
			const cursor = pending.at(-1)?.cursor ?? info.cursor;
			pending.length = 0;
			rebuild = false;
			handlers.onReset?.();
			for (const update of updates) handlers.onEvent?.(update.event, update.cursor);
			handlers.onReady?.({ ...info, cursor, replayed: updates.length });
		} finally {
			clearTimeout(deadline);
		}
	}

	try {
		await scope.wait(
			client.stream(sessionId, {
				...handlers,
				signal: scope.signal,
				onReset() {
					scope.check();
					if (ready) throw new KitError("provider_error", "后端会话在订阅就绪后重置");
					rebuild = true;
				},
				onEvent(event, cursor) {
					scope.check();
					if (!rebuild) return handlers.onEvent?.(event, cursor);
					bytes += encoder.encode(JSON.stringify(event)).byteLength;
					if (pending.length >= MAX_BUFFERED_EVENTS || bytes > MAX_BUFFERED_BYTES)
						throw new KitError("provider_error", "读取历史期间实时事件缓冲超限", { retryable: true });
					pending.push({ event, cursor });
				},
				onReady(info) {
					scope.check();
					if (ready || info.sessionId !== sessionId) throw new KitError("provider_error", "后端会话订阅的就绪信号无效");
					ready = true;
					if (rebuild) loading = rebuildHistory(info).catch((error: unknown) => scope.fail(error));
					else handlers.onReady?.(info);
				},
				onDone(info) {
					done = info;
				},
			}),
		);
		if (loading) await scope.wait(loading);
		scope.check();
		if (done) handlers.onDone?.(done);
	} finally {
		scope.dispose();
	}
}
