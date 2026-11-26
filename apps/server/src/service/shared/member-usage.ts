import { Inject, Injectable } from "@nestjs/common";
import {
	KitError,
	type MemberSessionsPage,
	type MemberSessionsQuery,
	type MemberSessionUsage,
	type MemberUsageQuery,
	type MemberUsageSummary,
	SESSION_USAGE_METRICS,
	type SessionStats,
	SessionStatsSchema,
	type SessionUsage,
	SessionUsageSchema,
	type TemplateSessionUsage,
	type TemplateUsageRow,
} from "@openagentkit/sdk/protocol";
import type { EntityManager, ObjectLiteral, SelectQueryBuilder } from "typeorm";
import { CatalogAgentsEntity } from "../../entity/tables/catalog-agents.entity.ts";
import { KitMembersEntity } from "../../entity/tables/kit-members.entity.ts";
import { KitSessionUsageEntity } from "../../entity/tables/kit-session-usage.entity.ts";
import { KitTemplateListingsEntity } from "../../entity/tables/kit-template-listings.entity.ts";
import { KitTemplatesEntity } from "../../entity/tables/kit-templates.entity.ts";
import type { GatewaySessionInfo, ProviderGateway } from "../../gateway/types.ts";
import { StoreDatabase } from "../../store/database.ts";
import { likePattern } from "../../store/sql.ts";
import { KIT_PROVIDER_GATEWAY } from "../../utils/injection-tokens.ts";
import { MemberDirectoryService } from "./member-directory.ts";
import { SessionIndexService } from "./session/session-index.ts";
import { type SessionUsageSnapshot, SessionUsageSnapshotService } from "./usage/session-usage-snapshot.ts";

function pageQuery(
	manager: EntityManager,
	cursor: { created_at: string; session_id: string } | undefined,
	limit: number,
) {
	const query = manager
		.createQueryBuilder(KitSessionUsageEntity, "u")
		.select("u.*")
		.orderBy("u.created_at", "DESC")
		.addOrderBy("u.session_id", "DESC")
		.limit(limit + 1);
	if (cursor)
		query.andWhere(
			"(u.created_at < :created_at OR (u.created_at = :created_at AND u.session_id < :session_id))",
			cursor,
		);
	return query;
}

function selectMetrics<E extends ObjectLiteral>(query: SelectQueryBuilder<E>) {
	for (const key of SESSION_USAGE_METRICS) {
		query.addSelect(`SUM(u.${key})`, key).addSelect(`COUNT(u.${key})`, `${key}_count`);
	}
	return query;
}

const REFRESH_TTL_MS = 60_000;
const MAX_CONCURRENT_DETAILS = 4;
const DETAIL_TIMEOUT_MS = 15_000;

@Injectable()
export class MemberUsageService {
	private readonly jobs = new Map<string, { startedAt: string; promise: Promise<void> }>();
	private readonly refreshed = new Map<string, number>();
	private readonly queue: (() => void)[] = [];
	private active = 0;

	constructor(
		@Inject(SessionUsageSnapshotService) private readonly snapshots: SessionUsageSnapshotService,
		@Inject(MemberDirectoryService) private readonly members: MemberDirectoryService,
		@Inject(KIT_PROVIDER_GATEWAY) private readonly gateway: ProviderGateway,
		@Inject(SessionIndexService) private readonly sessionIndex: SessionIndexService,
		@Inject(StoreDatabase) private readonly db: StoreDatabase,
	) {}

	async refresh(memberId: string, force = false) {
		await (await this.startRefresh(memberId, force))?.promise;
	}

	/** 按模版聚合全部成员的体验会话用量；登记新会话并按成员调度后台补采，返回当前缓存；search 过滤模版名/智能体名/模版 ID。 */
	async summaryByTemplate(options: { search?: string } = {}): Promise<TemplateUsageRow[]> {
		for (const memberId of await this.snapshots.syncAll()) await this.schedule(memberId);
		return await this.summarizeTemplates(options.search ?? "");
	}

	async summary(memberId: string, options: MemberUsageQuery = {}) {
		await this.prepare(memberId);
		await this.schedule(memberId, options.refresh === "1");
		return await this.summarizeMember(memberId, options.agent_slug, this.jobs.get(memberId)?.startedAt);
	}

	async list(memberId: string, options: MemberSessionsQuery) {
		await this.prepare(memberId);
		return await this.memberPage(memberId, options);
	}

	/** 模版会话明细：先登记全部成员会话（不触发采集调度），跨成员按模版条目过滤。 */
	async listByTemplate(templateId: string, options: { cursor?: string; limit: number }) {
		await this.snapshots.syncAll();
		return await this.templatePage(templateId, options);
	}

	isMemberSession(...args: Parameters<typeof this.snapshots.isMemberSession>) {
		return this.snapshots.isMemberSession(...args);
	}

	async hasFinalSnapshot(sessionId: string) {
		return Boolean((await this.snapshots.get(sessionId))?.finalized_at);
	}

	async captureFinal(sessionId: string, detail: GatewaySessionInfo) {
		const local = await this.sessionIndex.get(sessionId);
		if (!local || !(await this.snapshots.isMemberSession(sessionId))) throw new KitError("not_found", "成员会话不存在");
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
		await this.snapshots.syncMember(local.subject_id);
		await this.snapshots.finalize(sessionId, { ...usage.data, ...stats.data }, detail.status);
	}

	releaseFinal(...args: Parameters<typeof this.snapshots.releaseFinal>) {
		return this.snapshots.releaseFinal(...args);
	}

	markDeleted(...args: Parameters<typeof this.snapshots.markDeleted>) {
		return this.snapshots.markDeleted(...args);
	}

	private async limited<T>(work: () => Promise<T>): Promise<T> {
		if (this.active >= MAX_CONCURRENT_DETAILS) await new Promise<void>((resolve) => this.queue.push(resolve));
		else this.active++;
		try {
			return await work();
		} finally {
			const next = this.queue.shift();
			if (next) next();
			else this.active--;
		}
	}

	private async prepare(memberId: string) {
		if (!(await this.members.findById(memberId))) throw new KitError("not_found", "成员不存在");
		await this.snapshots.syncMember(memberId);
	}

	private async readDetail(sessionId: string) {
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			return await Promise.race([
				this.gateway.getSession(sessionId),
				new Promise<never>((_, reject) => {
					timer = setTimeout(() => reject(new Error("Session usage collection timed out")), DETAIL_TIMEOUT_MS);
				}),
			]);
		} finally {
			clearTimeout(timer);
		}
	}

	private async collect(sessionId: string) {
		await this.limited(async () => {
			const revision = await this.snapshots.beginCapture(sessionId);
			if (revision === null) return;
			try {
				const detail = await this.readDetail(sessionId);
				if (!detail) {
					await this.snapshots.fail(sessionId, revision, "not_found");
					return;
				}
				const usage = SessionUsageSchema.parse(detail.usage ?? {});
				const stats = SessionStatsSchema.parse(detail.stats ?? {});
				await this.snapshots.save(sessionId, { ...usage, ...stats }, detail.status, revision);
			} catch {
				// 仅保存状态；Provider 异常可能带请求与凭据，不能进入统计表或响应。
				await this.snapshots.fail(sessionId, revision, "failed");
			}
		});
	}

	private async scan(memberId: string) {
		let after = "";
		for (;;) {
			const candidates = await this.snapshots.captureCandidates(memberId, after);
			if (!candidates.length) break;
			await Promise.all(candidates.map(this.collect.bind(this)));
			after = candidates.at(-1) as string;
		}
	}

	private async startRefresh(memberId: string, force: boolean) {
		await this.prepare(memberId);
		const pending = force || (await this.snapshots.hasPending(memberId));
		const existing = this.jobs.get(memberId);
		if (existing) return existing;
		if (!pending && Date.now() - (this.refreshed.get(memberId) ?? 0) < REFRESH_TTL_MS) return;
		const job = { startedAt: new Date().toISOString(), promise: Promise.resolve() };
		this.jobs.set(memberId, job);
		job.promise = this.scan(memberId).finally(() => {
			this.refreshed.set(memberId, Date.now());
			this.jobs.delete(memberId);
		});
		return job;
	}

	private async schedule(memberId: string, force = false) {
		const job = await this.startRefresh(memberId, force);
		void job?.promise.catch(() => {
			// 路由返回持久化的部分结果；失败可由下一次刷新恢复，不产生未处理拒绝。
		});
	}

	private async summarizeMember(
		memberId: string,
		agentSlug?: string,
		refreshStartedAt?: string,
	): Promise<MemberUsageSummary> {
		type Totals = Record<string, number | null> & {
			total: number;
			deleted: number;
			failed: number;
			incomplete: number;
			captured: number;
			refreshed: string | null;
			completed: number | null;
		};
		const { counts, agents } = await this.db.read(async (manager) => {
			const query = manager
				.createQueryBuilder(KitSessionUsageEntity, "u")
				.select("COUNT(*)", "total")
				.addSelect("COUNT(u.deleted_at)", "deleted")
				.addSelect("SUM(CASE WHEN u.collection_status IN ('failed','not_found') THEN 1 ELSE 0 END)", "failed")
				.addSelect("SUM(CASE WHEN u.collection_status <> 'complete' THEN 1 ELSE 0 END)", "incomplete")
				.addSelect("COUNT(u.captured_at)", "captured")
				.addSelect("MAX(u.captured_at)", "refreshed")
				.where("u.member_id = :memberId", { memberId });
			const attempted = refreshStartedAt
				? "u.attempted_at IS NOT NULL AND (u.attempted_at >= :refreshStartedAt OR u.finalized_at IS NOT NULL)"
				: "u.attempted_at IS NOT NULL";
			query.addSelect(`SUM(CASE WHEN ${attempted} THEN 1 ELSE 0 END)`, "completed");
			if (refreshStartedAt) query.setParameter("refreshStartedAt", refreshStartedAt);
			if (agentSlug) query.andWhere("u.agent_slug = :agentSlug", { agentSlug });
			const counts = (await selectMetrics(query).getRawOne<Totals>())!;
			const agents = await manager
				.createQueryBuilder(KitSessionUsageEntity, "u")
				.select("u.agent_slug", "agent_slug")
				.distinct(true)
				.where({ member_id: memberId })
				.orderBy("u.agent_slug")
				.getRawMany<{ agent_slug: string }>();
			return { counts, agents };
		});
		return {
			session_count: counts.total,
			deleted_session_count: counts.deleted,
			metrics: this.metricSummary(counts, counts.total),
			agents: agents.map(({ agent_slug }) => agent_slug),
			...(counts.refreshed ? { refreshed_at: counts.refreshed } : {}),
			completed_sessions: counts.completed ?? 0,
			refresh_status: this.refreshStatus(counts, Boolean(refreshStartedAt)),
		};
	}

	/** 按上架条目关联体验会话，未使用的模版同样返回一行。 */
	private async summarizeTemplates(search = "") {
		type Totals = Record<string, number | null> & {
			template_id: string;
			name: string;
			remote_agent_id: string;
			remote_agent_name: string;
			listing_status: "listed" | "unlisted";
			total: number;
			deleted: number;
			refreshed: string | null;
		};
		const rows = await this.db.read((manager) => {
			const query = manager
				.createQueryBuilder(KitTemplatesEntity, "t")
				.select("t.template_id", "template_id")
				.addSelect("t.name", "name")
				.addSelect("t.remote_agent_id", "remote_agent_id")
				.addSelect("t.remote_agent_name", "remote_agent_name")
				.addSelect("CASE WHEN c.status = 'listed' THEN 'listed' ELSE 'unlisted' END", "listing_status")
				.addSelect("COUNT(u.session_id)", "total")
				.addSelect("COUNT(u.deleted_at)", "deleted")
				.addSelect("MAX(u.captured_at)", "refreshed")
				.leftJoin(KitTemplateListingsEntity, "l", "l.template_id = t.template_id")
				.leftJoin(CatalogAgentsEntity, "c", "c.id = l.catalog_id")
				.leftJoin(KitSessionUsageEntity, "u", "u.agent_slug = c.slug")
				.groupBy("t.template_id")
				.addGroupBy("c.status")
				.orderBy("t.created_at")
				.addOrderBy("t.template_id");
			if (search)
				query.andWhere(
					"(LOWER(t.name) LIKE LOWER(:search) ESCAPE '!' OR LOWER(t.remote_agent_name) LIKE LOWER(:search) ESCAPE '!' OR LOWER(t.template_id) LIKE LOWER(:search) ESCAPE '!')",
					{ search: likePattern(search) },
				);
			return selectMetrics(query).getRawMany<Totals>();
		});
		return rows.map((row) => ({
			template_id: row.template_id,
			name: row.name,
			remote_agent_id: row.remote_agent_id,
			remote_agent_name: row.remote_agent_name,
			listing_status: row.listing_status,
			session_count: row.total,
			deleted_session_count: row.deleted,
			...(row.refreshed ? { refreshed_at: row.refreshed } : {}),
			metrics: this.metricSummary(row, row.total),
		}));
	}

	private sessionUsageView(row: SessionUsageSnapshot): MemberSessionUsage {
		const usage: SessionUsage = {};
		const stats: SessionStats = {};
		for (const key of SESSION_USAGE_METRICS) {
			const value = row[key];
			if (value === null) continue;
			if (key === "active_seconds" || key === "duration_seconds") stats[key] = value;
			else usage[key] = value;
		}
		return {
			session_id: row.session_id,
			member_id: row.member_id,
			agent_slug: row.agent_slug,
			created_at: row.created_at,
			collection_status: row.collection_status,
			...(row.title !== null ? { title: row.title } : {}),
			...(row.status !== null ? { status: row.status } : {}),
			...(row.captured_at ? { captured_at: row.captured_at } : {}),
			...(row.deleted_at ? { deleted_at: row.deleted_at } : {}),
			...(Object.keys(usage).length ? { usage } : {}),
			...(Object.keys(stats).length ? { stats } : {}),
		};
	}

	private readUsageCursor(token: string | undefined, memberId: string, agentSlug?: string) {
		if (!token) return undefined;
		try {
			const value = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
			if (
				value.member_id === memberId &&
				value.agent_slug === (agentSlug ?? null) &&
				typeof value.created_at === "string" &&
				typeof value.session_id === "string"
			) {
				return value as { created_at: string; session_id: string };
			}
		} catch {
			/* 不回显不可信游标。 */
		}
		throw new KitError("invalid_request", "会话用量游标无效或与筛选条件不匹配，请重新查询");
	}

	private refreshStatus(
		counts: { failed: number; captured: number; incomplete: number },
		refreshing: boolean,
	): MemberUsageSummary["refresh_status"] {
		if (refreshing) return "refreshing";
		if (counts.failed && !counts.captured) return "failed";
		return counts.incomplete ? "partial" : "idle";
	}

	private metricSummary(totals: Record<string, number | null>, sessionCount: number): MemberUsageSummary["metrics"] {
		return Object.fromEntries(
			SESSION_USAGE_METRICS.map((key) => [
				key,
				{
					value: sessionCount === 0 ? 0 : (totals[key] ?? null),
					covered_sessions: totals[`${key}_count`] ?? 0,
				},
			]),
		) as MemberUsageSummary["metrics"];
	}

	private async memberPage(memberId: string, options: MemberSessionsQuery): Promise<MemberSessionsPage> {
		const cursor = this.readUsageCursor(options.cursor, memberId, options.agent_slug);
		const rows = await this.db.read((manager) => {
			const query = pageQuery(manager, cursor, options.limit).andWhere("u.member_id = :memberId", { memberId });
			if (options.agent_slug) query.andWhere("u.agent_slug = :slug", { slug: options.agent_slug });
			return query.getRawMany<SessionUsageSnapshot>();
		});
		const data = rows.slice(0, options.limit).map((row) => this.sessionUsageView(row));
		const last = data.at(-1);
		return {
			data,
			...(last && rows.length > options.limit
				? {
						next_cursor: Buffer.from(
							JSON.stringify({
								member_id: memberId,
								agent_slug: options.agent_slug ?? null,
								session_id: last.session_id,
								created_at: last.created_at,
							}),
						).toString("base64url"),
					}
				: {}),
		};
	}

	/** 模版维度的会话明细：跨成员取该模版上架条目的用量行，附带成员公开资料。 */
	private async templatePage(
		templateId: string,
		options: { cursor?: string; limit: number },
	): Promise<{ data: TemplateSessionUsage[]; next_cursor?: string }> {
		let cursor: { created_at: string; session_id: string } | undefined;
		if (options.cursor) {
			try {
				const value = JSON.parse(Buffer.from(options.cursor, "base64url").toString("utf8"));
				if (
					value.template_id === templateId &&
					typeof value.created_at === "string" &&
					typeof value.session_id === "string"
				) {
					cursor = value;
				} else {
					throw new Error("mismatch");
				}
			} catch {
				throw new KitError("invalid_request", "会话用量游标无效或与筛选条件不匹配，请重新查询");
			}
		}
		const rows = await this.db.read((manager) =>
			pageQuery(manager, cursor, options.limit)
				.addSelect("m.display_name", "member_display_name")
				.addSelect("m.username", "member_username")
				.innerJoin(CatalogAgentsEntity, "c", "c.slug = u.agent_slug")
				.innerJoin(KitTemplateListingsEntity, "l", "l.catalog_id = c.id")
				.innerJoin(KitMembersEntity, "m", "m.member_id = u.member_id")
				.andWhere("l.template_id = :templateId", { templateId })
				.getRawMany<SessionUsageSnapshot & { member_display_name: string; member_username: string }>(),
		);
		const data = rows.slice(0, options.limit).map((row) => ({
			...this.sessionUsageView(row),
			member_display_name: row.member_display_name,
			member_username: row.member_username,
		}));
		const last = data.at(-1);
		return {
			data,
			...(last && rows.length > options.limit
				? {
						next_cursor: Buffer.from(
							JSON.stringify({
								template_id: templateId,
								session_id: last.session_id,
								created_at: last.created_at,
							}),
						).toString("base64url"),
					}
				: {}),
		};
	}
}
