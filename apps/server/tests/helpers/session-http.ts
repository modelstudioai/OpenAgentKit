import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import {
	createSseParser,
	PROTOCOL_VERSION,
	PROTOCOL_VERSION_HEADER,
	type RawSseMessage,
	type SessionEvent,
} from "@openagentkit/sdk/protocol";
import type { KitServices } from "../../src/app-env.ts";

const deadlineMs = 15_000;

type Frame = RawSseMessage;
type EventFrame = Frame & { id: string };

function isEvent(frame: Frame): frame is EventFrame {
	return frame.event === "event" && typeof frame.id === "string";
}

function eventId(frame: Frame) {
	return isEvent(frame) ? (JSON.parse(frame.data) as SessionEvent).event_id : undefined;
}

function idle(frame: Frame) {
	if (!isEvent(frame)) return false;
	const event: SessionEvent = JSON.parse(frame.data);
	return event.type === "session_status" && event.metadata?.status === "idle";
}

export async function connectSessionStream(path: URL, bearer: string) {
	const abort = new AbortController();
	try {
		const response = await fetch(path, {
			headers: { authorization: `Bearer ${bearer}`, [PROTOCOL_VERSION_HEADER]: PROTOCOL_VERSION },
			signal: AbortSignal.any([abort.signal, AbortSignal.timeout(deadlineMs)]),
		});
		assert.equal(response.status, 200, "SSE HTTP 状态");
		assert.match(response.headers.get("content-type") ?? "", /^text\/event-stream\b/);
		assert.ok(response.body, "SSE 响应体缺失");
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		const queue: Frame[] = [];
		const parser = createSseParser((message) => queue.push(message));

		async function next(): Promise<Frame | undefined> {
			while (!queue.length) {
				const chunk = await reader.read();
				if (chunk.done) return undefined;
				parser.push(decoder.decode(chunk.value, { stream: true }));
			}
			return queue.shift();
		}

		async function until(predicate: (frame: Frame) => boolean): Promise<Frame[]> {
			const frames: Frame[] = [];
			for (;;) {
				const frame = await next();
				if (!frame) throw new Error("SSE 在预期帧到达前关闭");
				if (frame.event === "ping") continue;
				frames.push(frame);
				if (predicate(frame)) return frames;
			}
		}

		let closed = false;
		return {
			next,
			until,
			async close() {
				if (closed) return;
				closed = true;
				abort.abort();
				await reader.cancel().catch(() => undefined);
				reader.releaseLock();
			},
		};
	} catch (error) {
		abort.abort();
		throw error;
	}
}

async function waitForStreams(services: KitServices, count: number) {
	const end = Date.now() + 3000;
	const active = () => services.metrics.snapshot().kit_sse_streams_active ?? 0;
	while (active() !== count && Date.now() < end) await delay(20);
	assert.equal(active(), count, "已打开的 HTTP SSE 数量");
}

async function verifyHistory(url: URL, bearer: string, events: readonly (string | undefined)[]) {
	url.searchParams.set("limit", "1");
	const ids = new Set<string>();
	const pages = new Set<string>();
	for (;;) {
		const response = await fetch(url, {
			headers: { authorization: `Bearer ${bearer}` },
			signal: AbortSignal.timeout(deadlineMs),
		});
		assert.equal(response.status, 200);
		const page = (await response.json()) as { data: SessionEvent[]; next_page_token: string | null };
		assert.equal(page.data.length, 1, "历史请求的 limit=1 应生效");
		for (const event of page.data) {
			assert.ok(event.event_id && !ids.has(event.event_id), "历史分页不应重复事件");
			ids.add(event.event_id);
		}
		if (page.next_page_token === null) break;
		assert.ok(!pages.has(page.next_page_token), "历史分页游标重复");
		pages.add(page.next_page_token);
		url.searchParams.set("page_token", page.next_page_token);
	}
	assert.ok(pages.size >= 1, "历史恢复应实际跨页");
	for (const id of events) assert.ok(id && ids.has(id), "分页历史漏掉已发送消息");
}

export async function verifySse(
	services: KitServices,
	origin: string,
	sessionId: string,
	primaryToken: string,
	witnessToken: string,
) {
	const path = new URL(`/api/kit/sessions/${sessionId}/stream`, origin);
	const streams: Awaited<ReturnType<typeof connectSessionStream>>[] = [];
	const open = async (token: string, after?: string) => {
		const url = new URL(path);
		if (after) url.searchParams.set("after", after);
		const stream = await connectSessionStream(url, token);
		streams.push(stream);
		return stream;
	};

	const rejected = await fetch(path, {
		headers: { authorization: `Bearer ${primaryToken}` },
		signal: AbortSignal.timeout(deadlineMs),
	});
	assert.equal(rejected.status, 409, "缺少 Kit 协议头时应拒绝 SSE");
	await rejected.body?.cancel();

	try {
		const primary = await open(primaryToken);
		const witness = await open(witnessToken);
		assert.equal((await primary.next())?.event, "ready");
		assert.equal((await witness.next())?.event, "ready");

		const first = await services.sessions.send(sessionId, { text: "续传前的 Mock 消息" });
		const start = (await primary.until((frame) => eventId(frame) === first.event_ids[0])).at(-1);
		assert.ok(start && isEvent(start), "首条业务事件缺少传输游标");
		assert.notEqual(start.id, first.event_ids[0], "传输游标应独立于业务 event_id");
		await witness.until((frame) => frame.id === start.id);
		await primary.close();
		await waitForStreams(services, 1);

		const firstGap = await witness.until(idle);
		const second = await services.sessions.send(sessionId, { text: "断开期间的 Mock 消息" });
		const secondGap = await witness.until(idle);
		const missed = [...firstGap, ...secondGap].filter(isEvent);
		assert.ok(
			missed.some((frame) => eventId(frame) === second.event_ids[0]),
			"断开期间必须有业务事件",
		);

		const resumed = await open(primaryToken, start.id);
		const replay = await resumed.until((frame) => frame.event === "ready");
		const ready = replay.pop()!;
		assert.deepEqual(replay, missed, "续传只补发实际遗漏的帧并保留原游标");
		assert.equal(ready.id, undefined, "ready 帧应省略 SSE id");
		assert.deepEqual(JSON.parse(ready.data), {
			session_id: sessionId,
			after: start.id,
			replayed: missed.length,
			cursor: missed.at(-1)?.id,
		});

		const stale = await open(witnessToken, "expired-poc-epoch:1");
		assert.equal((await stale.next())?.event, "reset");
		assert.equal((await stale.next())?.event, "ready");
		await verifyHistory(new URL(`/api/kit/sessions/${sessionId}/events`, origin), witnessToken, [
			first.event_ids[0],
			second.event_ids[0],
		]);
		await stale.close();
		await waitForStreams(services, 2);

		await services.memberAuth.logout(primaryToken);
		const failure = await resumed.next();
		assert.equal(failure?.event, "error");
		assert.ok(failure);
		assert.equal(JSON.parse(failure.data).code, "unauthorized");
		assert.equal(JSON.parse(failure.data).retryable, false);
		assert.equal(await resumed.next(), undefined);
		await waitForStreams(services, 1);
		const third = await services.sessions.send(sessionId, { text: "未撤销连接继续收到消息" });
		await witness.until((frame) => eventId(frame) === third.event_ids[0]);
		await witness.until(idle);
	} finally {
		await Promise.all(streams.map((stream) => stream.close()));
		await waitForStreams(services, 0);
	}
}
