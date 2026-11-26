import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
	KitError,
	type MemberUsageLimitView,
	type SessionDetail,
	SessionStatsSchema,
	SessionUsageSchema,
	type TemplateUsageLimitView,
	type TemplateUsageTrend,
	type ToolApprovalDecision,
	type UsageLimitConfig,
	UsageLimitConfigSchema,
	type UsageLimitMetricState,
	type UsageLimitPolicy,
} from "@openagentkit/sdk/protocol";
import type { ServerConfig } from "../../../config.ts";
import { CatalogAgentsEntity } from "../../../entity/tables/catalog-agents.entity.ts";
import { KitTemplateListingsEntity } from "../../../entity/tables/kit-template-listings.entity.ts";
import { KitUsageLimitOverridesEntity } from "../../../entity/tables/kit-usage-limit-overrides.entity.ts";
import { KitUsageLimitPolicyEntity } from "../../../entity/tables/kit-usage-limit-policy.entity.ts";
import { KitUsageLimitTemplatesEntity } from "../../../entity/tables/kit-usage-limit-templates.entity.ts";
import { GatewaySendRejectedError } from "../../../gateway/send-error.ts";
import type { GatewaySendInput, GatewaySessionInfo, ProviderGateway } from "../../../gateway/types.ts";
import { StoreDatabase } from "../../../store/database.ts";
import { createEventBufferRegistry, type EventBufferRegistry } from "../../../utils/event-buffer.ts";
import { KIT_CONFIG, KIT_EVENT_BUFFERS, KIT_PROVIDER_GATEWAY } from "../../../utils/injection-tokens.ts";
import { dayKey, dayResetAtFor, daysAgoKey, monthKey, resetAtFor } from "../../../utils/utc-dates.ts";
import { AuditService } from "../audit.ts";
import { MemberDirectoryService } from "../member-directory.ts";
import { SessionHistoryService } from "../session/session-history.ts";
import { SessionIndexService } from "../session/session-index.ts";
import { SessionRuntimeService } from "../session/session-runtime.ts";
import { SessionUsageSnapshotService } from "./session-usage-snapshot.ts";
import { UsageAccountingService, type UsageLimitRequest, type UsageLimitSession } from "./usage-accounting.ts";

interface Collection {
	observations: Map<string, { tokens: boolean; active_seconds: boolean }>;
	details: Map<string, GatewaySessionInfo>;
	deleted: Set<string>;
	/** 跨成员只读补采的未入账增量：不入账，仅参与共享模版限额的准入合计。 */
	preview: Map<string, { tokenDelta: number; secondsDelta: number }>;
}
type Accepted = { event_ids: string[] };
type UsageLimitTimingConfig = Partial<ServerConfig> & {
	usageLimitTiming?: { now?: () => Date; timeoutMs?: number };
};

/** 按受理月记录累计增量。首次成功采集只建立基线，不追溯历史，也不声称是 Provider 账单月份。 */
@Injectable()
export class UsageLimitService {
	private readonly now;
	private readonly timeoutMs;
	private readonly locks = new Map<string, Promise<unknown>>();
	/** 准入锁序恒为成员锁 → 条目锁，补采与合计判断按条目串行。 */
	private readonly templateLocks = new Map<string, Promise<unknown>>();

	constructor(
		@Inject(UsageAccountingService) private readonly accounting: UsageAccountingService,
		@Inject(MemberDirectoryService) private readonly members: MemberDirectoryService,
		@Inject(SessionIndexService) private readonly sessionIndex: SessionIndexService,
		@Inject(SessionUsageSnapshotService) private readonly snapshots: SessionUsageSnapshotService,
		@Inject(KIT_PROVIDER_GATEWAY) private readonly gateway: ProviderGateway,
		@Inject(SessionHistoryService) private readonly sessionHistory: SessionHistoryService,
		@Inject(AuditService) private readonly audit: AuditService,
		@Inject(KIT_EVENT_BUFFERS) private readonly buffers: EventBufferRegistry,
		@Inject(KIT_CONFIG) config: UsageLimitTimingConfig,
		@Inject(StoreDatabase) private readonly db: StoreDatabase,
		@Inject(SessionRuntimeService) private readonly runtime: SessionRuntimeService,
	) {
		this.now = config.usageLimitTiming?.now ?? (() => new Date());
		this.timeoutMs = config.usageLimitTiming?.timeoutMs ?? 15_000;
	}

	// 四个限额均为 NULL 是显式不限量，和没有覆盖行是两种状态。查询完整实体以保留该行。
	private limitConfig(row: UsageLimitConfig | null): UsageLimitConfig | null {
		if (!row) return null;
		const { daily_tokens, daily_active_seconds, monthly_tokens, monthly_active_seconds } = row;
		return { daily_tokens, daily_active_seconds, monthly_tokens, monthly_active_seconds };
	}

	private hasUsageLimits(limits: UsageLimitConfig) {
		return (
			limits.monthly_tokens !== null ||
			limits.monthly_active_seconds !== null ||
			limits.daily_tokens !== null ||
			limits.daily_active_seconds !== null
		);
	}

	/** 日维度不得高于月维度：日上限超过月上限时，月闸门在当月内必然先拦截，日维度形同虚设。
	 * 日维度未设置（null）时不做该校验——它跟随月度约束，由月闸门兜底。 */
	private assertPeriodOrder(config: UsageLimitConfig) {
		if (config.daily_tokens !== null && config.monthly_tokens !== null && config.daily_tokens > config.monthly_tokens)
			throw new KitError("invalid_request", "日 Token 上限不能高于月度 Token 上限");
		if (
			config.daily_active_seconds !== null &&
			config.monthly_active_seconds !== null &&
			config.daily_active_seconds > config.monthly_active_seconds
		)
			throw new KitError("invalid_request", "日执行时长上限不能高于月度执行时长上限");
	}
	private observationValues(info: Pick<SessionDetail, "usage" | "stats">) {
		const usage = SessionUsageSchema.safeParse(info.usage ?? {});
		const stats = SessionStatsSchema.safeParse(info.stats ?? {});
		return {
			...(usage.success ? { input_tokens: usage.data.input_tokens, output_tokens: usage.data.output_tokens } : {}),
			...(stats.success ? { active_seconds: stats.data.active_seconds } : {}),
		};
	}

	private metric(limit: number | null, used: number, available: boolean): UsageLimitMetricState {
		if (!available) return { limit, used: null, remaining: null, status: "unavailable" };
		return {
			limit,
			used,
			remaining: limit === null ? null : limit - used,
			status: limit !== null && used >= limit ? "exceeded" : "ok",
		};
	}

	/** 单指标限额断言（成员维度）：unavailable 一律拒发；exceeded 拒绝后续发送，本轮已受理的不强制停止。 */
	private assertMemberMetric(
		name: "tokens" | "active_seconds",
		period: "month" | "day",
		periodKey: string,
		state: UsageLimitMetricState,
		resetAt: string,
	) {
		if (state.limit === null) return;
		if (state.status === "unavailable")
			throw new KitError("conflict", "当前用量暂不可确认，请稍后重试；不会发送新消息", {
				retryable: true,
				details: { metric: name, usage_unavailable: true },
			});
		if (state.status === "exceeded") {
			const unit = name === "tokens" ? "Token 用量已达到限额" : "执行时长已达到限额";
			throw new KitError("quota_exceeded", `${periodKey}${period === "month" ? " 月" : ""}${unit}`, {
				details: {
					metric: name,
					period,
					...(period === "month" ? { month: periodKey } : { day: periodKey }),
					limit: state.limit,
					used: state.used,
					remaining: state.remaining,
					reset_at: resetAt,
				},
			});
		}
	}

	private assertAvailable(current: MemberUsageLimitView) {
		this.assertMemberMetric("tokens", "month", current.month, current.tokens, current.reset_at);
		this.assertMemberMetric("active_seconds", "month", current.month, current.active_seconds, current.reset_at);
		this.assertMemberMetric(
			"tokens",
			"day",
			current.day_state.day,
			current.day_state.tokens,
			current.day_state.reset_at,
		);
		this.assertMemberMetric(
			"active_seconds",
			"day",
			current.day_state.day,
			current.day_state.active_seconds,
			current.day_state.reset_at,
		);
	}

	/** 模版限额超限错误：月与日的明细键名、重置时间不同。 */
	private templateQuotaError(
		name: string,
		period: "month" | "day",
		periodKey: string,
		limit: number,
		used: number,
	): KitError {
		const unit = name === "tokens" ? "Token 用量已达到限额" : "执行时长已达到限额";
		const details = {
			metric: name,
			scope: "template",
			period,
			[period]: periodKey,
			limit,
			used,
			remaining: limit - used,
			reset_at: period === "month" ? resetAtFor(periodKey) : dayResetAtFor(periodKey),
		};
		return new KitError("quota_exceeded", `${periodKey}${period === "month" ? " 月" : ""}该模版${unit}`, { details });
	}

	/** 模版限额仅在管理员设置覆盖时生效；用量不可确认时与成员限额同样拒发。 */
	private assertTemplateMetric(
		name: string,
		period: "month" | "day",
		periodKey: string,
		limit: number | null,
		used: number,
		unknown: boolean,
	) {
		if (limit === null) return;
		if (unknown)
			throw new KitError("conflict", "当前用量暂不可确认，请稍后重试；不会发送新消息", {
				retryable: true,
				details: { metric: name, usage_unavailable: true, scope: "template" },
			});
		if (used >= limit) throw this.templateQuotaError(name, period, periodKey, limit, used);
	}

	private uncertainSendError() {
		return new KitError("conflict", "此前发送结果尚未确认，不会重复发送；请查看会话，必要时确认删除后新建会话", {
			retryable: false,
		});
	}

	private async limitsFor(memberId: string) {
		return (await this.override(memberId)) ?? (await this.policy()).limits;
	}

	async setPolicy(config: UsageLimitConfig, by: string) {
		const parsed = UsageLimitConfigSchema.parse(config);
		this.assertPeriodOrder(parsed);
		await this.savePolicy(parsed, by, this.now().toISOString());
		await this.audit.append({ subject: by, action: "usage_limits.policy.set", detail: parsed });
		return await this.policy();
	}

	member(memberId: string, options: { dailyDays?: number } = {}) {
		return this.locked(memberId, () => this.load(memberId, options.dailyDays));
	}

	setMember(memberId: string, config: UsageLimitConfig, by: string) {
		return this.locked(memberId, async () => {
			await this.requireMember(memberId);
			const parsed = UsageLimitConfigSchema.parse(config);
			this.assertPeriodOrder(parsed);
			await this.setOverride(memberId, parsed, by, this.now().toISOString());
			await this.audit.append({ subject: by, action: "usage_limits.member.set", target: memberId, detail: parsed });
			return this.load(memberId);
		});
	}

	resetMember(memberId: string, by: string) {
		return this.locked(memberId, async () => {
			await this.requireMember(memberId);
			await this.resetOverride(memberId);
			await this.audit.append({ subject: by, action: "usage_limits.member.reset", target: memberId });
			return this.load(memberId);
		});
	}

	async template(templateId: string) {
		return await this.templateView(templateId);
	}

	/** 模版用量逐日趋势：条目逐日账（模版限额账本启用后开始记录），零值补全到今天（UTC 日键）；
	 * templateId 为 null 时聚合全部模版条目。 */
	async templateDailyTrend(templateId: string | null, days: number): Promise<TemplateUsageTrend> {
		const at = this.now();
		const from = daysAgoKey(at, days - 1);
		const rows = new Map((await this.accounting.templateDailyUsage(templateId, from)).map((row) => [row.day, row]));
		const data = Array.from({ length: days }, (_, index) => {
			const day = daysAgoKey(at, days - 1 - index);
			const row = rows.get(day);
			return { day, tokens: row?.tokens ?? 0, active_seconds: row?.active_seconds ?? 0 };
		});
		return {
			days,
			from_day: from,
			to_day: dayKey(at),
			since_day: await this.accounting.templateDailySince(templateId),
			data,
		};
	}

	async setTemplate(templateId: string, config: UsageLimitConfig, by: string) {
		const parsed = UsageLimitConfigSchema.parse(config);
		this.assertPeriodOrder(parsed);
		await this.setTemplateOverride(templateId, parsed, by, this.now().toISOString());
		await this.audit.append({ subject: by, action: "usage_limits.template.set", target: templateId, detail: parsed });
		return await this.templateView(templateId);
	}

	async resetTemplate(templateId: string, by: string) {
		await this.resetTemplateOverride(templateId);
		await this.audit.append({ subject: by, action: "usage_limits.template.reset", target: templateId });
		return await this.templateView(templateId);
	}

	async isMember(subjectId: string) {
		return Boolean(await this.members.findById(subjectId));
	}

	runSend(
		sessionId: string,
		input: GatewaySendInput,
		beforeSend: (() => void | Promise<void>) | undefined,
		send: () => Promise<Accepted>,
	) {
		return this.execute(
			sessionId,
			`message:${input.clientMessageId ?? randomUUID()}`,
			createHash("sha256").update(input.text).digest("hex"),
			beforeSend,
			send,
		);
	}

	runApproval(sessionId: string, decision: ToolApprovalDecision, send: () => Promise<Accepted>) {
		if (decision.result === "deny") return send();
		return this.execute(
			sessionId,
			`approval:${decision.batch_id}:${decision.call_id}`,
			createHash("sha256").update(JSON.stringify(decision)).digest("hex"),
			undefined,
			send,
			true,
		);
	}

	private async locked<T>(memberId: string, work: () => Promise<T>): Promise<T> {
		const previous = this.locks.get(memberId) ?? Promise.resolve();
		const task = previous.catch(() => {}).then(work);
		this.locks.set(memberId, task);
		try {
			return await task;
		} finally {
			if (this.locks.get(memberId) === task) this.locks.delete(memberId);
		}
	}

	private async templateLocked<T>(slug: string, work: () => Promise<T>): Promise<T> {
		const previous = this.templateLocks.get(slug) ?? Promise.resolve();
		const task = previous.catch(() => {}).then(work);
		this.templateLocks.set(slug, task);
		try {
			return await task;
		} finally {
			if (this.templateLocks.get(slug) === task) this.templateLocks.delete(slug);
		}
	}

	private async bounded<T>(promise: Promise<T>): Promise<T> {
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			return await Promise.race([
				promise,
				new Promise<never>((_, reject) => {
					timer = setTimeout(
						() => reject(new KitError("provider_error", "用量查询超时，请稍后重试", { retryable: true })),
						this.timeoutMs,
					);
				}),
			]);
		} finally {
			clearTimeout(timer);
		}
	}

	private async requireMember(memberId: string) {
		if (!(await this.members.findById(memberId))) throw new KitError("not_found", "成员不存在");
		return await this.accounting.prepare(memberId, this.now().toISOString());
	}

	private async readDetail(sessionId: string): Promise<GatewaySessionInfo | null> {
		const final = await this.snapshots.get(sessionId);
		if (!final?.deleted_at || !final.finalized_at) return this.bounded(this.gateway.getSession(sessionId));
		return {
			session_id: sessionId,
			status: "deleted",
			usage: {
				...(final.input_tokens !== null ? { input_tokens: final.input_tokens } : {}),
				...(final.output_tokens !== null ? { output_tokens: final.output_tokens } : {}),
			},
			stats: { ...(final.active_seconds !== null ? { active_seconds: final.active_seconds } : {}) },
		};
	}

	private async collectSession(sessionId: string, result: Collection) {
		try {
			const info = await this.readDetail(sessionId);
			if (!info) throw new Error("unavailable");
			const observed = await this.accounting.observe(sessionId, this.observationValues(info), this.now().toISOString());
			result.observations.set(sessionId, observed);
			result.details.set(sessionId, info);
			if (info.status === "deleted") result.deleted.add(sessionId);
		} catch {
			// 不回传 Provider 异常或将旧快照伪装成本次成功；迟到结果不会写入基线。
			result.observations.set(sessionId, { tokens: false, active_seconds: false });
		}
	}

	private async collect(
		memberId: string,
		include: (sessionId: string, month: string | null) => boolean | Promise<boolean> = () => true,
		result: Collection = { observations: new Map(), details: new Map(), deleted: new Set(), preview: new Map() },
	): Promise<Collection> {
		const rows = [];
		for (const row of await this.accounting.sessions(memberId)) {
			if (!result.observations.has(row.session_id) && (await include(row.session_id, row.admission_month))) {
				rows.push(row);
			}
		}
		// 自有基线只在成员锁内写入；普通用量列表的后台刷新不会覆盖它。
		for (let offset = 0; offset < rows.length; offset += 4) {
			await Promise.all(rows.slice(offset, offset + 4).map((row) => this.collectSession(row.session_id, result)));
		}
		return result;
	}

	private async collectAdmission(memberId: string, sessionId: string, month: string, result?: Collection) {
		const limited = this.hasUsageLimits(await this.limitsFor(memberId));
		const pending = new Set((await this.accounting.pending(memberId)).map((request) => request.session_id));
		// 不限量也采集目标基线，但不等待无关历史。启用限额时核对本月用量及尚未结束的旧轮。
		// 已删除的不确定请求只读取本地封存快照，仍可解除对其他会话的保护。
		return this.collect(
			memberId,
			async (id, admittedMonth) =>
				id === sessionId ||
				(limited && (admittedMonth === month || pending.has(id))) ||
				(pending.has(id) && Boolean((await this.snapshots.get(id))?.deleted_at)),
			result,
		);
	}

	/** 跨成员只读补采：不入账、不写他人基线，未入账增量记入 preview 供共享模版限额合计。 */
	private async previewTemplateSessions(rows: UsageLimitSession[], collected: Collection) {
		const pending = rows.filter((row) => !collected.observations.has(row.session_id));
		for (let offset = 0; offset < pending.length; offset += 4) {
			await Promise.all(
				pending.slice(offset, offset + 4).map(async (row) => {
					try {
						const info = await this.readDetail(row.session_id);
						if (!info) throw new Error("unavailable");
						const preview = this.accounting.previewDelta(row, this.observationValues(info));
						collected.preview.set(row.session_id, preview);
						collected.observations.set(row.session_id, {
							tokens: preview.tokensKnown,
							active_seconds: preview.secondsKnown,
						});
					} catch {
						// 不回传 Provider 异常，也不把旧账本值伪装成本次读取成功。
						collected.observations.set(row.session_id, { tokens: false, active_seconds: false });
					}
				}),
			);
		}
	}

	private async view(
		memberId: string,
		started: string,
		collected: Collection,
		month = monthKey(this.now()),
		targetSession?: string,
		dailyDays = 30,
	): Promise<MemberUsageLimitView> {
		const limits = await this.limitsFor(memberId);
		const used = await this.accounting.totals(memberId, month);
		// 历史月份的不可读会话不会污染本月；复用它发送时仍须确认本次基线。
		const relevant = (await this.accounting.sessions(memberId)).filter(
			(row) => row.admission_month === month || row.session_id === targetSession,
		);
		const tokensAvailable = relevant.every((row) => collected.observations.get(row.session_id)?.tokens);
		const secondsAvailable = relevant.every((row) => collected.observations.get(row.session_id)?.active_seconds);
		// 每日用量窗口（默认近 30 天，含今天 UTC 日键升序、零值补全）；增量已由 observe 归因到采集确认日。
		const at = this.now();
		const dailyMap = new Map(
			(await this.accounting.dailyUsage(memberId, daysAgoKey(at, dailyDays - 1))).map((row) => [row.day, row]),
		);
		const daily = Array.from({ length: dailyDays }, (_, index) => {
			const day = daysAgoKey(at, dailyDays - 1 - index);
			const row = dailyMap.get(day);
			return {
				day,
				tokens: row?.tokens ?? 0,
				active_seconds: row?.active_seconds ?? 0,
			};
		});
		// 日维度状态：今日已用取自逐日账（当日增量由 observe 实时写入），可用性与月维度同源。
		const day = dayKey(at);
		const dayUsed = await this.accounting.memberDayTotals(memberId, day);
		return {
			member_id: memberId,
			month,
			reset_at: resetAtFor(month),
			limits,
			override: await this.override(memberId),
			tokens: this.metric(limits.monthly_tokens, used.tokens, tokensAvailable && !used.tokens_unknown),
			active_seconds: this.metric(
				limits.monthly_active_seconds,
				used.active_seconds,
				secondsAvailable && !used.active_seconds_unknown,
			),
			day_state: {
				day,
				reset_at: dayResetAtFor(day),
				tokens: this.metric(limits.daily_tokens, dayUsed.tokens, tokensAvailable && !used.tokens_unknown),
				active_seconds: this.metric(
					limits.daily_active_seconds,
					dayUsed.active_seconds,
					secondsAvailable && !used.active_seconds_unknown,
				),
			},
			accounting_started_at: started,
			daily,
			...(tokensAvailable || secondsAvailable ? { refreshed_at: this.now().toISOString() } : {}),
		};
	}

	/** 共享模版准入合计：条目月账 + 条目日账 + 全部未入账预览增量（增量按采集确认日归入当日）。 */
	private async templateAdmissionTotals(slug: string, month: string, rows: UsageLimitSession[], collected: Collection) {
		const monthTotals = await this.accounting.agentTotals(slug, month);
		const day = dayKey(this.now());
		const dayTotals = await this.accounting.agentDayTotals(slug, day);
		const totals = {
			dayKey: day,
			tokens: monthTotals.tokens,
			seconds: monthTotals.active_seconds,
			dayTokens: dayTotals.tokens,
			daySeconds: dayTotals.active_seconds,
			tokensAvailable: true,
			secondsAvailable: true,
		};
		for (const row of rows) {
			const available = collected.observations.get(row.session_id);
			totals.tokensAvailable = totals.tokensAvailable && (available?.tokens ?? false);
			totals.secondsAvailable = totals.secondsAvailable && (available?.active_seconds ?? false);
			const preview = collected.preview.get(row.session_id);
			if (preview) {
				totals.tokens += preview.tokenDelta;
				totals.seconds += preview.secondsDelta;
				totals.dayTokens += preview.tokenDelta;
				totals.daySeconds += preview.secondsDelta;
			}
		}
		return {
			...totals,
			// 月账未知标记与会话读取失败都会让合计不可信；日账无标记，只受读取失败影响。
			monthTokensUnknown: monthTotals.tokens_unknown !== 0 || !totals.tokensAvailable,
			monthSecondsUnknown: monthTotals.active_seconds_unknown !== 0 || !totals.secondsAvailable,
			dayTokensUnknown: !totals.tokensAvailable,
			daySecondsUnknown: !totals.secondsAvailable,
		};
	}

	/** 条目锁内的准入判断：先只读补采清单里尚未读取的会话，再按账本 + 未入账增量做共享限额检查。 */
	private async admitTemplate(slug: string, month: string, collected: Collection, override: UsageLimitConfig) {
		const rows = await this.accounting.templateSessions(slug, month);
		await this.previewTemplateSessions(rows, collected);
		const totals = await this.templateAdmissionTotals(slug, month, rows, collected);
		this.assertTemplateMetric(
			"tokens",
			"month",
			month,
			override.monthly_tokens,
			totals.tokens,
			totals.monthTokensUnknown,
		);
		this.assertTemplateMetric(
			"active_seconds",
			"month",
			month,
			override.monthly_active_seconds,
			totals.seconds,
			totals.monthSecondsUnknown,
		);
		// 日账无未知标记；本月相关会话读取失败时今日合计可能缺增量，按不可确认拒发。
		this.assertTemplateMetric(
			"tokens",
			"day",
			totals.dayKey,
			override.daily_tokens,
			totals.dayTokens,
			totals.dayTokensUnknown,
		);
		this.assertTemplateMetric(
			"active_seconds",
			"day",
			totals.dayKey,
			override.daily_active_seconds,
			totals.daySeconds,
			totals.daySecondsUnknown,
		);
	}

	/** 模版限额准入：其他成员已发生、尚未采集的消耗以只读补采计入合计（不入账，自有基线
	 * 仍只在成员锁内写入）；本次读取失败、字段缺失或计数倒退的会话不得凭旧账本放行。 */
	private async assertTemplateAdmission(agentSlug: string | undefined, month: string, collected: Collection) {
		if (!agentSlug) return;
		const override = await this.templateOverrideBySlug(agentSlug);
		if (!override || !this.hasUsageLimits(override)) return;
		await this.templateLocked(agentSlug, () => this.admitTemplate(agentSlug, month, collected, override));
	}

	private async templateView(templateId: string): Promise<TemplateUsageLimitView> {
		const override = await this.templateOverride(templateId);
		const limits = override ?? {
			monthly_tokens: null,
			monthly_active_seconds: null,
			daily_tokens: null,
			daily_active_seconds: null,
		};
		const month = monthKey(this.now());
		const slug = await this.templateSlug(templateId);
		const used = slug
			? await this.accounting.agentTotals(slug, month)
			: { tokens: 0, active_seconds: 0, tokens_unknown: 0, active_seconds_unknown: 0 };
		const day = dayKey(this.now());
		const dayUsed = slug ? await this.accounting.agentDayTotals(slug, day) : { tokens: 0, active_seconds: 0 };
		return {
			template_id: templateId,
			month,
			reset_at: resetAtFor(month),
			limits,
			override,
			tokens: this.metric(limits.monthly_tokens, used.tokens, Boolean(slug) && !used.tokens_unknown),
			active_seconds: this.metric(
				limits.monthly_active_seconds,
				used.active_seconds,
				Boolean(slug) && !used.active_seconds_unknown,
			),
			day_state: {
				day,
				reset_at: dayResetAtFor(day),
				tokens: this.metric(limits.daily_tokens, dayUsed.tokens, Boolean(slug)),
				active_seconds: this.metric(limits.daily_active_seconds, dayUsed.active_seconds, Boolean(slug)),
			},
			...(slug ? { refreshed_at: this.now().toISOString() } : {}),
		};
	}

	private async history(sessionId: string) {
		const controller = new AbortController();
		// 其他会话可能没有活跃 pump；一次性读取不得向共享注册表遗留空缓冲。
		const registry = this.buffers.get(sessionId) ? this.buffers : createEventBufferRegistry();
		try {
			return await this.bounded(this.sessionHistory.readApprovalSnapshot(sessionId, registry, controller.signal));
		} finally {
			controller.abort();
		}
	}

	private replay(previous: UsageLimitRequest | undefined, hash: string): Accepted | undefined {
		if (!previous) return undefined;
		if (previous.request_hash !== hash) throw new KitError("conflict", "请求标识已用于其他内容，请重新发送");
		if (previous.event_ids && ["accepted", "settled"].includes(previous.status))
			return { event_ids: JSON.parse(previous.event_ids) as string[] };
		throw this.uncertainSendError();
	}

	/** POST 成功只代表受理。必须出现较新的主会话结束状态，才允许下一轮消费。 */
	private async confirmFinished(request: UsageLimitRequest, collected: Collection) {
		if (!this.runtime.detailEnded(collected.details.get(request.session_id)))
			throw new KitError("conflict", "上一轮执行尚未结束，请等待或中断后重试", { retryable: true });
		const snapshot = await this.history(request.session_id);
		if (
			!this.runtime.requestFinished(
				snapshot.events,
				snapshot.latestStatus,
				request,
				this.buffers.get(request.session_id),
			)
		)
			throw new KitError("conflict", "上一轮结果尚未确认，请稍后重试", { retryable: true });
		await this.accounting.settle(request.session_id, request.request_key);
	}

	private async checkPending(memberId: string, collected: Collection, continuationSession?: string) {
		for (const request of await this.accounting.pending(memberId)) {
			if (collected.deleted.has(request.session_id)) {
				await this.accounting.settle(request.session_id, request.request_key);
				continue;
			}
			if (request.status !== "accepted") throw this.uncertainSendError();
			if (request.session_id === continuationSession) continue;
			await this.confirmFinished(request, collected);
		}
	}

	private async load(memberId: string, dailyDays = 30) {
		const started = await this.requireMember(memberId);
		return await this.view(memberId, started, await this.collect(memberId), monthKey(this.now()), undefined, dailyDays);
	}

	private async finishSend(sessionId: string, key: string, send: () => Promise<Accepted>, reject: () => Promise<void>) {
		try {
			const result = await this.bounded(send());
			await this.accounting.accepted(sessionId, key, result.event_ids);
			return result;
		} catch (error) {
			if (error instanceof GatewaySendRejectedError) {
				try {
					await reject();
				} catch {
					// 回滚未提交时保留 sending，避免只清除部分受理状态后放行。
					throw this.uncertainSendError();
				}
				throw error;
			}
			try {
				await this.accounting.uncertain(sessionId, key);
			} catch {
				/* sending 仍能在重启后保护结果不明。 */
			}
			throw this.uncertainSendError();
		}
	}

	private async optionalStatusMarker(sessionId: string) {
		// Provider 可返回空 event_ids；保存发送前状态才能区分旧 idle 与本轮结束。
		try {
			return this.runtime.statusMarker((await this.history(sessionId)).latestStatus, this.buffers.get(sessionId));
		} catch {
			// 不限量时不因历史读取失败拒绝；空 ID 的受理结果后续保持待确认。
			return null;
		}
	}

	private async admissionMonth(sessionId: string, continuation: boolean, at = this.now()) {
		return (continuation && (await this.accounting.session(sessionId))?.admission_month) || monthKey(at);
	}

	private async assertNoUncertain(memberId: string, collected: Collection) {
		if (
			(await this.accounting.pending(memberId)).some(
				(request) => ["sending", "uncertain"].includes(request.status) && !collected.deleted.has(request.session_id),
			)
		)
			throw this.uncertainSendError();
	}

	private async execute(
		sessionId: string,
		key: string,
		hash: string,
		beforeSend: (() => void | Promise<void>) | undefined,
		send: () => Promise<Accepted>,
		continuation = false,
	): Promise<Accepted> {
		const local = await this.sessionIndex.get(sessionId);
		if (local?.purpose !== "experience" || !(await this.members.findById(local.subject_id))) {
			await beforeSend?.();
			return send();
		}
		return this.locked(local.subject_id, async () => {
			const existing = this.replay(await this.accounting.request(sessionId, key), hash);
			if (existing) return existing;
			const started = await this.requireMember(local.subject_id);
			const collected = await this.collectAdmission(
				local.subject_id,
				sessionId,
				await this.admissionMonth(sessionId, continuation),
			);
			const current = await this.view(
				local.subject_id,
				started,
				collected,
				await this.admissionMonth(sessionId, continuation),
				sessionId,
			);
			let previousStatus: string | null = null;
			let executionChecked = false;
			const checkExecution = async () => {
				// 异步采集期间可能从不限量切为限量；补齐新政策需要的会话后才作准入判断。
				await this.collectAdmission(
					local.subject_id,
					sessionId,
					await this.admissionMonth(sessionId, continuation),
					collected,
				);
				this.assertAvailable(
					await this.view(
						local.subject_id,
						started,
						collected,
						await this.admissionMonth(sessionId, continuation),
						sessionId,
					),
				);
				await this.checkPending(local.subject_id, collected, continuation ? sessionId : undefined);
				const info = collected.details.get(sessionId);
				const status = (await this.history(sessionId)).latestStatus;
				previousStatus = this.runtime.statusMarker(status, this.buffers.get(sessionId));
				if (!continuation && (!this.runtime.detailEnded(info) || (status && !this.runtime.eventEnded(status))))
					throw new KitError("conflict", "会话仍在执行，请等待或中断后重试", { retryable: true });
				executionChecked = true;
			};
			if (this.hasUsageLimits(current.limits)) {
				await checkExecution();
			} else {
				previousStatus = await this.optionalStatusMarker(sessionId);
			}
			// 读取失败不会挡未启用的维度；已有结果不明的请求始终不能自动重发。
			await this.assertNoUncertain(local.subject_id, collected);
			// 全局政策可能在网络采集期间变更；使用真正发送前的有效政策，不缓存旧的不限量配置。
			if (this.hasUsageLimits(await this.limitsFor(local.subject_id)) && !executionChecked) await checkExecution();
			// 此同步检查是准入点；之后才记受理账本，不在记账后因政策变更追溯拒绝。
			const admittedAt = this.now();
			const admittedMonth = await this.admissionMonth(sessionId, continuation, admittedAt);
			this.assertAvailable(await this.view(local.subject_id, started, collected, admittedMonth, sessionId));
			await this.assertTemplateAdmission(local.agent_slug, admittedMonth, collected);
			await beforeSend?.();
			const reject = await this.accounting.begin({
				sessionId,
				memberId: local.subject_id,
				key,
				hash,
				month: monthKey(admittedAt),
				previousStatus,
				now: admittedAt.toISOString(),
				continuation,
				available: collected.observations.get(sessionId) ?? { tokens: false, active_seconds: false },
			});
			return this.finishSend(sessionId, key, send, reject);
		});
	}

	async policy(): Promise<UsageLimitPolicy> {
		const row = await this.db.read((manager) => manager.findOneByOrFail(KitUsageLimitPolicyEntity, { id: 1 }));
		return {
			limits: {
				monthly_tokens: row.monthly_tokens,
				monthly_active_seconds: row.monthly_active_seconds,
				daily_tokens: row.daily_tokens,
				daily_active_seconds: row.daily_active_seconds,
			},
			...(row.updated_at ? { updated_at: row.updated_at } : {}),
			...(row.updated_by ? { updated_by: row.updated_by } : {}),
		};
	}

	private async savePolicy(config: UsageLimitConfig, by: string, now: string) {
		await this.db.write((manager) =>
			manager.update(KitUsageLimitPolicyEntity, { id: 1 }, { ...config, updated_by: by, updated_at: now }),
		);
	}

	private async override(memberId: string): Promise<UsageLimitConfig | null> {
		const row = await this.db.read((manager) =>
			manager.findOneBy(KitUsageLimitOverridesEntity, { member_id: memberId }),
		);
		return this.limitConfig(row);
	}

	private async setOverride(memberId: string, config: UsageLimitConfig, by: string, now: string) {
		await this.db.write((manager) =>
			manager.upsert(
				KitUsageLimitOverridesEntity,
				{
					member_id: memberId,
					...config,
					updated_at: now,
					updated_by: by,
				},
				["member_id"],
			),
		);
	}

	private async resetOverride(memberId: string) {
		await this.db.write((manager) => manager.delete(KitUsageLimitOverridesEntity, { member_id: memberId }));
	}

	private async templateOverride(templateId: string): Promise<UsageLimitConfig | null> {
		const row = await this.db.read((manager) =>
			manager.findOneBy(KitUsageLimitTemplatesEntity, { template_id: templateId }),
		);
		return this.limitConfig(row);
	}

	/** 发送准入按会话条目反查模版覆盖；未上架或未设置的条目返回 null（不限量）。 */
	private async templateOverrideBySlug(slug: string): Promise<UsageLimitConfig | null> {
		const row = await this.db.read((manager) =>
			manager
				.createQueryBuilder(KitUsageLimitTemplatesEntity, "o")
				.innerJoin(KitTemplateListingsEntity, "l", "l.template_id = o.template_id")
				.innerJoin(CatalogAgentsEntity, "c", "c.id = l.catalog_id")
				.where("c.slug = :slug", { slug })
				.getOne(),
		);
		return this.limitConfig(row);
	}

	private async setTemplateOverride(templateId: string, config: UsageLimitConfig, by: string, now: string) {
		await this.db.write((manager) =>
			manager.upsert(
				KitUsageLimitTemplatesEntity,
				{
					template_id: templateId,
					...config,
					updated_at: now,
					updated_by: by,
				},
				["template_id"],
			),
		);
	}

	private async resetTemplateOverride(templateId: string) {
		await this.db.write((manager) => manager.delete(KitUsageLimitTemplatesEntity, { template_id: templateId }));
	}

	private async templateSlug(templateId: string): Promise<string | null> {
		const row = await this.db.read((manager) =>
			manager
				.createQueryBuilder(KitTemplateListingsEntity, "l")
				.select("c.slug", "slug")
				.innerJoin(CatalogAgentsEntity, "c", "c.id = l.catalog_id")
				.where({ template_id: templateId })
				.getRawOne<{ slug: string }>(),
		);
		return row?.slug ?? null;
	}
}
