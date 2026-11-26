import {
	isSessionRemovedStatus,
	KitError,
	reconcileSnapshotHistory,
	type SessionEvent,
	type SseFrame,
	sessionStatusOf,
	threadIdOf,
} from "@openagentkit/sdk/protocol";
import { sessionEventError } from "../../../gateway/session-event-error.ts";
import type { GatewaySessionInfo, ProviderGateway } from "../../../gateway/types.ts";
import type { EventBufferRegistry, EventChange } from "../../../utils/event-buffer.ts";
import { createLiveEventJournal } from "../../../utils/live-event-journal.ts";
import type { SessionHistoryService } from "./session-history.ts";
import type { AcceptedTurn, SessionRuntimeService } from "./session-runtime.ts";

const MAX_QUEUE_FRAMES = 1024;
const MAX_QUEUE_BYTES = 8 * 1024 * 1024;
const DETACHED_TIMEOUT_MS = 30 * 60_000;
const eventSize = (event: SessionEvent) => new TextEncoder().encode(JSON.stringify(event)).byteLength;

function deferred() {
	let resolve!: () => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<void>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	void promise.catch(() => {});
	return { promise, resolve, reject };
}

function streamError(error: unknown): KitError {
	return sessionEventError(error, {
		transient: "上游事件连接中断，请重新连接",
		permanent: "上游事件连接被拒绝或协议不兼容",
	});
}

function statusOfInfo(info: GatewaySessionInfo): string | undefined {
	if (info.status === "running" || info.status === "rescheduling") return "running";
	if (info.status === "idle") return info.stop_reason?.type === "requires_action" ? "requires_action" : "idle";
	return info.status === "failed" ? "failed" : undefined;
}

function* replayFrames(
	sessionId: string,
	cursor: string,
	replay: EventChange[] | undefined,
	after?: string,
): Generator<SseFrame> {
	if (!replay) yield { type: "reset", data: { session_id: sessionId } };
	for (const change of replay ?? []) yield { type: "event", data: change.event, cursor: change.cursor };
	yield {
		type: "ready",
		data: { session_id: sessionId, after: after ?? null, replayed: replay?.length ?? 0, cursor },
	};
}

/** 同一会话的订阅者和执行中的写操作共用上游连接、实时游标和历史水合状态。 */
class SessionPump {
	readonly controller = new AbortController();
	readonly connected = deferred();
	readonly journal = createLiveEventJournal();
	references = 0;
	terminal = false;
	hydrated = false;
	hydration?: Promise<void>;
	error?: KitError;
	lastStatus?: string;
	detachTimer?: ReturnType<typeof setTimeout>;

	constructor(readonly sessionId: string) {
		this.controller.signal.addEventListener(
			"abort",
			() => this.connected.reject(new DOMException("已取消", "AbortError")),
			{ once: true },
		);
	}

	async waitForConnection(signal?: AbortSignal) {
		if (!signal) return this.connected.promise;
		let cancel!: () => void;
		const cancelled = new Promise<void>((resolve) => {
			cancel = resolve;
		});
		signal.addEventListener("abort", cancel, { once: true });
		try {
			if (!signal.aborted) await Promise.race([this.connected.promise, cancelled]);
		} finally {
			signal.removeEventListener("abort", cancel);
		}
	}
}

/** 每个 SSE 订阅独占自己的有界队列和心跳定时器。 */
class SessionSubscription {
	private readonly queue: { change: EventChange; bytes: number }[] = [];
	private totalBytes = 0;
	private error?: KitError;
	private wake?: () => void;
	private readonly poke = () => this.wake?.();
	private readonly unsubscribe: () => void;
	private readonly timer: ReturnType<typeof setInterval>;

	constructor(
		private readonly pump: SessionPump,
		private readonly interval: number,
		private readonly signal?: AbortSignal,
	) {
		this.unsubscribe = pump.journal.subscribe((change) => this.enqueue(change));
		this.timer = setInterval(this.poke, interval);
		signal?.addEventListener("abort", this.poke, { once: true });
	}

	private enqueue(change?: EventChange) {
		if (change && !this.error) {
			const bytes = eventSize(change.event);
			if (this.queue.length >= MAX_QUEUE_FRAMES || this.totalBytes + bytes > MAX_QUEUE_BYTES) {
				this.error = new KitError("provider_error", "客户端读取事件过慢，请重新连接", { retryable: true });
			} else {
				this.totalBytes += bytes;
				this.queue.push({ change, bytes });
			}
		}
		this.poke();
	}

	async *liveFrames(): AsyncGenerator<SseFrame> {
		const { pump } = this;
		let lastActivity = Date.now();
		while (!this.signal?.aborted) {
			if (this.error) throw this.error;
			const entry = this.queue.shift();
			if (entry) {
				this.totalBytes -= entry.bytes;
				lastActivity = Date.now();
				yield { type: "event", data: entry.change.event, cursor: entry.change.cursor };
				continue;
			}
			if (pump.error) throw pump.error;
			if (pump.terminal) {
				yield {
					type: "done",
					data: {
						session_id: pump.sessionId,
						status: "terminated",
						last_event_id: pump.journal.lastEventId(),
						reason: "session_terminal",
						cursor: pump.journal.cursor(),
					},
				};
				return;
			}
			if (Date.now() - lastActivity >= this.interval) {
				lastActivity = Date.now();
				yield { type: "ping", data: { t: lastActivity } };
				continue;
			}
			await new Promise<void>((resolve) => {
				this.wake = resolve;
			});
		}
	}

	close() {
		clearInterval(this.timer);
		this.unsubscribe();
		this.signal?.removeEventListener("abort", this.poke);
	}
}

export interface SessionStreamsOptions {
	/** 非线程 session_status 归一后的回调（running/requires_action/failed/idle）：live 事件逐条触发，水合后按历史终态触发一次。 */
	onStatus?: (sessionId: string, status: string) => void;
}

/** 一个 Session 一条持久上游连接；消费者退出时释放，断流不伪造业务完成。 */
export class SessionStreams {
	private readonly pumps = new Map<string, SessionPump>();
	private readonly turns = new Map<string, AcceptedTurn>();

	constructor(
		private readonly gateway: ProviderGateway,
		private readonly history: SessionHistoryService,
		private readonly buffers: EventBufferRegistry,
		private readonly runtime: SessionRuntimeService,
		private readonly pingIntervalMs: number,
		private readonly options: SessionStreamsOptions = {},
	) {}

	close() {
		for (const pump of this.pumps.values()) this.stop(pump);
		this.turns.clear();
	}

	/** 受理一笔新回合：pending turn 在 Provider 回显和终态证据到达前保持 running。 */
	acceptTurn(sessionId: string, turn: AcceptedTurn) {
		this.turns.set(sessionId, turn);
		const pump = this.pumps.get(sessionId);
		if (pump) this.project(pump);
	}

	/** 当前 Session 是否有活跃订阅者；无订阅时索引 running 可能已落后于 Provider 终态。 */
	hasSubscribers(sessionId: string) {
		return (this.pumps.get(sessionId)?.references ?? 0) > 0;
	}

	/** 仅已有运行证据的订阅可代替侧栏对陈旧 running 记录的独立对账。 */
	isTracking(sessionId: string) {
		const pump = this.pumps.get(sessionId);
		return !!pump && !pump.error && (pump.hydrated || !!this.buffers.get(sessionId)?.latestStatus);
	}

	async use<T>(sessionId: string, action: () => Promise<T>): Promise<T> {
		const lease = this.acquire(sessionId);
		try {
			const pump = lease.pump;
			await pump.connected.promise;
			if (pump.error) throw pump.error;
			if (pump.terminal) throw new KitError("conflict", "会话已终止");
			pump.hydration ??= this.hydrateRuntime(pump).catch((error: unknown) => {
				pump.hydration = undefined;
				throw error;
			});
			await pump.hydration;
			if (pump.error) throw pump.error;
			if (pump.terminal) throw new KitError("conflict", "会话已终止");
			return await action();
		} finally {
			lease.release();
		}
	}

	async *frames(sessionId: string, options: { after?: string; signal?: AbortSignal }): AsyncGenerator<SseFrame> {
		const lease = this.acquire(sessionId);
		let subscription: SessionSubscription | undefined;
		try {
			if (options.signal?.aborted) return;
			const { journal } = lease.pump;
			subscription = new SessionSubscription(lease.pump, this.pingIntervalMs, options.signal);
			const cursor = journal.cursor();
			const replay = journal.readAfter(options.after);
			await lease.pump.waitForConnection(options.signal);
			if (options.signal?.aborted) return;
			if (lease.pump.error) throw lease.pump.error;
			yield* replayFrames(sessionId, cursor, replay, options.after);
			yield* subscription.liveFrames();
		} catch (error) {
			if (!options.signal?.aborted) {
				const failure = streamError(error);
				yield { type: "error", data: { code: failure.code, message: failure.message, retryable: failure.retryable } };
			}
		} finally {
			subscription?.close();
			lease.release();
		}
	}

	private async connect(pump: SessionPump) {
		try {
			const info = await this.gateway.getSession(pump.sessionId);
			if (pump.controller.signal.aborted) return;
			if (!info) throw new KitError("not_found", "会话不存在");
			pump.terminal = isSessionRemovedStatus(info.status);
			pump.lastStatus = statusOfInfo(info);
			if (pump.terminal) pump.connected.resolve();
			else void this.consumeSource(pump);
		} catch (error) {
			if (pump.controller.signal.aborted) return;
			// Provider 明确返回会话不存在：索引里的 running 再也等不到终态，回正为 idle 免得侧栏常驻运行标记。
			if (error instanceof KitError && error.code === "not_found") {
				this.turns.delete(pump.sessionId);
				this.options.onStatus?.(pump.sessionId, "idle");
			}
			this.fail(pump, error);
		}
	}

	private async consumeSource(pump: SessionPump) {
		try {
			for await (const event of this.gateway.streamEvents(pump.sessionId, {
				signal: pump.controller.signal,
				onReady: pump.connected.resolve,
			})) {
				if (pump.controller.signal.aborted) return;
				this.acceptEvent(pump, event);
				if (
					pump.terminal ||
					(pump.references === 0 && pump.lastStatus !== undefined && pump.lastStatus !== "running")
				) {
					pump.journal.notify();
					this.endSource(pump);
					return;
				}
			}
			if (!pump.controller.signal.aborted)
				throw new KitError("provider_error", "上游事件流意外结束", { retryable: true });
		} catch (error) {
			if (!pump.controller.signal.aborted) this.fail(pump, error);
		}
	}

	private acceptEvent(pump: SessionPump, event: SessionEvent) {
		const isMainStatus = event.type === "session_status" && !threadIdOf(event);
		if (isMainStatus && isSessionRemovedStatus(sessionStatusOf(event))) pump.terminal = true;
		this.buffers.append(pump.sessionId, event);
		pump.journal.append(event);
		if (isMainStatus || this.turns.has(pump.sessionId)) this.project(pump);
	}

	private fail(pump: SessionPump, error: unknown) {
		pump.error = streamError(error);
		pump.connected.reject(pump.error);
		pump.journal.notify();
		this.endSource(pump);
	}

	private endSource(pump: SessionPump) {
		pump.controller.abort();
		if (pump.references === 0) this.dispose(pump);
	}

	/** 写入及审批所需的运行态按需初始化，实时订阅已经独立开放。 */
	private async hydrateRuntime(pump: SessionPump) {
		const { sessionId } = pump;
		const before = (this.buffers.get(sessionId)?.events ?? []).map((event) => ({ event }));
		const pending: EventChange[] = [];
		let bytes = 0;
		let overflow = false;
		const unsubscribe = this.buffers.subscribe(sessionId, (change) => {
			if (!change || overflow) return;
			bytes += eventSize(change.event);
			overflow = pending.length >= MAX_QUEUE_FRAMES || bytes > MAX_QUEUE_BYTES;
			if (!overflow) pending.push(change);
		});
		try {
			const history = await this.history.readSessionHistory(sessionId, pump.controller.signal);
			if (pump.error) throw pump.error;
			if (pump.terminal) throw new KitError("conflict", "会话已终止");
			pump.controller.signal.throwIfAborted();
			if (overflow) throw new KitError("provider_error", "校验会话状态期间实时事件缓冲超限", { retryable: true });
			const snapshots = reconcileSnapshotHistory(history, [...before, ...pending]);
			this.buffers.replace(
				sessionId,
				snapshots.map(({ event }) => event),
			);
			pump.hydrated = true;
			this.project(pump, this.buffers.get(sessionId)?.latestStatus !== undefined);
		} finally {
			unsubscribe();
		}
	}

	private project(pump: SessionPump, force = false) {
		const { sessionId } = pump;
		const projected = this.runtime.project(this.buffers.ensure(sessionId), this.turns.get(sessionId));
		if (projected.finished) this.turns.delete(sessionId);
		const changed = pump.lastStatus !== projected.status;
		pump.lastStatus = projected.status;
		if ((changed || force) && !pump.terminal) this.options.onStatus?.(sessionId, projected.status);
	}

	private dispose(pump: SessionPump) {
		if (pump.detachTimer) clearTimeout(pump.detachTimer);
		if (this.pumps.get(pump.sessionId) !== pump) return;
		this.pumps.delete(pump.sessionId);
		this.buffers.drop(pump.sessionId);
	}

	private stop(pump: SessionPump) {
		pump.controller.abort();
		this.dispose(pump);
	}

	private releaseWhenIdle(pump: SessionPump) {
		if (pump.references > 0) return;
		if (!pump.controller.signal.aborted && !pump.terminal && pump.lastStatus === "running") {
			if (!pump.detachTimer) {
				pump.detachTimer = setTimeout(() => {
					this.turns.delete(pump.sessionId);
					this.stop(pump);
				}, DETACHED_TIMEOUT_MS);
				pump.detachTimer.unref?.();
			}
			return;
		}
		this.stop(pump);
	}

	private acquire(sessionId: string) {
		let pump = this.pumps.get(sessionId);
		if (!pump) {
			pump = new SessionPump(sessionId);
			this.pumps.set(sessionId, pump);
			void this.connect(pump);
		}
		pump.references += 1;
		if (pump.detachTimer) {
			clearTimeout(pump.detachTimer);
			pump.detachTimer = undefined;
		}
		let released = false;
		return {
			pump,
			release: () => {
				if (released) return;
				released = true;
				if (--pump.references === 0) this.releaseWhenIdle(pump);
			},
		};
	}
}
