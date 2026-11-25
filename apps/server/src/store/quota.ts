import type { StoreDatabase } from "./database.ts";

/**
 * Credits 用量与提额审批的存储层（node:sqlite，见 migration 003）。
 * 不变量：
 * - `usage_turns` 是扣费账本（1 行 = 1 个被受理的 Turn），**不存事件正文**；
 * - 重试通过 `(session_id, client_message_id)` 的唯一性去重。
 * - 月/日键由 service 以 UTC 计算后传入，存储层不做时间运算。
 */

export interface QuotaPolicyRow {
	monthly_credits: number;
	updated_at: string | null;
	updated_by: string | null;
}

export interface QuotaOverrideRow {
	subject_id: string;
	monthly_credits: number;
	reason: string | null;
	updated_by: string;
	updated_at: string;
}

export interface QuotaPackRow {
	id: string;
	subject_id: string;
	month: string;
	credits: number;
	reason: string | null;
	granted_by: string;
	created_at: string;
}

export interface QuotaRequestRow {
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

export function createQuotaStore(db: StoreDatabase) {
	return {
		transaction: db.transaction,
		async getPolicy(): Promise<QuotaPolicyRow> {
			const row = (await db.get("SELECT monthly_credits, updated_at, updated_by FROM quota_policy WHERE id = 1")) as
				| QuotaPolicyRow
				| undefined;
			if (row) return row;
			// 迁移种子行缺失（极端：手工删库）时兜底重建，避免 get 返回 undefined 炸路由
			await db.insertIfAbsent("INSERT INTO quota_policy (id, monthly_credits) VALUES (1, 200)", "id");
			return { monthly_credits: 200, updated_at: null, updated_by: null };
		},
		async setPolicy(monthlyCredits: number, by: string) {
			await db.run(
				"UPDATE quota_policy SET monthly_credits = ?, updated_at = ?, updated_by = ? WHERE id = 1",
				monthlyCredits,
				new Date().toISOString(),
				by,
			);
			return await this.getPolicy();
		},

		async getOverride(subjectId: string): Promise<QuotaOverrideRow | null> {
			return (
				((await db.get("SELECT * FROM quota_override WHERE subject_id = ?", subjectId)) as
					| QuotaOverrideRow
					| undefined) ?? null
			);
		},
		async setOverride(input: { subjectId: string; monthlyCredits: number; reason?: string; by: string }) {
			await db.upsert(
				`INSERT INTO quota_override (subject_id, monthly_credits, reason, updated_by, updated_at)
				 VALUES (?,?,?,?,?)`,
				"subject_id",
				`monthly_credits = excluded.monthly_credits,
				   reason = excluded.reason, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
				input.subjectId,
				input.monthlyCredits,
				input.reason ?? null,
				input.by,
				new Date().toISOString(),
			);
			return (await this.getOverride(input.subjectId)) as QuotaOverrideRow;
		},
		async deleteOverride(subjectId: string): Promise<boolean> {
			return (await db.run("DELETE FROM quota_override WHERE subject_id = ?", subjectId)).changes > 0;
		},
		async listOverrides(): Promise<QuotaOverrideRow[]> {
			return (await db.all("SELECT * FROM quota_override ORDER BY updated_at DESC")) as unknown as QuotaOverrideRow[];
		},

		async listPacks(subjectId: string, month: string): Promise<QuotaPackRow[]> {
			return (await db.all(
				"SELECT * FROM quota_pack WHERE subject_id = ? AND month = ? ORDER BY created_at ASC",
				subjectId,
				month,
			)) as unknown as QuotaPackRow[];
		},
		async addPack(input: {
			id: string;
			subjectId: string;
			month: string;
			credits: number;
			reason?: string;
			by: string;
		}) {
			const createdAt = new Date().toISOString();
			await db.run(
				"INSERT INTO quota_pack (id, subject_id, month, credits, reason, granted_by, created_at) VALUES (?,?,?,?,?,?,?)",
				input.id,
				input.subjectId,
				input.month,
				input.credits,
				input.reason ?? null,
				input.by,
				createdAt,
			);
			return {
				id: input.id,
				subject_id: input.subjectId,
				month: input.month,
				credits: input.credits,
				reason: input.reason ?? null,
				granted_by: input.by,
				created_at: createdAt,
			} as QuotaPackRow;
		},
		async deletePack(id: string): Promise<boolean> {
			return (await db.run("DELETE FROM quota_pack WHERE id = ?", id)).changes > 0;
		},

		/** 重试幂等探针：同一 (session, client_message_id) 是否已扣过费。 */
		async turnExists(sessionId: string, clientMessageId: string): Promise<boolean> {
			return (
				(await db.get(
					"SELECT 1 FROM usage_turns WHERE session_id = ? AND client_message_id = ?",
					sessionId,
					clientMessageId,
				)) !== undefined
			);
		},
		/** 扣 1 个 Turn；返回 false 表示幂等重放（已扣过，不重复计）。 */
		async chargeTurn(input: {
			subjectId: string;
			agentSlug: string;
			sessionId: string;
			clientMessageId?: string;
			day: string;
			month: string;
		}): Promise<boolean> {
			const result = await db.insertIfAbsent(
				`INSERT INTO usage_turns (subject_id, agent_slug, session_id, client_message_id, day, month, created_at)
					 VALUES (?,?,?,?,?,?,?)`,
				"",
				input.subjectId,
				input.agentSlug,
				input.sessionId,
				input.clientMessageId ?? null,
				input.day,
				input.month,
				new Date().toISOString(),
			);
			return result.changes > 0;
		},
		async usedForMonth(subjectId: string, month: string): Promise<number> {
			const row = (await db.get(
				"SELECT COUNT(*) AS n FROM usage_turns WHERE subject_id = ? AND month = ?",
				subjectId,
				month,
			)) as { n: number };
			return row.n;
		},
		async turnsByAgentForMonth(subjectId: string, month: string): Promise<{ agent_slug: string; turns: number }[]> {
			return (await db.all(
				"SELECT agent_slug, COUNT(*) AS turns FROM usage_turns WHERE subject_id = ? AND month = ? GROUP BY agent_slug ORDER BY turns DESC",
				subjectId,
				month,
			)) as unknown as { agent_slug: string; turns: number }[];
		},
		async dailyTurns(subjectId: string, fromDay: string): Promise<{ day: string; turns: number }[]> {
			return (await db.all(
				"SELECT day, COUNT(*) AS turns FROM usage_turns WHERE subject_id = ? AND day >= ? GROUP BY day ORDER BY day ASC",
				subjectId,
				fromDay,
			)) as unknown as { day: string; turns: number }[];
		},
		/** 广场「同学们都在用」：近 30 天全局 turn 数（跨 subject）。 */
		async turns30dByAgent(fromDay: string): Promise<{ agent_slug: string; turns: number }[]> {
			return (await db.all(
				"SELECT agent_slug, COUNT(*) AS turns FROM usage_turns WHERE day >= ? GROUP BY agent_slug ORDER BY turns DESC",
				fromDay,
			)) as unknown as { agent_slug: string; turns: number }[];
		},
		async subjectUsageForMonth(month: string): Promise<{ subject_id: string; used: number }[]> {
			return (await db.all(
				"SELECT subject_id, COUNT(*) AS used FROM usage_turns WHERE month = ? GROUP BY subject_id ORDER BY used DESC",
				month,
			)) as unknown as { subject_id: string; used: number }[];
		},

		async createRequest(input: { id: string; subjectId: string; requestedCredits: number; reason?: string }) {
			const createdAt = new Date().toISOString();
			await db.run(
				`INSERT INTO quota_request (id, subject_id, requested_credits, reason, status, created_at)
				 VALUES (?,?,?,?, 'pending', ?)`,
				input.id,
				input.subjectId,
				input.requestedCredits,
				input.reason ?? null,
				createdAt,
			);
			return (await this.getRequest(input.id)) as QuotaRequestRow;
		},
		async getRequest(id: string): Promise<QuotaRequestRow | null> {
			return ((await db.get("SELECT * FROM quota_request WHERE id = ?", id)) as QuotaRequestRow | undefined) ?? null;
		},
		async pendingRequest(subjectId: string): Promise<QuotaRequestRow | null> {
			return (
				((await db.get(
					"SELECT * FROM quota_request WHERE subject_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
					subjectId,
				)) as QuotaRequestRow | undefined) ?? null
			);
		},
		async listRequestsForSubject(subjectId: string): Promise<QuotaRequestRow[]> {
			return (await db.all(
				"SELECT * FROM quota_request WHERE subject_id = ? ORDER BY created_at DESC",
				subjectId,
			)) as unknown as QuotaRequestRow[];
		},
		async listRequests(status?: "pending" | "approved" | "rejected"): Promise<QuotaRequestRow[]> {
			const rows = status
				? await db.all("SELECT * FROM quota_request WHERE status = ? ORDER BY created_at DESC", status)
				: await db.all("SELECT * FROM quota_request ORDER BY created_at DESC");
			return rows as unknown as QuotaRequestRow[];
		},
		async reviewRequest(input: {
			id: string;
			status: "approved" | "rejected";
			mode?: "override" | "pack";
			grantedCredits?: number;
			note?: string;
			by: string;
		}) {
			await db.run(
				`UPDATE quota_request SET status = ?, mode = ?, granted_credits = ?, review_note = ?, reviewed_by = ?, reviewed_at = ?
				 WHERE id = ?`,
				input.status,
				input.mode ?? null,
				input.grantedCredits ?? null,
				input.note ?? null,
				input.by,
				new Date().toISOString(),
				input.id,
			);
			return (await this.getRequest(input.id)) as QuotaRequestRow;
		},
	};
}
export type QuotaStore = ReturnType<typeof createQuotaStore>;
