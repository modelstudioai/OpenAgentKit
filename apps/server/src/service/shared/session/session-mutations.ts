import { KitError } from "@openagentkit/sdk/protocol";

/** 删除先关入口，再等待已受理的写入退出。不能只禁用浏览器按钮。 */
export class SessionMutations {
	private readonly deleting;
	private readonly pending;
	private readonly isBlocked: (sessionId: string) => Promise<boolean>;

	constructor(isBlocked: (sessionId: string) => Promise<boolean>) {
		this.isBlocked = isBlocked;
		this.deleting = new Set<string>();
		this.pending = new Map<string, Set<Promise<unknown>>>();
	}

	async run<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
		if (this.deleting.has(sessionId))
			throw new KitError("conflict", "会话正在删除或删除结果待确认，请先重试删除", { retryable: true });
		const tasks = this.pending.get(sessionId) ?? new Set<Promise<unknown>>();
		this.pending.set(sessionId, tasks);
		// task 延迟一个微任务，确保在任何异步写入启动前已登记。
		const promise = Promise.resolve().then(async () => {
			if (await this.isBlocked(sessionId))
				throw new KitError("conflict", "会话正在删除或删除结果待确认，请先重试删除", { retryable: true });
			return task();
		});
		tasks.add(promise);
		try {
			return await promise;
		} finally {
			tasks.delete(promise);
			if (!tasks.size) this.pending.delete(sessionId);
		}
	}

	async exclusive<T>(sessionId: string, task: (drain: Promise<unknown>) => Promise<T>): Promise<T> {
		if (this.deleting.has(sessionId))
			throw new KitError("conflict", "会话删除正在处理中，请稍后重试", { retryable: true });
		this.deleting.add(sessionId);
		try {
			return await task(Promise.allSettled([...(this.pending.get(sessionId) ?? [])]));
		} finally {
			this.deleting.delete(sessionId);
		}
	}
}
