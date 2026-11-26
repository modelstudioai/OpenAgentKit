import type { SessionEvent, SseFrame } from "@openagentkit/sdk/protocol";
import { describe, expect, it, vi } from "vitest";
import { createMockGateway } from "../src/gateway/mock.ts";
import { SessionHistoryService } from "../src/service/shared/session/session-history.ts";
import { SessionRuntimeService } from "../src/service/shared/session/session-runtime.ts";
import { SessionStreams, type SessionStreamsOptions } from "../src/service/shared/session/session-streams.ts";
import { createEventBufferRegistry, type EventBufferRegistry } from "../src/utils/event-buffer.ts";

const runtime = new SessionRuntimeService();

function createStreams(
	gateway: ReturnType<typeof createMockGateway>,
	buffers: EventBufferRegistry,
	pingIntervalMs: number,
	options?: SessionStreamsOptions,
) {
	return new SessionStreams(gateway, new SessionHistoryService(gateway), buffers, runtime, pingIntervalMs, options);
}

const event = (id: string, text: string, completed = false): SessionEvent => ({
	event_id: id,
	type: "message",
	role: "assistant",
	content: [{ type: "text", text }],
	metadata: { event_status: completed ? "completed" : "in_progress" },
});
function latch() {
	let release!: () => void;
	const promise = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { promise, release };
}
async function untilReady(iterator: AsyncGenerator<SseFrame>) {
	const frames: SseFrame[] = [];
	for (;;) {
		const frame = await iterator.next();
		if (frame.done) throw new Error("stream ended before ready");
		frames.push(frame.value);
		if (frame.value.type === "ready") return frames;
	}
}

describe("持久 Session 订阅", () => {
	it("连接就绪边界收到的实时事件在 ready 后交付", async () => {
		const gateway = createMockGateway();
		const session = await gateway.createSession({ agentId: "a" });
		gateway.streamEvents = async function* (_id, options) {
			yield event("early", "刚到达");
			options?.onReady?.();
			await new Promise<void>((resolve) => options?.signal?.addEventListener("abort", () => resolve(), { once: true }));
		};
		const streams = createStreams(gateway, createEventBufferRegistry(), 1000);
		const iterator = streams.frames(session.session_id, {});
		expect((await iterator.next()).value).toMatchObject({
			type: "ready",
			data: { cursor: expect.stringMatching(/:0$/) },
		});
		expect((await iterator.next()).value).toMatchObject({ type: "event", data: { event_id: "early" } });
		await iterator.return(undefined);
	});

	it("首条业务事件前即可 ready；多个客户端共用连接，最后退出才取消", async () => {
		const gateway = createMockGateway();
		const session = await gateway.createSession({ agentId: "a" });
		const connected = latch();
		const closed = vi.fn();
		const original = gateway.streamEvents.bind(gateway);
		gateway.streamEvents = vi.fn(async function* (id, options) {
			await connected.promise;
			try {
				yield* original(id, options);
			} finally {
				closed();
			}
		});
		const buffers = createEventBufferRegistry();
		const streams = createStreams(gateway, buffers, 1000);
		const a = streams.frames(session.session_id, {});
		const b = streams.frames(session.session_id, {});
		const first = untilReady(a);
		const second = untilReady(b);
		const sent = vi.fn(async () => true);
		const sending = streams.use(session.session_id, sent);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(sent).not.toHaveBeenCalled();
		connected.release();
		await Promise.all([first, second, sending]);
		expect(sent).toHaveBeenCalledOnce();
		expect(gateway.streamEvents).toHaveBeenCalledOnce();
		await a.return(undefined);
		expect(closed).not.toHaveBeenCalled();
		await b.return(undefined);
		await vi.waitFor(() => expect(closed).toHaveBeenCalledOnce());
		expect(buffers.size()).toBe(0);
	});

	it("发送核验分页阻塞时 ready 和实时事件照常到达，历史补读不推进实时游标", async () => {
		const gateway = createMockGateway();
		const session = await gateway.createSession({ agentId: "a" });
		const historyGate = latch();
		const emit = latch();
		gateway.listEvents = vi.fn(async (_id, options) => {
			if (!options?.pageToken) {
				await historyGate.promise;
				return { events: [event("same", "你好", true)], next_page_token: "opaque-token" };
			}
			return { events: [event("second", "第二页", true)], next_page_token: null };
		});
		gateway.streamEvents = async function* (_id, options) {
			options?.onReady?.();
			await emit.promise;
			yield event("same", "你");
			await new Promise<void>((resolve) => options?.signal?.addEventListener("abort", () => resolve(), { once: true }));
		};
		const buffers = createEventBufferRegistry();
		const streams = createStreams(gateway, buffers, 1000);
		const iterator = streams.frames(session.session_id, {});
		expect((await untilReady(iterator)).map(({ type }) => type)).toEqual(["ready"]);
		expect(gateway.listEvents).not.toHaveBeenCalled();
		const send = vi.fn(async () => buffers.get(session.session_id)?.events);
		const sending = streams.use(session.session_id, send);
		await vi.waitFor(() => expect(gateway.listEvents).toHaveBeenCalledOnce());
		emit.release();
		const live = (await iterator.next()).value;
		expect(live).toMatchObject({ type: "event", data: { content: [{ type: "text", text: "你" }] } });
		expect(send).not.toHaveBeenCalled();
		historyGate.release();
		await expect(sending).resolves.toEqual([event("same", "你好", true), event("second", "第二页", true)]);
		expect(gateway.listEvents).toHaveBeenLastCalledWith(
			session.session_id,
			expect.objectContaining({ pageToken: "opaque-token" }),
		);
		if (live?.type !== "event") throw new Error("缺少实时事件");
		const observer = streams.frames(session.session_id, { after: live.cursor });
		expect(await untilReady(observer)).toMatchObject([{ type: "ready", data: { cursor: live.cursor, replayed: 0 } }]);
		await observer.return(undefined);
		await iterator.return(undefined);
	});

	it("内部历史先读到的事件仍可实时交付和续传，相同实时快照只投递一次", async () => {
		const gateway = createMockGateway();
		const { session_id: id } = await gateway.createSession({ agentId: "a" });
		const emit = latch();
		const delayed = event("delayed", "已持久化但未推送", true);
		const following = event("following", "后续消息", true);
		vi.spyOn(gateway, "listEvents")
			.mockResolvedValueOnce({ events: [], next_page_token: null })
			.mockResolvedValue({ events: [delayed], next_page_token: null });
		gateway.streamEvents = async function* (_id, options) {
			options?.onReady?.();
			await emit.promise;
			yield delayed;
			yield delayed;
			yield following;
			if (!options?.signal?.aborted)
				await new Promise<void>((resolve) =>
					options?.signal?.addEventListener("abort", () => resolve(), { once: true }),
				);
		};
		const streams = createStreams(gateway, createEventBufferRegistry(), 1000);
		const iterator = streams.frames(id, {});
		try {
			const ready = (await untilReady(iterator)).at(-1);
			if (ready?.type !== "ready" || !ready.data.cursor) throw new Error("缺少就绪游标");
			expect((await gateway.listEvents(id)).events).toEqual([]);
			await streams.use(id, async () => undefined);
			emit.release();
			const first = (await iterator.next()).value;
			const second = (await iterator.next()).value;
			expect(first).toMatchObject({ type: "event", data: delayed });
			expect(second).toMatchObject({ type: "event", data: following });
			const resumed = streams.frames(id, { after: ready.data.cursor });
			try {
				expect(await untilReady(resumed)).toMatchObject([first, second, { type: "ready", data: { replayed: 2 } }]);
			} finally {
				await resumed.return(undefined);
			}
		} finally {
			emit.release();
			await iterator.return(undefined);
		}
	});

	it("运行中最后订阅者离开后继续跟踪，终态回写并释放上游", async () => {
		const gateway = createMockGateway();
		const session = await gateway.createSession({ agentId: "a" });
		const status = (id: string, value: string): SessionEvent => ({
			event_id: id,
			type: "session_status",
			metadata: { status: value },
		});
		gateway.listEvents = async () => ({ events: [status("s0", "running")], next_page_token: null });
		const terminal = latch();
		const closed = vi.fn();
		gateway.streamEvents = async function* (_id, options) {
			try {
				options?.onReady?.();
				yield status("s1", "running");
				await terminal.promise;
				yield status("s2", "idle");
			} finally {
				closed();
			}
		};
		const buffers = createEventBufferRegistry();
		const statuses: string[] = [];
		const streams = createStreams(gateway, buffers, 1000, {
			onStatus: (_sessionId, value) => statuses.push(value),
		});
		const iterator = streams.frames(session.session_id, {});
		await untilReady(iterator);
		await iterator.return(undefined);
		expect(closed).not.toHaveBeenCalled();
		expect(streams.isTracking(session.session_id)).toBe(true);
		terminal.release();
		await vi.waitFor(() => expect(statuses.at(-1)).toBe("idle"));
		await vi.waitFor(() => expect(closed).toHaveBeenCalledOnce());
		expect(streams.isTracking(session.session_id)).toBe(false);
		expect(buffers.size()).toBe(0);
	});

	it("pending turn 重放相同旧 idle 不提前释放，真实终态到达后才释放", async () => {
		const gateway = createMockGateway();
		const session = await gateway.createSession({ agentId: "a" });
		const status = (id: string, value: string): SessionEvent => ({
			event_id: id,
			type: "session_status",
			metadata: { status: value, stop_reason: { type: "completed" } },
		});
		gateway.listEvents = async () => ({ events: [status("shared", "idle")], next_page_token: null });
		const stale = latch();
		const running = latch();
		const finished = latch();
		gateway.streamEvents = async function* (_id, options) {
			options?.onReady?.();
			await stale.promise;
			yield status("shared", "idle");
			await running.promise;
			yield status("shared", "running");
			await finished.promise;
			yield status("shared", "idle");
		};
		const buffers = createEventBufferRegistry();
		const onStatus = vi.fn();
		const streams = createStreams(gateway, buffers, 1000, { onStatus });
		const iterator = streams.frames(session.session_id, {});
		await untilReady(iterator);
		await streams.use(session.session_id, async () => undefined);
		const buffer = buffers.ensure(session.session_id);
		streams.acceptTurn(session.session_id, {
			eventIds: ["cm-detached"],
			previousStatus: runtime.statusMarker(buffer.latestStatus, buffer),
			clientMessageId: "cm-detached",
			knownUserIds: new Set(),
			after: buffer.events.length,
			sequence: buffer.sequence + 1,
		});
		await iterator.return(undefined);
		stale.release();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(streams.isTracking(session.session_id)).toBe(true);
		running.release();
		finished.release();
		await vi.waitFor(() => expect(onStatus).toHaveBeenLastCalledWith(session.session_id, "idle"));
		expect(streams.isTracking(session.session_id)).toBe(false);
		expect(buffers.size()).toBe(0);
	});

	it("意外 EOF 是 error，不能伪造 done；初始化失败不执行 POST", async () => {
		const gateway = createMockGateway();
		const session = await gateway.createSession({ agentId: "a" });
		gateway.streamEvents = async function* (_id, options) {
			options?.onReady?.();
			yield event("a", "partial");
		};
		const streams = createStreams(gateway, createEventBufferRegistry(), 10);
		const frames: SseFrame[] = [];
		for await (const frame of streams.frames(session.session_id, {})) frames.push(frame);
		expect(frames.some((frame) => frame.type === "error" && frame.data.retryable)).toBe(true);
		expect(frames.some((frame) => frame.type === "done")).toBe(false);
		const send = vi.fn(async () => true);
		await expect(streams.use(session.session_id, send)).rejects.toMatchObject({ code: "provider_error" });
		expect(send).not.toHaveBeenCalled();
	});

	it("同 ID 状态与历史冲突时拒绝发送，独立实时订阅仍就绪", async () => {
		const gateway = createMockGateway();
		const session = await gateway.createSession({ agentId: "a" });
		const read = latch();
		const status = (value: string): SessionEvent => ({
			event_id: "status",
			type: "session_status",
			metadata: { event_status: "completed", status: value },
		});
		gateway.listEvents = async () => {
			await read.promise;
			return { events: [status("running")], next_page_token: null };
		};
		gateway.streamEvents = async function* (_id, options) {
			options?.onReady?.();
			yield status("idle");
			read.release();
			await new Promise<void>((resolve) => options?.signal?.addEventListener("abort", () => resolve(), { once: true }));
		};
		const streams = createStreams(gateway, createEventBufferRegistry(), 1000);
		const iterator = streams.frames(session.session_id, {});
		const first = iterator.next();
		const send = vi.fn(async () => true);
		const rejected = expect(streams.use(session.session_id, send)).rejects.toMatchObject({ code: "provider_error" });
		expect((await first).value).toMatchObject({ type: "ready" });
		await rejected;
		expect(send).not.toHaveBeenCalled();
		await iterator.return(undefined);
	});

	it("缓冲中的明确完成快照可推进未完成历史并允许发送", async () => {
		const gateway = createMockGateway();
		const session = await gateway.createSession({ agentId: "a" });
		const read = latch();
		gateway.listEvents = async () => {
			await read.promise;
			return { events: [event("answer", "局部")], next_page_token: null };
		};
		gateway.streamEvents = async function* (_id, options) {
			options?.onReady?.();
			yield event("answer", "局部扩展");
			yield event("answer", "完整正文", true);
			read.release();
			await new Promise<void>((resolve) => options?.signal?.addEventListener("abort", () => resolve(), { once: true }));
		};
		const buffers = createEventBufferRegistry();
		const streams = createStreams(gateway, buffers, 1000);
		const iterator = streams.frames(session.session_id, {});
		await untilReady(iterator);
		const send = vi.fn(async () => buffers.get(session.session_id)?.events);
		await expect(streams.use(session.session_id, send)).resolves.toEqual([event("answer", "完整正文", true)]);
		expect(send).toHaveBeenCalledOnce();
		await iterator.return(undefined);
	});

	it("停止订阅可取消首帧前的连接等待", async () => {
		const gateway = createMockGateway();
		const session = await gateway.createSession({ agentId: "a" });
		let wasAborted = false;
		gateway.streamEvents = async function* (_id, options) {
			await new Promise<void>((resolve) =>
				options?.signal?.addEventListener(
					"abort",
					() => {
						wasAborted = true;
						resolve();
					},
					{ once: true },
				),
			);
		};
		const streams = createStreams(gateway, createEventBufferRegistry(), 10);
		const controller = new AbortController();
		const next = streams.frames(session.session_id, { signal: controller.signal }).next();
		await new Promise((resolve) => setTimeout(resolve, 0));
		controller.abort();
		expect((await next).done).toBe(true);
		expect(wasAborted).toBe(true);
	});

	it("查询会话期间取消，迟到结果不会创建上游流", async () => {
		const gateway = createMockGateway();
		const session = await gateway.createSession({ agentId: "a" });
		const reading = latch();
		const finish = latch();
		const upstream = vi.spyOn(gateway, "streamEvents");
		gateway.getSession = async () => {
			reading.release();
			await finish.promise;
			return session;
		};
		const buffers = createEventBufferRegistry();
		const abort = new AbortController();
		const iterator = createStreams(gateway, buffers, 1000).frames(session.session_id, { signal: abort.signal });
		const first = iterator.next();
		await reading.promise;
		abort.abort();
		expect((await first).done).toBe(true);
		finish.release();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(upstream).not.toHaveBeenCalled();
		expect(buffers.size()).toBe(0);
	});

	it("重复分页游标拒绝回放，不能无界循环", async () => {
		const gateway = createMockGateway();
		gateway.listEvents = vi.fn(async () => ({ events: [], next_page_token: "same" }));
		await expect(new SessionHistoryService(gateway).readSessionHistory("s")).rejects.toMatchObject({
			code: "provider_error",
		});
		expect(gateway.listEvents).toHaveBeenCalledTimes(2);
	});
});

describe("恢复与资源边界", () => {
	it("实时会话终止事件回传后正常结束，idle Turn 则继续订阅", async () => {
		const gateway = createMockGateway();
		const session = await gateway.createSession({ agentId: "a" });
		const terminate = latch();
		gateway.streamEvents = async function* (_id, options) {
			options?.onReady?.();
			await terminate.promise;
			yield { event_id: "end", type: "session_status", metadata: { status: "terminated" } };
		};
		const streams = createStreams(gateway, createEventBufferRegistry(), 1000);
		const iterator = streams.frames(session.session_id, {});
		await untilReady(iterator);
		terminate.release();
		expect((await iterator.next()).value?.type).toBe("event");
		expect((await iterator.next()).value?.type).toBe("done");
		expect((await iterator.next()).done).toBe(true);
	});

	it.each([{ statusCode: 401 }, { statusCode: 403 }, { name: "UserError" }, { code: "BAILIAN_EVENT_PROTOCOL_ERROR" }])(
		"鉴权/参数/协议错误不要求客户端重试：%j",
		async (failure) => {
			const gateway = createMockGateway();
			const session = await gateway.createSession({ agentId: "a" });
			gateway.streamEvents = () => ({
				[Symbol.asyncIterator]() {
					return {
						next: async () => {
							throw Object.assign(new Error("secret-provider-body"), failure);
						},
					};
				},
			});
			const frames: SseFrame[] = [];
			for await (const frame of createStreams(gateway, createEventBufferRegistry(), 1000).frames(
				session.session_id,
				{},
			))
				frames.push(frame);
			expect(frames).toEqual([
				{
					type: "error",
					data: { code: "provider_error", message: "上游事件连接被拒绝或协议不兼容", retryable: false },
				},
			]);
		},
	);

	it("有效游标补发实时变更，过期游标只发 reset 和 ready", async () => {
		const gateway = createMockGateway();
		const session = await gateway.createSession({ agentId: "a" });
		const emit = latch();
		gateway.streamEvents = async function* (_id, options) {
			options?.onReady?.();
			await emit.promise;
			yield event("a", "你好", true);
			await new Promise<void>((resolve) => options?.signal?.addEventListener("abort", () => resolve(), { once: true }));
		};
		const buffers = createEventBufferRegistry();
		const streams = createStreams(gateway, buffers, 1000);
		const keeper = streams.frames(session.session_id, {});
		const ready = (await untilReady(keeper)).at(-1);
		if (ready?.type !== "ready" || !ready.data.cursor) throw new Error("缺少就绪游标");
		emit.release();
		const live = (await keeper.next()).value;
		const resumed = streams.frames(session.session_id, { after: ready.data.cursor });
		expect(await untilReady(resumed)).toMatchObject([live as SseFrame, { type: "ready", data: { replayed: 1 } }]);
		await resumed.return(undefined);
		const expired = streams.frames(session.session_id, { after: "expired:1" });
		expect((await untilReady(expired)).map(({ type }) => type)).toEqual(["reset", "ready"]);
		await expired.return(undefined);
		await keeper.return(undefined);
	});

	it("慢消费者队列超过 8MiB 后明确断开并要求重建", async () => {
		const gateway = createMockGateway();
		const session = await gateway.createSession({ agentId: "a" });
		const buffers = createEventBufferRegistry();
		const emit = latch();
		gateway.streamEvents = async function* (_id, options) {
			options?.onReady?.();
			await emit.promise;
			yield event("huge", "a".repeat(8 * 1024 * 1024));
			await new Promise<void>((resolve) => options?.signal?.addEventListener("abort", () => resolve(), { once: true }));
		};
		const iterator = createStreams(gateway, buffers, 1000).frames(session.session_id, {});
		await untilReady(iterator);
		emit.release();
		expect((await iterator.next()).value).toMatchObject({ type: "error", data: { retryable: true } });
		await iterator.return(undefined);
	});
});

describe("索引状态回调", () => {
	it("live 事件按归一词表回调：running 进、idle 收，失败回合回调 failed", async () => {
		const gateway = createMockGateway();
		const session = await gateway.createSession({ agentId: "a" });
		const onStatus = vi.fn();
		const streams = createStreams(gateway, createEventBufferRegistry(), 1000, { onStatus });
		const iterator = streams.frames(session.session_id, {});
		await untilReady(iterator);
		await gateway.sendMessage(session.session_id, { text: "你好" });
		await vi.waitFor(() => expect(onStatus).toHaveBeenLastCalledWith(session.session_id, "idle"));
		expect(onStatus).toHaveBeenNthCalledWith(1, session.session_id, "running");

		await gateway.sendMessage(session.session_id, { text: "这次请失败" });
		await vi.waitFor(() => expect(onStatus).toHaveBeenLastCalledWith(session.session_id, "failed"));
		await iterator.return(undefined);
	});

	// 远端会话不存在时 running 永远不会收敛：初始化失败即回正为 idle，否则侧栏会一直转圈。
	it("Provider 明确会话不存在时把滞留索引回正为 idle", async () => {
		const gateway = createMockGateway();
		const onStatus = vi.fn();
		const streams = createStreams(gateway, createEventBufferRegistry(), 1000, { onStatus });
		const frames: SseFrame[] = [];
		for await (const frame of streams.frames("missing-session", {})) frames.push(frame);
		expect(frames[0]).toMatchObject({ type: "error", data: { code: "not_found" } });
		expect(onStatus).toHaveBeenCalledWith("missing-session", "idle");
	});

	it("审批挂起回调 requires_action", async () => {
		const gateway = createMockGateway();
		const session = await gateway.createSession({ agentId: "a" });
		const onStatus = vi.fn();
		const streams = createStreams(gateway, createEventBufferRegistry(), 1000, { onStatus });
		const iterator = streams.frames(session.session_id, {});
		await untilReady(iterator);
		await gateway.sendMessage(session.session_id, { text: "需要审批的操作" });
		await vi.waitFor(() => expect(onStatus).toHaveBeenLastCalledWith(session.session_id, "requires_action"));
		await iterator.return(undefined);
	});

	it("水合回正索引：无人订阅期间收敛的回合以历史终态回调一次", async () => {
		const gateway = createMockGateway();
		const session = await gateway.createSession({ agentId: "a" });
		await gateway.sendMessage(session.session_id, { text: "你好" });
		await vi.waitFor(async () => {
			expect((await gateway.getSession(session.session_id))?.status).toBe("idle");
		});
		const onStatus = vi.fn();
		const streams = createStreams(gateway, createEventBufferRegistry(), 1000, { onStatus });
		const iterator = streams.frames(session.session_id, {});
		await untilReady(iterator);
		await streams.use(session.session_id, async () => undefined);
		await vi.waitFor(() => expect(onStatus).toHaveBeenCalledTimes(1));
		expect(onStatus).toHaveBeenCalledWith(session.session_id, "idle");
		await iterator.return(undefined);
	});

	it("移除态（terminated）不回调索引状态，删除与归档由显式 mutations 落库", async () => {
		const gateway = createMockGateway();
		const session = await gateway.createSession({ agentId: "a" });
		const terminate = latch();
		gateway.streamEvents = async function* (_id, options) {
			options?.onReady?.();
			await terminate.promise;
			yield { event_id: "end", type: "session_status", metadata: { status: "terminated" } };
		};
		const onStatus = vi.fn();
		const streams = createStreams(gateway, createEventBufferRegistry(), 1000, { onStatus });
		const iterator = streams.frames(session.session_id, {});
		await untilReady(iterator);
		terminate.release();
		expect((await iterator.next()).value?.type).toBe("event");
		expect((await iterator.next()).value?.type).toBe("done");
		expect(onStatus).not.toHaveBeenCalled();
	});
});
