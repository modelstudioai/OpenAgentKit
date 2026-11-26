import { Inject, Injectable } from "@nestjs/common";

import { KitError } from "@openagentkit/sdk/protocol";
import { type EntityManager, MoreThanOrEqual, Not } from "typeorm";
import { CatalogAgentsEntity } from "../../../entity/tables/catalog-agents.entity.ts";
import { KitSessionUsageEntity } from "../../../entity/tables/kit-session-usage.entity.ts";
import { KitSessionsEntity } from "../../../entity/tables/kit-sessions.entity.ts";
import { KitTemplateListingsEntity } from "../../../entity/tables/kit-template-listings.entity.ts";
import { KitUsageLimitAgentDaysEntity } from "../../../entity/tables/kit-usage-limit-agent-days.entity.ts";
import { KitUsageLimitAgentMonthsEntity } from "../../../entity/tables/kit-usage-limit-agent-months.entity.ts";
import { KitUsageLimitDaysEntity } from "../../../entity/tables/kit-usage-limit-days.entity.ts";
import { KitUsageLimitMembersEntity } from "../../../entity/tables/kit-usage-limit-members.entity.ts";
import { KitUsageLimitMonthsEntity } from "../../../entity/tables/kit-usage-limit-months.entity.ts";
import { KitUsageLimitRequestsEntity } from "../../../entity/tables/kit-usage-limit-requests.entity.ts";
import { KitUsageLimitSessionsEntity } from "../../../entity/tables/kit-usage-limit-sessions.entity.ts";
import { StoreDatabase } from "../../../store/database.ts";

export interface UsageLimitSession {
	session_id: string;
	member_id: string;
	input_tokens: number | null;
	output_tokens: number | null;
	active_seconds: number | null;
	admission_month: string | null;
	captured_at: string | null;
}

export interface UsageLimitRequest {
	session_id: string;
	request_key: string;
	member_id: string;
	request_hash: string;
	status: "sending" | "accepted" | "uncertain" | "settled";
	event_ids: string | null;
	previous_status: string | null;
	created_at: string;
}

export interface UsageObservation {
	input_tokens?: number;
	output_tokens?: number;
	active_seconds?: number;
}

function counterChange(previous: number | null, current: number | undefined) {
	if (current === undefined || (previous !== null && current < previous))
		return { known: false, value: previous, delta: 0 };
	return { known: true, value: current, delta: previous === null ? 0 : current - previous };
}

function observation(row: UsageLimitSession, values: UsageObservation) {
	const input = counterChange(row.input_tokens, values.input_tokens);
	const output = counterChange(row.output_tokens, values.output_tokens);
	const seconds = counterChange(row.active_seconds, values.active_seconds);
	const tokensKnown = input.known && output.known;
	const tokenBaseline = row.input_tokens !== null && row.output_tokens !== null;
	return {
		tokensKnown,
		secondsKnown: seconds.known,
		input: tokensKnown ? input.value : row.input_tokens,
		output: tokensKnown ? output.value : row.output_tokens,
		seconds: seconds.value,
		tokenDelta: tokensKnown && tokenBaseline ? input.delta + output.delta : 0,
		secondsDelta: seconds.delta,
	};
}

const dayColumns = { tokens: true, active_seconds: true } as const;

const monthColumns = { ...dayColumns, tokens_unknown: true, active_seconds_unknown: true } as const;

const emptyMonth = { tokens: 0, active_seconds: 0, tokens_unknown: 0, active_seconds_unknown: 0 };

function templateDays(manager: EntityManager, templateId: string | null) {
	const query = manager
		.createQueryBuilder(KitUsageLimitAgentDaysEntity, "d")
		.innerJoin(CatalogAgentsEntity, "c", "c.slug = d.agent_slug")
		.innerJoin(KitTemplateListingsEntity, "l", "l.catalog_id = c.id");
	if (templateId) query.where("l.template_id = :templateId", { templateId });
	return query;
}

/** 按请求维护计量基线、成员和条目的日月账及准入回执。 */
@Injectable()
export class UsageAccountingService {
	constructor(@Inject(StoreDatabase) private readonly db: StoreDatabase) {}

	async session(id: string) {
		const row = await this.db.read((manager) => manager.findOneBy(KitUsageLimitSessionsEntity, { session_id: id }));
		return (row ?? undefined) as UsageLimitSession | undefined;
	}

	async totals(memberId: string, month: string) {
		const row = await this.db.read((manager) =>
			manager.findOne(KitUsageLimitMonthsEntity, {
				select: monthColumns,
				where: { member_id: memberId, month },
			}),
		);
		return row ?? { ...emptyMonth };
	}

	/** 会话的记账条目：优先用量账本行（保留已删除会话），退回会话索引。 */
	private async agentSlugOf(sessionId: string): Promise<string | null> {
		return this.db.read(async (manager) => {
			const query = { select: { agent_slug: true }, where: { session_id: sessionId } };
			const archived = await manager.findOne(KitSessionUsageEntity, query);
			return archived?.agent_slug ?? (await manager.findOne(KitSessionsEntity, query))?.agent_slug ?? null;
		});
	}

	async agentTotals(slug: string, month: string) {
		const row = await this.db.read((manager) =>
			manager.findOne(KitUsageLimitAgentMonthsEntity, {
				select: monthColumns,
				where: { agent_slug: slug, month },
			}),
		);
		return row ?? { ...emptyMonth };
	}

	private async addAgentMonthly(slug: string, month: string, tokenDelta: number, secondsDelta: number) {
		const previous = await this.agentTotals(slug, month);
		const tokens = previous.tokens + tokenDelta;
		const activeSeconds = previous.active_seconds + secondsDelta;
		if (!Number.isSafeInteger(tokens) || !Number.isFinite(activeSeconds))
			throw new KitError("conflict", "用量数值超出可统计范围", { retryable: true });
		const values = { agent_slug: slug, month: month, tokens, active_seconds: activeSeconds };
		await this.db.write((manager) => manager.upsert(KitUsageLimitAgentMonthsEntity, values, ["agent_slug", "month"]));
	}

	/** 条目日账：与成员逐日账（020）同构；日账无未知标记，跨月丢失维度由月账闸门兜底。 */
	async agentDayTotals(slug: string, day: string) {
		const row = await this.db.read((manager) =>
			manager.findOne(KitUsageLimitAgentDaysEntity, {
				select: dayColumns,
				where: { agent_slug: slug, day },
			}),
		);
		return row ?? { tokens: 0, active_seconds: 0 };
	}

	private async addAgentDaily(slug: string, day: string, tokenDelta: number, secondsDelta: number) {
		if (tokenDelta === 0 && secondsDelta === 0) return;
		const previous = await this.agentDayTotals(slug, day);
		const tokens = previous.tokens + tokenDelta;
		const activeSeconds = previous.active_seconds + secondsDelta;
		if (!Number.isSafeInteger(tokens) || !Number.isFinite(activeSeconds))
			throw new KitError("conflict", "用量数值超出可统计范围", { retryable: true });
		await this.db.write((manager) =>
			manager.upsert(
				KitUsageLimitAgentDaysEntity,
				{
					agent_slug: slug,
					day,
					tokens,
					active_seconds: activeSeconds,
				},
				["agent_slug", "day"],
			),
		);
	}

	private async markAgentUnknown(slug: string, month: string, tokens: boolean, seconds: boolean) {
		const key = { agent_slug: slug, month };
		const inserted = await this.db.insertEntityIfAbsent(
			KitUsageLimitAgentMonthsEntity,
			{
				...key,
				tokens_unknown: Number(tokens),
				active_seconds_unknown: Number(seconds),
			},
			["agent_slug", "month"],
		);
		if (!inserted && (tokens || seconds)) {
			await this.db.write((manager) =>
				manager.update(KitUsageLimitAgentMonthsEntity, key, {
					...(tokens ? { tokens_unknown: 1 } : {}),
					...(seconds ? { active_seconds_unknown: 1 } : {}),
				}),
			);
		}
	}

	private async addMonthly(row: UsageLimitSession, tokenDelta: number, secondsDelta: number) {
		if (!row.admission_month) return;
		const previous = await this.totals(row.member_id, row.admission_month);
		const tokens = previous.tokens + tokenDelta;
		const activeSeconds = previous.active_seconds + secondsDelta;
		if (!Number.isSafeInteger(tokens) || !Number.isFinite(activeSeconds))
			throw new KitError("conflict", "用量数值超出可统计范围", { retryable: true });
		const values = { member_id: row.member_id, month: row.admission_month, tokens, active_seconds: activeSeconds };
		await this.db.write((manager) => manager.upsert(KitUsageLimitMonthsEntity, values, ["member_id", "month"]));
	}

	private async markUnknown(memberId: string, month: string, tokens: boolean, seconds: boolean) {
		const key = { member_id: memberId, month };
		const inserted = await this.db.insertEntityIfAbsent(
			KitUsageLimitMonthsEntity,
			{
				...key,
				tokens_unknown: Number(tokens),
				active_seconds_unknown: Number(seconds),
			},
			["member_id", "month"],
		);
		if (!inserted && (tokens || seconds)) {
			await this.db.write((manager) =>
				manager.update(KitUsageLimitMonthsEntity, key, {
					...(tokens ? { tokens_unknown: 1 } : {}),
					...(seconds ? { active_seconds_unknown: 1 } : {}),
				}),
			);
		}
	}

	async memberDayTotals(memberId: string, day: string) {
		const row = await this.db.read((manager) =>
			manager.findOne(KitUsageLimitDaysEntity, {
				select: dayColumns,
				where: { member_id: memberId, day },
			}),
		);
		return row ?? { tokens: 0, active_seconds: 0 };
	}

	/** 逐日增量账与月账同事务双写；day 是采集确认日的 UTC 日键，零增量不落行。 */
	private async addMemberDaily(memberId: string, day: string, tokenDelta: number, secondsDelta: number) {
		if (tokenDelta === 0 && secondsDelta === 0) return;
		const previous = await this.memberDayTotals(memberId, day);
		const tokens = previous.tokens + tokenDelta;
		const activeSeconds = previous.active_seconds + secondsDelta;
		if (!Number.isSafeInteger(tokens) || !Number.isFinite(activeSeconds))
			throw new KitError("conflict", "用量数值超出可统计范围", { retryable: true });
		await this.db.write((manager) =>
			manager.upsert(
				KitUsageLimitDaysEntity,
				{
					member_id: memberId,
					day,
					tokens,
					active_seconds: activeSeconds,
				},
				["member_id", "day"],
			),
		);
	}

	private async resetBaseline(row: UsageLimitSession, month: string, lostTokens: boolean, lostSeconds: boolean) {
		await this.db.write((manager) =>
			manager.update(
				KitUsageLimitSessionsEntity,
				{ session_id: row.session_id },
				{
					admission_month: month,
					input_tokens: lostTokens ? null : row.input_tokens,
					output_tokens: lostTokens ? null : row.output_tokens,
					active_seconds: lostSeconds ? null : row.active_seconds,
				},
			),
		);
		await this.markUnknown(
			row.member_id,
			month,
			lostTokens || row.input_tokens === null || row.output_tokens === null,
			lostSeconds || row.active_seconds === null,
		);
	}

	private async prepareAgentAdmission(
		slug: string,
		row: UsageLimitSession,
		month: string,
		crossing: boolean,
		lostTokens: boolean,
		lostSeconds: boolean,
	) {
		if (crossing && row.admission_month)
			await this.markAgentUnknown(slug, row.admission_month, lostTokens, lostSeconds);
		await this.markAgentUnknown(
			slug,
			month,
			lostTokens || row.input_tokens === null || row.output_tokens === null,
			lostSeconds || row.active_seconds === null,
		);
	}

	private async prepareAdmission(
		row: UsageLimitSession,
		month: string,
		available: { tokens: boolean; active_seconds: boolean },
	) {
		// 跨月前未读到该维度时无法分割迟到累计，旧、新两月均未知，后续首次值只重建基线。
		const crossing = row.admission_month !== month;
		const lostTokens = crossing && !available.tokens;
		const lostSeconds = crossing && !available.active_seconds;
		if (crossing && row.admission_month)
			await this.markUnknown(row.member_id, row.admission_month, lostTokens, lostSeconds);
		await this.resetBaseline(row, month, lostTokens, lostSeconds);
		// 条目月账与成员账同月同规则：跨月丢失维度标记未知，基线缺失亦然。
		const slug = await this.agentSlugOf(row.session_id);
		if (slug) await this.prepareAgentAdmission(slug, row, month, crossing, lostTokens, lostSeconds);
	}

	/** begin 的条目月账快照：prepareAdmission 前后各固定一份。回滚用它识别「本次 begin 引入的未知标记」，
	 * 数值列不参与（begin 不写数值，覆盖反而会抹掉其他成员的入账）。 */
	private async beginAgentMonths(
		slug: string | null,
		month: string,
		row: UsageLimitSession,
		available: { tokens: boolean; active_seconds: boolean },
	) {
		if (slug === null) return [];
		const entry = slug;
		const months = [...new Set([month, row.admission_month])].filter((value): value is string => value !== null);
		const before = await Promise.all(months.map((value) => this.agentTotals(entry, value)));
		await this.prepareAdmission(row, month, available);
		return Promise.all(
			months.map(async (value, index) => ({
				month: value,
				before: before[index]!,
				after: await this.agentTotals(entry, value),
			})),
		);
	}

	/** 仅明确未受理时恢复本次 begin 改动；不撤销此前采集的增量，恢复快照在 begin 事务内固定。 */
	private async restoreMemberMonth(
		memberId: string,
		month: string,
		totalsRow: Awaited<ReturnType<UsageAccountingService["totals"]>>,
	) {
		await this.db.write((manager) =>
			manager.upsert(
				KitUsageLimitMonthsEntity,
				{
					member_id: memberId,
					month,
					tokens: totalsRow.tokens,
					active_seconds: totalsRow.active_seconds,
					tokens_unknown: totalsRow.tokens_unknown,
					active_seconds_unknown: totalsRow.active_seconds_unknown,
				},
				["member_id", "month"],
			),
		);
	}

	/** 共享条目月账不能整行快照覆盖：begin 之后其他成员可能已入账。数值列不动，仅当未知标记
	 * 仍停留在本次 begin 提升后的值时回退；期间别人的保守提升（MAX 语义）一律保留。 */
	private async restoreAgentUnknown(
		slug: string,
		month: string,
		before: Awaited<ReturnType<UsageAccountingService["agentTotals"]>>,
		after: Awaited<ReturnType<UsageAccountingService["agentTotals"]>>,
	) {
		await this.db.write((manager) =>
			manager
				.createQueryBuilder()
				.update(KitUsageLimitAgentMonthsEntity)
				.set({
					tokens_unknown: () => "CASE WHEN tokens_unknown = :afterTokens THEN :beforeTokens ELSE tokens_unknown END",
					active_seconds_unknown: () =>
						"CASE WHEN active_seconds_unknown = :afterSeconds THEN :beforeSeconds ELSE active_seconds_unknown END",
				})
				.setParameters({
					afterTokens: after.tokens_unknown,
					beforeTokens: before.tokens_unknown,
					afterSeconds: after.active_seconds_unknown,
					beforeSeconds: before.active_seconds_unknown,
				})
				.where({ agent_slug: slug, month })
				.execute(),
		);
	}

	private async revertCommitted(
		input: { sessionId: string; key: string },
		row: UsageLimitSession,
		previousMonths: { month: string; totals: Awaited<ReturnType<UsageAccountingService["totals"]>> }[],
		slug: string | null,
		previousAgentMonths: {
			month: string;
			before: Awaited<ReturnType<UsageAccountingService["agentTotals"]>>;
			after: Awaited<ReturnType<UsageAccountingService["agentTotals"]>>;
		}[],
	) {
		const removed = await this.db.write((manager) =>
			manager.delete(KitUsageLimitRequestsEntity, {
				session_id: input.sessionId,
				request_key: input.key,
				status: "sending",
			}),
		);
		if (removed.affected !== 1) throw new KitError("conflict", "发送记录状态已变化");
		await this.db.write((manager) =>
			manager.update(
				KitUsageLimitSessionsEntity,
				{ session_id: row.session_id },
				{
					admission_month: row.admission_month,
					input_tokens: row.input_tokens,
					output_tokens: row.output_tokens,
					active_seconds: row.active_seconds,
				},
			),
		);
		for (const previous of previousMonths)
			await this.restoreMemberMonth(row.member_id, previous.month, previous.totals);
		if (!slug) return;
		for (const previous of previousAgentMonths)
			await this.restoreAgentUnknown(slug, previous.month, previous.before, previous.after);
	}

	private revertBegin(
		input: { sessionId: string; key: string },
		row: UsageLimitSession,
		previousMonths: { month: string; totals: Awaited<ReturnType<UsageAccountingService["totals"]>> }[],
		slug: string | null,
		previousAgentMonths: {
			month: string;
			before: Awaited<ReturnType<UsageAccountingService["agentTotals"]>>;
			after: Awaited<ReturnType<UsageAccountingService["agentTotals"]>>;
		}[],
	) {
		// 闭包不落库；进程在 POST 后退出时，持久 sending 继续保护未知结果。
		return () => this.db.transaction(() => this.revertCommitted(input, row, previousMonths, slug, previousAgentMonths));
	}

	/** 一次采集观测的全部记账：月账、条目月账、成员与条目逐日账（同事务），再由调用方推进会话基线。 */
	private async applyObservation(row: UsageLimitSession, next: ReturnType<typeof observation>, now: string) {
		const slug = await this.agentSlugOf(row.session_id);
		await this.addMonthly(row, next.tokenDelta, next.secondsDelta);
		// 模版月账与成员账同月同增量；会话条目缺失（不可归属）时不写模版账。
		if (slug && row.admission_month)
			await this.addAgentMonthly(slug, row.admission_month, next.tokenDelta, next.secondsDelta);
		// 逐日账与成员月账同规则（无受理月不计），归因到采集确认日；条目日账同步双写。
		if (row.admission_month)
			await this.addMemberDaily(row.member_id, now.slice(0, 10), next.tokenDelta, next.secondsDelta);
		if (slug && row.admission_month)
			await this.addAgentDaily(slug, now.slice(0, 10), next.tokenDelta, next.secondsDelta);
	}

	/** 模版条目逐日账趋势：与 summaryByTemplate 同一 join 口径（模版上架条目），自 fromDay 起逐日合计；
	 * templateId 为 null 时聚合全部模版条目，同一条目被多模版引用时会随各模版重复计入（与「全部=各模版求和」一致）。 */
	templateDailyUsage(templateId: string | null, fromDay: string) {
		return this.db.read((manager) =>
			templateDays(manager, templateId)
				.select("d.day", "day")
				.addSelect("SUM(d.tokens)", "tokens")
				.addSelect("SUM(d.active_seconds)", "active_seconds")
				.andWhere("d.day >= :fromDay", { fromDay })
				.groupBy("d.day")
				.orderBy("d.day", "ASC")
				.getRawMany<{ day: string; tokens: number; active_seconds: number }>(),
		);
	}

	/** 逐日账最早记录日（前端标注数据起点）；无记录为 null。 */
	async templateDailySince(templateId: string | null): Promise<string | null> {
		const row = await this.db.read((manager) =>
			templateDays(manager, templateId).select("MIN(d.day)", "since").getRawOne<{ since: string | null }>(),
		);
		return row?.since ?? null;
	}

	async prepare(memberId: string, now: string) {
		return this.db.transaction(async () => {
			await this.db.insertEntityIfAbsent(
				KitUsageLimitMembersEntity,
				{ member_id: memberId, accounting_started_at: now },
				["member_id"],
			);
			return this.db.write(async (manager) => {
				const missing = manager
					.createQueryBuilder(KitSessionsEntity, "s")
					.select(["s.session_id", "s.subject_id"])
					.leftJoin(KitUsageLimitSessionsEntity, "u", "u.session_id = s.session_id")
					.where({ subject_id: memberId, purpose: "experience" })
					.andWhere("u.session_id IS NULL");
				await manager
					.createQueryBuilder()
					.insert()
					.into(KitUsageLimitSessionsEntity, ["session_id", "member_id"])
					.valuesFromSelect(missing)
					.updateEntity(false)
					.execute();
				const row = await manager.findOneByOrFail(KitUsageLimitMembersEntity, { member_id: memberId });
				return row.accounting_started_at;
			});
		});
	}

	sessions(memberId: string) {
		return this.db.read((manager) =>
			manager.find(KitUsageLimitSessionsEntity, {
				where: { member_id: memberId },
				order: { session_id: "ASC" },
			}),
		) as Promise<UsageLimitSession[]>;
	}

	/** 模版准入的跨成员只读清单：该条目当月入账的全部会话（含其他成员，归属反查与 agentSlugOf 同口径）。 */
	templateSessions(slug: string, month: string) {
		return this.db.read((manager) =>
			manager
				.createQueryBuilder(KitUsageLimitSessionsEntity, "s")
				.leftJoin(KitSessionUsageEntity, "u", "u.session_id = s.session_id")
				.leftJoin(KitSessionsEntity, "i", "i.session_id = s.session_id AND i.purpose = 'experience'")
				.where({ admission_month: month })
				.andWhere("(u.agent_slug = :slug OR i.agent_slug = :slug)", { slug })
				.orderBy("s.session_id")
				.getMany(),
		) as Promise<UsageLimitSession[]>;
	}

	/** 模版准入补采的只读预览：按会话基线计算未入账增量与维度可用性，不写任何账本。 */
	previewDelta(row: UsageLimitSession, values: UsageObservation) {
		const next = observation(row, values);
		return {
			tokensKnown: next.tokensKnown,
			secondsKnown: next.secondsKnown,
			tokenDelta: next.tokenDelta,
			secondsDelta: next.secondsDelta,
		};
	}

	dailyUsage(memberId: string, fromDay: string): Promise<{ day: string; tokens: number; active_seconds: number }[]> {
		return this.db.read((manager) =>
			manager.find(KitUsageLimitDaysEntity, {
				select: { day: true, ...dayColumns },
				where: { member_id: memberId, day: MoreThanOrEqual(fromDay) },
				order: { day: "ASC" },
			}),
		);
	}

	async observe(sessionId: string, values: UsageObservation, now: string) {
		return await this.db.transaction(async () => {
			const row = await this.session(sessionId);
			if (!row) throw new KitError("not_found", "会话用量基线不存在");
			const next = observation(row, values);
			await this.applyObservation(row, next, now);
			await this.db.write((manager) =>
				manager.update(
					KitUsageLimitSessionsEntity,
					{ session_id: sessionId },
					{
						input_tokens: next.input,
						output_tokens: next.output,
						active_seconds: next.seconds,
						captured_at: next.tokensKnown && next.secondsKnown ? now : row.captured_at,
					},
				),
			);
			return { tokens: next.tokensKnown, active_seconds: next.secondsKnown };
		});
	}

	async request(sessionId: string, key: string) {
		const row = await this.db.read((manager) =>
			manager.findOneBy(KitUsageLimitRequestsEntity, { session_id: sessionId, request_key: key }),
		);
		return (row ?? undefined) as UsageLimitRequest | undefined;
	}

	pending(memberId: string) {
		return this.db.read((manager) =>
			manager.find(KitUsageLimitRequestsEntity, {
				where: { member_id: memberId, status: Not("settled") },
				order: { created_at: "ASC" },
			}),
		) as Promise<UsageLimitRequest[]>;
	}

	async begin(input: {
		sessionId: string;
		memberId: string;
		key: string;
		hash: string;
		month: string;
		previousStatus: string | null;
		now: string;
		continuation?: boolean;
		available: { tokens: boolean; active_seconds: boolean };
	}) {
		return await this.db.transaction(async () => {
			await this.db.write((manager) =>
				manager.insert(KitUsageLimitRequestsEntity, {
					session_id: input.sessionId,
					request_key: input.key,
					member_id: input.memberId,
					request_hash: input.hash,
					status: "sending",
					previous_status: input.previousStatus,
					created_at: input.now,
				}),
			);
			const row = await this.session(input.sessionId);
			if (!row) throw new KitError("not_found", "会话用量基线不存在");
			const month = input.continuation ? (row.admission_month ?? input.month) : input.month;
			const previousMonths = await Promise.all(
				[...new Set([month, row.admission_month])]
					.filter((value): value is string => value !== null)
					.map(async (value) => ({ month: value, totals: await this.totals(row.member_id, value) })),
			);
			// 条目月账是跨成员共享账本：begin 前后各固定一份快照，回滚只回退未知标记（restoreAgentUnknown）。
			const slug = await this.agentSlugOf(input.sessionId);
			const previousAgentMonths = await this.beginAgentMonths(slug, month, row, input.available);
			// 成员锁覆盖 POST；仅明确未受理时恢复本次 begin 改动，不撤销此前采集的增量。
			// 闭包不落库；进程在 POST 后退出时，持久 sending 继续保护未知结果。
			return this.revertBegin(input, row, previousMonths, slug, previousAgentMonths);
		});
	}

	async accepted(sessionId: string, key: string, eventIds: string[]) {
		await this.db.write((manager) =>
			manager.update(
				KitUsageLimitRequestsEntity,
				{ session_id: sessionId, request_key: key },
				{ status: "accepted", event_ids: JSON.stringify(eventIds) },
			),
		);
	}

	async uncertain(sessionId: string, key: string) {
		await this.db.write((manager) =>
			manager.update(KitUsageLimitRequestsEntity, { session_id: sessionId, request_key: key }, { status: "uncertain" }),
		);
	}

	async settle(sessionId: string, key: string) {
		await this.db.write((manager) =>
			manager.update(KitUsageLimitRequestsEntity, { session_id: sessionId, request_key: key }, { status: "settled" }),
		);
	}
}
