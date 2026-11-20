import {
	KitError,
	type MemberSessionsQuery,
	type MemberUsageQuery,
	SessionStatsSchema,
	SessionUsageSchema,
	type TemplateUsageRow,
} from "@openagentkit/sdk/protocol";
import type { GatewaySessionInfo, ProviderGateway } from "../gateway/types.ts";
import type { MemberStore } from "../store/members.ts";
import type { SessionUsageStore } from "../store/session-usage.ts";
import type { SessionIndex } from "../store/sessions.ts";

const REFRESH_TTL_MS = 60_000;
const MAX_CONCURRENT_DETAILS = 4;

export function createMemberUsageService({
	store,
	members,
	gateway,
	sessionIndex,
	detailTimeoutMs = 15_000,
}: {
	store: SessionUsageStore;
	members: MemberStore;
	gateway: ProviderGateway;
	sessionIndex: SessionIndex;
	detailTimeoutMs?: number;
}) {
	const jobs = new Map<string, { startedAt: string; promise: Promise<void> }>();
	const refreshed = new Map<string, number>();
	let active = 0;
	const queue: (() => void)[] = [];
	async function limited<T>(work: () => Promise<T>): Promise<T> {
		if (active >= MAX_CONCURRENT_DETAILS) await new Promise<void>((resolve) => queue.push(resolve));
		else active++;
		try {
			return await work();
		} finally {
			const next = queue.shift();
			if (next) next();
			else active--;
		}
	}
	async function prepare(memberId: string) {
		if (!(await members.findById(memberId))) throw new KitError("not_found", "成员不存在");
		await store.syncMember(memberId);
	}
	async function readDetail(sessionId: string) {
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			return await Promise.race([
				gateway.getSession(sessionId),
				new Promise<never>((_, reject) => {
					timer = setTimeout(() => reject(new Error("Session usage collection timed out")), detailTimeoutMs);
				}),
			]);
		} finally {
			clearTimeout(timer);
		}
	}
	async function collect(sessionId: string) {
		await limited(async () => {
			const revision = await store.beginCapture(sessionId);
			if (revision === null) return;
			try {
				const detail = await readDetail(sessionId);
				if (!detail) {
					await store.fail(sessionId, revision, "not_found");
					return;
				}
				const usage = SessionUsageSchema.parse(detail.usage ?? {});
				const stats = SessionStatsSchema.parse(detail.stats ?? {});
				await store.save(sessionId, { ...usage, ...stats }, detail.status, revision);
			} catch {
				// 仅保存状态；Provider 异常可能带请求与凭据，不能进入统计表或响应。
				await store.fail(sessionId, revision, "failed");
			}
		});
	}
	async function scan(memberId: string) {
		let after = "";
		for (;;) {
			const candidates = await store.captureCandidates(memberId, after);
			if (!candidates.length) break;
			await Promise.all(candidates.map(collect));
			after = candidates.at(-1) as string;
		}
	}
	async function startRefresh(memberId: string, force: boolean) {
		await prepare(memberId);
		const pending = force || (await store.hasPending(memberId));
		const existing = jobs.get(memberId);
		if (existing) return existing;
		if (!pending && Date.now() - (refreshed.get(memberId) ?? 0) < REFRESH_TTL_MS) return;
		const job = { startedAt: new Date().toISOString(), promise: Promise.resolve() };
		jobs.set(memberId, job);
		job.promise = scan(memberId).finally(() => {
			refreshed.set(memberId, Date.now());
			jobs.delete(memberId);
		});
		return job;
	}
	async function schedule(memberId: string, force = false) {
		const job = await startRefresh(memberId, force);
		void job?.promise.catch(() => {
			// 路由返回持久化的部分结果；失败可由下一次刷新恢复，不产生未处理拒绝。
		});
	}
	return {
		async refresh(memberId: string, force = false) {
			await (await startRefresh(memberId, force))?.promise;
		},
		/** 按模版聚合全部成员的体验会话用量；登记新会话并按成员调度后台补采，返回当前缓存；search 过滤模版名/智能体名/模版 ID。 */
		async summaryByTemplate(options: { search?: string } = {}): Promise<TemplateUsageRow[]> {
			for (const memberId of await store.syncAll()) await schedule(memberId);
			return await store.summaryByTemplate(options.search ?? "");
		},
		async summary(memberId: string, options: MemberUsageQuery = {}) {
			await prepare(memberId);
			await schedule(memberId, options.refresh === "1");
			return await store.summary(memberId, options.agent_slug, jobs.get(memberId)?.startedAt);
		},
		async list(memberId: string, options: MemberSessionsQuery) {
			await prepare(memberId);
			return await store.list(memberId, options);
		},
		/** 模版会话明细：先登记全部成员会话（不触发采集调度），跨成员按模版条目过滤。 */
		async listByTemplate(templateId: string, options: { cursor?: string; limit: number }) {
			await store.syncAll();
			return await store.listByTemplate(templateId, options);
		},
		isMemberSession: store.isMemberSession,
		async hasFinalSnapshot(sessionId: string) {
			return Boolean((await store.get(sessionId))?.finalized_at);
		},
		async captureFinal(sessionId: string, detail: GatewaySessionInfo) {
			const local = await sessionIndex.get(sessionId);
			if (!local || !(await store.isMemberSession(sessionId))) throw new KitError("not_found", "成员会话不存在");
			const usage = SessionUsageSchema.safeParse(detail.usage);
			const stats = SessionStatsSchema.safeParse(detail.stats ?? {});
			if (
				!usage.success ||
				!stats.success ||
				usage.data.input_tokens === undefined ||
				usage.data.output_tokens === undefined
			) {
				throw new KitError("provider_error", "未获取到有效的最终会话用量，请重试", { retryable: true });
			}
			await store.syncMember(local.subject_id);
			await store.finalize(sessionId, { ...usage.data, ...stats.data }, detail.status);
		},
		releaseFinal: store.releaseFinal,
		markDeleted: store.markDeleted,
	};
}
export type MemberUsageService = ReturnType<typeof createMemberUsageService>;
