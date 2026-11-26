import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
	KitError,
	PLAZA_CATEGORY_LABELS,
	type PlazaCategory,
	type PlazaView,
	type QuotaOverrideView,
	type QuotaPackView,
	type QuotaPolicyView,
	type QuotaRequestView,
	type QuotaUsageRow,
	type QuotaView,
} from "@openagentkit/sdk/protocol";
import { QuotaOverrideEntity } from "../../../entity/tables/quota-override.entity.ts";
import { QuotaPackEntity } from "../../../entity/tables/quota-pack.entity.ts";
import { QuotaPolicyEntity } from "../../../entity/tables/quota-policy.entity.ts";
import { QuotaRequestEntity } from "../../../entity/tables/quota-request.entity.ts";
import { UsageTurnsEntity } from "../../../entity/tables/usage-turns.entity.ts";
import { StoreDatabase } from "../../../store/database.ts";
import { dayKey, daysAgoKey, monthKey, resetAtFor } from "../../../utils/utc-dates.ts";
import { AuditService } from "../audit.ts";
import { CatalogService } from "../catalog.ts";
import { SessionIndexService } from "../session/session-index.ts";
import { UsageLimitService } from "./usage-limits.ts";

interface QuotaPolicyRow {
	monthly_credits: number;
	updated_at: string | null;
	updated_by: string | null;
}

interface QuotaOverrideRow {
	subject_id: string;
	monthly_credits: number;
	reason: string | null;
	updated_by: string;
	updated_at: string;
}

interface QuotaPackRow {
	id: string;
	subject_id: string;
	month: string;
	credits: number;
	reason: string | null;
	granted_by: string;
	created_at: string;
}

interface QuotaRequestRow {
	id: string;
	subject_id: string;
	requested_credits: number;
	reason: string | null;
	status: "pending" | "approved" | "rejected";
	mode: "override" | "pack" | null;
	granted_credits: number | null;
	review_note: string | null;
	reviewed_by: string | null;
	created_at: string;
	reviewed_at: string | null;
}

export interface QuotaState {
	month: string;
	reset_at: string;
	unlimited: boolean;
	base_limit: number;
	override_limit: number | null;
	packs: QuotaPackView[];
	limit: number;
	used: number;
	remaining: number;
}

function packView(row: QuotaPackRow): QuotaPackView {
	return {
		id: row.id,
		month: row.month,
		credits: row.credits,
		...(row.reason ? { reason: row.reason } : {}),
		granted_by: row.granted_by,
		created_at: row.created_at,
	};
}

function requestView(row: QuotaRequestRow): QuotaRequestView {
	return {
		id: row.id,
		subject_id: row.subject_id,
		requested_credits: row.requested_credits,
		...(row.reason ? { reason: row.reason } : {}),
		status: row.status,
		mode: row.mode,
		granted_credits: row.granted_credits,
		...(row.review_note ? { review_note: row.review_note } : {}),
		...(row.reviewed_by ? { reviewed_by: row.reviewed_by } : {}),
		created_at: row.created_at,
		...(row.reviewed_at ? { reviewed_at: row.reviewed_at } : {}),
	};
}

/** 审批入参闸门：通过必须二选一生效方式；驳回必须给理由（员工端可见）。 */
function assertReviewInput(input: { action: "approve" | "reject"; mode?: "override" | "pack"; note?: string }) {
	if (input.action === "approve" && !input.mode) {
		throw new KitError(
			"invalid_request",
			"通过申请必须二选一生效方式：mode=override（长期上限）或 mode=pack（当月加油包）",
		);
	}
	if (input.action === "reject" && !input.note?.trim()) {
		throw new KitError("invalid_request", "驳回必须填写理由（note），员工端会看到");
	}
}

/**
 * Credits 用量服务：限额解析（override > policy，packs 叠加）、send 受理点扣费、
 * 广场视图、员工申请与管理端审批闭环。
 * 红线：扣费只发生在「服务端接受发消息请求」这一个点；前端永远不自算余额。
 */
@Injectable()
export class QuotaService {
	constructor(
		@Inject(StoreDatabase) private readonly db: StoreDatabase,
		@Inject(CatalogService) private readonly catalog: CatalogService,
		@Inject(SessionIndexService) private readonly sessionIndex: SessionIndexService,
		@Inject(AuditService) private readonly audit: AuditService,
		@Inject(UsageLimitService) private readonly usageLimits: UsageLimitService,
	) {}

	async stateFor(subjectId: string, now = new Date()): Promise<QuotaState> {
		const month = monthKey(now);
		const policy = await this.getPolicy();
		const override = await this.getOverride(subjectId);
		const limit = override?.monthly_credits ?? policy.monthly_credits;
		const packs = (await this.listPacks(subjectId, month)).map(packView);
		const packTotal = packs.reduce((sum, p) => sum + p.credits, 0);
		const used = await this.usedForMonth(subjectId, month);
		const unlimited = limit === -1;
		return {
			month,
			reset_at: resetAtFor(month),
			unlimited,
			base_limit: policy.monthly_credits,
			override_limit: override?.monthly_credits ?? null,
			packs,
			limit,
			used,
			remaining: unlimited ? -1 : limit + packTotal - used,
		};
	}

	/**
	 * send 受理点扣费：先挡超限（403 `quota_exceeded`，不写账本），再幂等插账本。
	 * 带 `client_message_id` 的重放（同 turn 重试）不重复扣、也不因已耗尽而误拒。
	 */
	async chargeTurn(input: {
		subjectId: string;
		agentSlug: string;
		sessionId: string;
		clientMessageId?: string;
		enforceLimit?: boolean;
	}) {
		await this.db.transaction(async () => {
			const now = new Date();
			if (input.clientMessageId && (await this.turnExists(input.sessionId, input.clientMessageId))) return;
			const state = await this.stateFor(input.subjectId, now);
			if (input.enforceLimit !== false && !state.unlimited && state.remaining < 1) {
				throw new KitError(
					"quota_exceeded",
					`本月 Credits 已用完（${state.used}/${state.limit}），可到「我的用量」申请提额，或等待 ${state.reset_at.slice(0, 10)} 重置`,
					{
						details: {
							month: state.month,
							limit: state.limit,
							used: state.used,
							remaining: state.remaining,
							reset_at: state.reset_at,
						},
					},
				);
			}
			await this.recordTurn({
				subjectId: input.subjectId,
				agentSlug: input.agentSlug,
				sessionId: input.sessionId,
				...(input.clientMessageId ? { clientMessageId: input.clientMessageId } : {}),
				day: dayKey(now),
				month: state.month,
			});
		});
	}

	async plazaView(subjectId: string, query: { category?: PlazaCategory; q?: string } = {}): Promise<PlazaView> {
		const now = new Date();
		const listed = await this.catalog.listed();
		const mineSessions = await this.sessionIndex.listForSubject(subjectId, { limit: 1000 });
		const mine = new Map<string, string>();
		for (const s of mineSessions) {
			const at = s.last_event_at ?? s.created_at;
			const prev = mine.get(s.agent_slug);
			if (!prev || at > prev) mine.set(s.agent_slug, at);
		}
		const turns30 = new Map((await this.turns30dByAgent(daysAgoKey(now, 29))).map((r) => [r.agent_slug, r.turns]));

		const entries = listed.map((agent) => ({
			...agent,
			// AgentSummary 契约里 capabilities 必填；目录视图里是可选（历史行兜底全开）
			capabilities: agent.capabilities ?? {
				streaming: true,
				fileUpload: true,
				artifacts: true,
				threads: true,
				reasoning: true,
			},
			stats: {
				mine: mine.has(agent.slug),
				turns_30d: turns30.get(agent.slug) ?? 0,
				...(mine.get(agent.slug) ? { last_used_at: mine.get(agent.slug) } : {}),
			},
		}));

		const categories = (Object.keys(PLAZA_CATEGORY_LABELS) as PlazaCategory[]).map((id) => ({
			id,
			name: PLAZA_CATEGORY_LABELS[id],
			count: listed.filter((a) => a.category === id).length,
		}));

		const keyword = query.q?.trim().toLowerCase();
		const agents = entries.filter((entry) => {
			if (query.category && entry.category !== query.category) return false;
			if (!keyword) return true;
			return [entry.slug, entry.display_name, entry.description ?? ""].some((field) =>
				field.toLowerCase().includes(keyword as string),
			);
		});

		const featured = listed.filter((a) => a.featured).map((a) => a.slug);
		const withUsage = entries.filter((e) => e.stats.turns_30d > 0);
		const popularSource = withUsage.length > 0 ? withUsage : entries;
		const popular = [...popularSource]
			.sort((a, b) => b.stats.turns_30d - a.stats.turns_30d || a.ordering - b.ordering)
			.slice(0, 5)
			.map((e) => e.slug);

		return { agents, featured, popular, categories };
	}

	async quotaView(subjectId: string, days = 30): Promise<QuotaView> {
		const now = new Date();
		const state = await this.stateFor(subjectId, now);
		const fromDay = daysAgoKey(now, days - 1);
		const dailyMap = new Map((await this.dailyTurns(subjectId, fromDay)).map((r) => [r.day, r.turns]));
		const daily: { day: string; turns: number }[] = [];
		for (let i = days - 1; i >= 0; i--) {
			const day = daysAgoKey(now, i);
			daily.push({ day, turns: dailyMap.get(day) ?? 0 });
		}
		const pending = await this.pendingRequest(subjectId);
		return {
			month: state.month,
			reset_at: state.reset_at,
			unlimited: state.unlimited,
			base_limit: state.base_limit,
			override_limit: state.override_limit,
			packs: state.packs,
			limit: state.limit,
			used: state.used,
			remaining: state.remaining,
			per_agent: await this.turnsByAgentForMonth(subjectId, state.month),
			daily,
			pending_request: pending ? requestView(pending) : null,
		};
	}

	async kitQuotaView(subjectId: string, days?: number): Promise<QuotaView> {
		const view = await this.quotaView(subjectId, days);
		// 本地成员使用 Token 与执行时长限额，Credits 接口保留历史 Turn 统计。
		if (!(await this.usageLimits.isMember(subjectId))) return view;
		return {
			...view,
			unlimited: true,
			base_limit: -1,
			override_limit: null,
			packs: [],
			limit: -1,
			remaining: -1,
			pending_request: null,
		};
	}

	async createRequest(
		subjectId: string,
		input: { requestedCredits: number; reason?: string },
	): Promise<QuotaRequestView> {
		if (await this.pendingRequest(subjectId)) {
			throw new KitError("request_pending", "已有一条待审批的提额申请，请等审批完成后再提交");
		}
		const row = await this.insertRequest({
			id: `qr_${randomUUID().slice(0, 8)}`,
			subjectId,
			requestedCredits: input.requestedCredits,
			...(input.reason ? { reason: input.reason } : {}),
		});
		await this.audit.append({
			subject: `user:${subjectId}`,
			action: "quota.request.create",
			target: row.id,
			detail: { requested_credits: input.requestedCredits },
		});
		return requestView(row);
	}

	async myRequests(subjectId: string): Promise<QuotaRequestView[]> {
		return (await this.listRequestsForSubject(subjectId)).map(requestView);
	}

	/** ---- 管理端 ---- */
	async policy(): Promise<QuotaPolicyView> {
		const row = await this.getPolicy();
		return {
			monthly_credits: row.monthly_credits,
			...(row.updated_at ? { updated_at: row.updated_at } : {}),
			...(row.updated_by ? { updated_by: row.updated_by } : {}),
		};
	}

	async putPolicy(monthlyCredits: number, by: string): Promise<QuotaPolicyView> {
		const row = await this.setPolicy(monthlyCredits, by);
		await this.audit.append({ subject: by, action: "quota.policy.put", detail: { monthly_credits: monthlyCredits } });
		return {
			monthly_credits: row.monthly_credits,
			...(row.updated_at ? { updated_at: row.updated_at } : {}),
			...(row.updated_by ? { updated_by: row.updated_by } : {}),
		};
	}

	async overrides(): Promise<QuotaOverrideView[]> {
		const month = monthKey(new Date());
		return Promise.all(
			(await this.listOverrides()).map(async (row) => {
				const packs = (await this.listPacks(row.subject_id, month)).map(packView);
				const packTotal = packs.reduce((sum, p) => sum + p.credits, 0);
				const used = await this.usedForMonth(row.subject_id, month);
				return {
					subject_id: row.subject_id,
					monthly_credits: row.monthly_credits,
					...(row.reason ? { reason: row.reason } : {}),
					updated_by: row.updated_by,
					updated_at: row.updated_at,
					used,
					packs,
					remaining: row.monthly_credits === -1 ? -1 : row.monthly_credits + packTotal - used,
				};
			}),
		);
	}

	async putOverride(
		input: { subjectId: string; monthlyCredits: number; reason?: string },
		by: string,
	): Promise<QuotaOverrideView> {
		const row = await this.setOverride({
			subjectId: input.subjectId,
			monthlyCredits: input.monthlyCredits,
			...(input.reason ? { reason: input.reason } : {}),
			by,
		});
		await this.audit.append({
			subject: by,
			action: "quota.override.put",
			target: input.subjectId,
			detail: { monthly_credits: input.monthlyCredits },
		});
		return (
			(await this.overrides()).find((o) => o.subject_id === input.subjectId) ?? {
				subject_id: row.subject_id,
				monthly_credits: row.monthly_credits,
				...(row.reason ? { reason: row.reason } : {}),
				updated_by: row.updated_by,
				updated_at: row.updated_at,
				used: 0,
				packs: [],
				remaining: row.monthly_credits,
			}
		);
	}

	async deleteOverride(subjectId: string, by: string): Promise<boolean> {
		const removed = await this.removeOverride(subjectId);
		if (removed) await this.audit.append({ subject: by, action: "quota.override.delete", target: subjectId });
		return removed;
	}

	async createPack(input: { subjectId: string; credits: number; reason?: string }, by: string): Promise<QuotaPackView> {
		const row = await this.addPack({
			id: `qp_${randomUUID().slice(0, 8)}`,
			subjectId: input.subjectId,
			month: monthKey(new Date()),
			credits: input.credits,
			...(input.reason ? { reason: input.reason } : {}),
			by,
		});
		await this.audit.append({
			subject: by,
			action: "quota.pack.create",
			target: input.subjectId,
			detail: { credits: input.credits, month: row.month },
		});
		return packView(row);
	}

	async deletePack(id: string, by: string): Promise<boolean> {
		const removed = await this.removePack(id);
		if (removed) await this.audit.append({ subject: by, action: "quota.pack.delete", target: id });
		return removed;
	}

	async requests(status?: "pending" | "approved" | "rejected"): Promise<QuotaRequestView[]> {
		return (await this.listRequests(status)).map(requestView);
	}

	async review(
		id: string,
		input: { action: "approve" | "reject"; mode?: "override" | "pack"; grantedCredits?: number; note?: string },
		by: string,
	): Promise<QuotaRequestView> {
		return this.db.transaction(async () => {
			const current = await this.getRequest(id);
			if (!current) throw new KitError("not_found", "申请不存在");
			if (current.status !== "pending") throw new KitError("conflict", "该申请已审批过，不能重复处理");
			assertReviewInput(input);
			const granted = input.grantedCredits ?? current.requested_credits;
			if (input.action === "approve") await this.applyApproval(current, input.mode as "override" | "pack", granted, by);
			return this.finalizeReview(id, input, granted, by);
		});
	}

	async usage(month?: string): Promise<QuotaUsageRow[]> {
		const key = month ?? monthKey(new Date());
		const policy = await this.getPolicy();
		return Promise.all(
			(await this.subjectUsageForMonth(key)).map(async (row) => {
				const override = await this.getOverride(row.subject_id);
				const limit = override?.monthly_credits ?? policy.monthly_credits;
				const packTotal = (await this.listPacks(row.subject_id, key)).reduce((sum, p) => sum + p.credits, 0);
				return {
					subject_id: row.subject_id,
					used: row.used,
					limit,
					remaining: limit === -1 ? -1 : limit + packTotal - row.used,
				};
			}),
		);
	}

	/** 审批通过的副作用：override=覆盖长期上限；pack=当月加油包（月底失效）。 */
	private async applyApproval(
		current: { id: string; subject_id: string },
		mode: "override" | "pack",
		granted: number,
		by: string,
	) {
		if (mode === "override") {
			await this.setOverride({
				subjectId: current.subject_id,
				monthlyCredits: granted,
				reason: `批准申请 ${current.id}`,
				by,
			});
			return;
		}
		await this.addPack({
			id: `qp_${randomUUID().slice(0, 8)}`,
			subjectId: current.subject_id,
			month: monthKey(new Date()),
			credits: granted,
			reason: `批准申请 ${current.id}`,
			by,
		});
	}

	private async finalizeReview(
		id: string,
		input: { action: "approve" | "reject"; mode?: "override" | "pack"; note?: string },
		granted: number,
		by: string,
	): Promise<QuotaRequestView> {
		const row = await this.reviewRequest({
			id,
			status: input.action === "approve" ? "approved" : "rejected",
			...(input.action === "approve" ? { mode: input.mode, grantedCredits: granted } : {}),
			...(input.note ? { note: input.note } : {}),
			by,
		});
		await this.audit.append({
			subject: by,
			action: `quota.request.${input.action}`,
			target: id,
			detail: {
				...(input.mode ? { mode: input.mode } : {}),
				granted_credits: input.action === "approve" ? granted : null,
			},
		});
		return requestView(row);
	}

	private async getPolicy(): Promise<QuotaPolicyRow> {
		const row = await this.db.read((manager) =>
			manager.findOne(QuotaPolicyEntity, {
				select: { monthly_credits: true, updated_at: true, updated_by: true },
				where: { id: 1 },
			}),
		);
		if (row) return row;
		// 手工移除种子行后，下一次读取重建默认策略。
		await this.db.insertEntityIfAbsent(QuotaPolicyEntity, { id: 1, monthly_credits: 200 }, ["id"]);
		return { monthly_credits: 200, updated_at: null, updated_by: null };
	}

	private async setPolicy(monthlyCredits: number, by: string) {
		await this.db.write((manager) =>
			manager.update(
				QuotaPolicyEntity,
				{ id: 1 },
				{
					monthly_credits: monthlyCredits,
					updated_at: new Date().toISOString(),
					updated_by: by,
				},
			),
		);
		return this.getPolicy();
	}

	private async getOverride(subjectId: string) {
		return this.db.read((manager) =>
			manager.findOneBy(QuotaOverrideEntity, { subject_id: subjectId }),
		) as Promise<QuotaOverrideRow | null>;
	}

	private async setOverride(input: { subjectId: string; monthlyCredits: number; reason?: string; by: string }) {
		await this.db.write((manager) =>
			manager.upsert(
				QuotaOverrideEntity,
				{
					subject_id: input.subjectId,
					monthly_credits: input.monthlyCredits,
					reason: input.reason ?? null,
					updated_by: input.by,
					updated_at: new Date().toISOString(),
				},
				["subject_id"],
			),
		);
		return (await this.getOverride(input.subjectId)) as QuotaOverrideRow;
	}

	private async removeOverride(subjectId: string) {
		const result = await this.db.write((manager) => manager.delete(QuotaOverrideEntity, { subject_id: subjectId }));
		return (result.affected ?? 0) > 0;
	}

	private listOverrides() {
		return this.db.read((manager) => manager.find(QuotaOverrideEntity, { order: { updated_at: "DESC" } })) as Promise<
			QuotaOverrideRow[]
		>;
	}

	private listPacks(subjectId: string, month: string) {
		return this.db.read((manager) =>
			manager.find(QuotaPackEntity, {
				where: { subject_id: subjectId, month },
				order: { created_at: "ASC" },
			}),
		) as Promise<QuotaPackRow[]>;
	}

	private async addPack(input: {
		id: string;
		subjectId: string;
		month: string;
		credits: number;
		reason?: string;
		by: string;
	}) {
		const row: QuotaPackRow = {
			id: input.id,
			subject_id: input.subjectId,
			month: input.month,
			credits: input.credits,
			reason: input.reason ?? null,
			granted_by: input.by,
			created_at: new Date().toISOString(),
		};
		await this.db.write((manager) => manager.insert(QuotaPackEntity, row));
		return row;
	}

	private async removePack(id: string) {
		const result = await this.db.write((manager) => manager.delete(QuotaPackEntity, { id }));
		return (result.affected ?? 0) > 0;
	}

	/** 重试幂等探针：同一会话内的消息是否已扣费。 */
	private turnExists(sessionId: string, clientMessageId: string) {
		return this.db.read((manager) =>
			manager.existsBy(UsageTurnsEntity, { session_id: sessionId, client_message_id: clientMessageId }),
		);
	}

	/** 每个受理 Turn 扣一次；重复消息保留第一次入账。 */
	private recordTurn(input: {
		subjectId: string;
		agentSlug: string;
		sessionId: string;
		clientMessageId?: string;
		day: string;
		month: string;
	}): Promise<boolean> {
		return this.db.insertEntityIfAbsent(
			UsageTurnsEntity,
			{
				subject_id: input.subjectId,
				agent_slug: input.agentSlug,
				session_id: input.sessionId,
				client_message_id: input.clientMessageId ?? null,
				day: input.day,
				month: input.month,
				created_at: new Date().toISOString(),
			},
			[],
		);
	}

	private usedForMonth(subjectId: string, month: string) {
		return this.db.read((manager) => manager.countBy(UsageTurnsEntity, { subject_id: subjectId, month }));
	}

	private turnsByAgentForMonth(subjectId: string, month: string) {
		return this.db.read((manager) =>
			manager
				.createQueryBuilder(UsageTurnsEntity, "u")
				.select("u.agent_slug", "agent_slug")
				.addSelect("COUNT(*)", "turns")
				.where({ subject_id: subjectId, month })
				.groupBy("u.agent_slug")
				.orderBy("turns", "DESC")
				.getRawMany<{ agent_slug: string; turns: number }>(),
		);
	}

	private dailyTurns(subjectId: string, fromDay: string) {
		return this.db.read((manager) =>
			manager
				.createQueryBuilder(UsageTurnsEntity, "u")
				.select("u.day", "day")
				.addSelect("COUNT(*)", "turns")
				.where({ subject_id: subjectId })
				.andWhere("u.day >= :fromDay", { fromDay })
				.groupBy("u.day")
				.orderBy("u.day", "ASC")
				.getRawMany<{ day: string; turns: number }>(),
		);
	}

	/** 广场「同学们都在用」统计跨成员的近 30 天 Turn 数。 */
	private turns30dByAgent(fromDay: string) {
		return this.db.read((manager) =>
			manager
				.createQueryBuilder(UsageTurnsEntity, "u")
				.select("u.agent_slug", "agent_slug")
				.addSelect("COUNT(*)", "turns")
				.where("u.day >= :fromDay", { fromDay })
				.groupBy("u.agent_slug")
				.orderBy("turns", "DESC")
				.getRawMany<{ agent_slug: string; turns: number }>(),
		);
	}

	private subjectUsageForMonth(month: string) {
		return this.db.read((manager) =>
			manager
				.createQueryBuilder(UsageTurnsEntity, "u")
				.select("u.subject_id", "subject_id")
				.addSelect("COUNT(*)", "used")
				.where({ month })
				.groupBy("u.subject_id")
				.orderBy("used", "DESC")
				.getRawMany<{ subject_id: string; used: number }>(),
		);
	}

	private async insertRequest(input: { id: string; subjectId: string; requestedCredits: number; reason?: string }) {
		await this.db.write((manager) =>
			manager.insert(QuotaRequestEntity, {
				id: input.id,
				subject_id: input.subjectId,
				requested_credits: input.requestedCredits,
				reason: input.reason ?? null,
				status: "pending",
				created_at: new Date().toISOString(),
			}),
		);
		return (await this.getRequest(input.id)) as QuotaRequestRow;
	}

	private getRequest(id: string) {
		return this.db.read((manager) => manager.findOneBy(QuotaRequestEntity, { id })) as Promise<QuotaRequestRow | null>;
	}

	private pendingRequest(subjectId: string) {
		return this.db.read((manager) =>
			manager.findOne(QuotaRequestEntity, {
				where: { subject_id: subjectId, status: "pending" },
				order: { created_at: "DESC" },
			}),
		) as Promise<QuotaRequestRow | null>;
	}

	private listRequestsForSubject(subjectId: string) {
		return this.db.read((manager) =>
			manager.find(QuotaRequestEntity, {
				where: { subject_id: subjectId },
				order: { created_at: "DESC" },
			}),
		) as Promise<QuotaRequestRow[]>;
	}

	private listRequests(status?: "pending" | "approved" | "rejected") {
		return this.db.read((manager) =>
			manager.find(QuotaRequestEntity, {
				where: status ? { status } : {},
				order: { created_at: "DESC" },
			}),
		) as Promise<QuotaRequestRow[]>;
	}

	private async reviewRequest(input: {
		id: string;
		status: "approved" | "rejected";
		mode?: "override" | "pack";
		grantedCredits?: number;
		note?: string;
		by: string;
	}) {
		await this.db.write((manager) =>
			manager.update(
				QuotaRequestEntity,
				{ id: input.id },
				{
					status: input.status,
					mode: input.mode ?? null,
					granted_credits: input.grantedCredits ?? null,
					review_note: input.note ?? null,
					reviewed_by: input.by,
					reviewed_at: new Date().toISOString(),
				},
			),
		);
		return (await this.getRequest(input.id)) as QuotaRequestRow;
	}
}
