import { Inject, Injectable } from "@nestjs/common";

import {
	KitError,
	type MemberSessionUsage,
	SESSION_USAGE_METRICS,
	type SessionStats,
	type SessionUsage,
} from "@openagentkit/sdk/protocol";
import { type EntityManager, IsNull } from "typeorm";
import { CatalogAgentsEntity } from "../../../entity/tables/catalog-agents.entity.ts";
import { KitMembersEntity } from "../../../entity/tables/kit-members.entity.ts";
import { KitSessionDeletionsEntity } from "../../../entity/tables/kit-session-deletions.entity.ts";
import { KitSessionUsageEntity } from "../../../entity/tables/kit-session-usage.entity.ts";
import { KitSessionsEntity } from "../../../entity/tables/kit-sessions.entity.ts";
import { KitTemplateListingsEntity } from "../../../entity/tables/kit-template-listings.entity.ts";
import { KitTemplatesEntity } from "../../../entity/tables/kit-templates.entity.ts";
import { StoreDatabase } from "../../../store/database.ts";

function telemetryQuery(manager: EntityManager) {
	return manager
		.createQueryBuilder(KitSessionUsageEntity, "u")
		.select("COUNT(*)", "sessions")
		.addSelect("COALESCE(SUM(u.input_tokens), 0)", "input_tokens")
		.addSelect("COALESCE(SUM(u.output_tokens), 0)", "output_tokens")
		.addSelect("COALESCE(SUM(u.cache_read_input_tokens), 0)", "cache_read_tokens")
		.addSelect("COALESCE(SUM(u.cache_creation_input_tokens), 0)", "cache_creation_tokens");
}

function activeMemberUsage(manager: EntityManager, memberId: string) {
	return manager
		.createQueryBuilder(KitSessionUsageEntity, "u")
		.innerJoin(KitSessionsEntity, "s", "s.session_id = u.session_id")
		.where("u.member_id = :memberId AND s.subject_id = :memberId", { memberId })
		.andWhere("s.purpose = :purpose", { purpose: "experience" })
		.andWhere("u.deleted_at IS NULL AND u.finalized_at IS NULL");
}

interface TelemetryTotals {
	sessions: number;
	input_tokens: number;
	output_tokens: number;
	cache_read_tokens: number;
	cache_creation_tokens: number;
}

export type SessionUsageSnapshot = Omit<
	MemberSessionUsage,
	"usage" | "stats" | "title" | "status" | "captured_at" | "deleted_at"
> & {
	title: string | null;
	status: string | null;
	captured_at: string | null;
	deleted_at: string | null;
	finalized_at: string | null;
	attempted_at: string | null;
	capture_revision: number;
} & Record<(typeof SESSION_USAGE_METRICS)[number], number | null>;

type SnapshotValues = SessionUsage & SessionStats;

/** 管理会话用量快照的采集、修订和封存，并向 Mock Gateway 提供已持久化的统计。 */
@Injectable()
export class SessionUsageSnapshotService {
	constructor(@Inject(StoreDatabase) private readonly db: StoreDatabase) {}

	async get(sessionId: string) {
		const row = await this.db.read((manager) => manager.findOneBy(KitSessionUsageEntity, { session_id: sessionId }));
		return (row ?? undefined) as SessionUsageSnapshot | undefined;
	}

	async syncMember(memberId?: string) {
		await this.db.transaction(() =>
			this.db.write(async (manager) => {
				const sessions = manager
					.createQueryBuilder(KitSessionsEntity, "s")
					.innerJoin(KitMembersEntity, "m", "m.member_id = s.subject_id")
					.where("s.purpose = :purpose", { purpose: "experience" });
				if (memberId !== undefined) sessions.andWhere("m.member_id = :memberId", { memberId });

				const missing = sessions
					.clone()
					.leftJoin(KitSessionUsageEntity, "u", "u.session_id = s.session_id")
					.andWhere("u.session_id IS NULL")
					.select(["s.session_id", "s.subject_id", "s.agent_slug", "s.title", "s.status", "s.created_at"]);
				await manager
					.createQueryBuilder()
					.insert()
					.into(KitSessionUsageEntity, ["session_id", "member_id", "agent_slug", "title", "status", "created_at"])
					.valuesFromSelect(missing)
					.updateEntity(false)
					.execute();

				const title = sessions.select("s.title").andWhere("s.session_id = kit_session_usage.session_id");
				const exists = title.clone().select("1");
				await manager
					.createQueryBuilder()
					.update(KitSessionUsageEntity)
					.set({ title: () => `(${title.getQuery()})` })
					.where({ deleted_at: IsNull(), finalized_at: IsNull() })
					.andWhere(`EXISTS (${exists.getQuery()})`)
					.setParameters(title.getParameters())
					.execute();
			}),
		);
	}

	async syncAll(): Promise<string[]> {
		await this.syncMember();
		const members = await this.db.read((manager) =>
			manager
				.createQueryBuilder(KitSessionUsageEntity, "u")
				.select("u.member_id", "member_id")
				.distinct(true)
				.innerJoin(KitMembersEntity, "m", "m.member_id = u.member_id")
				.getRawMany<{ member_id: string }>(),
		);
		return members.map(({ member_id }) => member_id);
	}

	private async writeSnapshot(
		sessionId: string,
		values: SnapshotValues,
		status: string,
		revision: number,
		final: boolean,
	) {
		const complete = SESSION_USAGE_METRICS.every((key) => values[key] !== undefined);
		const now = new Date().toISOString();
		const metrics = Object.fromEntries(SESSION_USAGE_METRICS.map((key) => [key, values[key] ?? null]));
		const update = await this.db.write((manager) =>
			manager.update(
				KitSessionUsageEntity,
				{ session_id: sessionId, capture_revision: revision, deleted_at: IsNull(), finalized_at: IsNull() },
				{
					...metrics,
					status,
					collection_status: complete ? "complete" : "partial",
					captured_at: now,
					attempted_at: now,
					finalized_at: final ? now : null,
				},
			),
		);
		return (update.affected ?? 0) > 0;
	}

	async telemetryByAgent() {
		const rows = await this.db.read((manager) =>
			telemetryQuery(manager)
				.addSelect("t.remote_agent_id", "agent_key")
				.innerJoin(CatalogAgentsEntity, "c", "c.slug = u.agent_slug")
				.innerJoin(KitTemplateListingsEntity, "l", "l.catalog_id = c.id")
				.innerJoin(KitTemplatesEntity, "t", "t.template_id = l.template_id")
				.groupBy("t.remote_agent_id")
				.getRawMany<TelemetryTotals & { agent_key: string }>(),
		);
		return new Map(rows.map((row) => [row.agent_key, row]));
	}

	async telemetryBySession(sessionId: string) {
		const row = await this.db.read((manager) =>
			telemetryQuery(manager).where("u.session_id = :sessionId", { sessionId }).getRawOne<TelemetryTotals>(),
		);
		return row?.sessions ? row : null;
	}

	isMemberSession(sessionId: string) {
		return this.db.read((manager) =>
			manager
				.createQueryBuilder(KitSessionsEntity, "s")
				.innerJoin(KitMembersEntity, "m", "m.member_id = s.subject_id")
				.where({ purpose: "experience", session_id: sessionId })
				.getExists(),
		);
	}

	hasPending(memberId: string) {
		return this.db.read((manager) =>
			activeMemberUsage(manager, memberId).andWhere("u.collection_status = 'pending'").getExists(),
		);
	}

	async captureCandidates(memberId: string, after = "", limit = 100): Promise<string[]> {
		const rows = await this.db.read((manager) =>
			activeMemberUsage(manager, memberId)
				.select("u.session_id", "session_id")
				.andWhere("u.session_id > :after", { after })
				.orderBy("u.session_id", "ASC")
				.limit(limit)
				.getRawMany<{ session_id: string }>(),
		);
		return rows.map(({ session_id }) => session_id);
	}

	async beginCapture(sessionId: string): Promise<number | null> {
		return this.db.transaction(async () => {
			const result = await this.db.write((manager) =>
				manager.update(
					KitSessionUsageEntity,
					{ session_id: sessionId, deleted_at: IsNull(), finalized_at: IsNull() },
					{ capture_revision: () => "capture_revision + 1" },
				),
			);
			return result.affected ? ((await this.get(sessionId))?.capture_revision ?? null) : null;
		});
	}

	save(sessionId: string, values: SnapshotValues, status: string, revision: number) {
		return this.writeSnapshot(sessionId, values, status, revision, false);
	}

	async fail(sessionId: string, revision: number, status: "failed" | "not_found") {
		await this.db.write((manager) =>
			manager.update(
				KitSessionUsageEntity,
				{ session_id: sessionId, capture_revision: revision, deleted_at: IsNull(), finalized_at: IsNull() },
				{ collection_status: status, attempted_at: new Date().toISOString() },
			),
		);
	}

	async finalize(sessionId: string, values: SnapshotValues, status: string) {
		await this.db.transaction(async () => {
			const existing = await this.get(sessionId);
			if (!existing || existing.deleted_at) throw new KitError("conflict", "会话用量记录不可用，请重试");
			await this.db.write((manager) =>
				manager.update(
					KitSessionUsageEntity,
					{ session_id: sessionId },
					{ finalized_at: null, capture_revision: () => "capture_revision + 1" },
				),
			);
			if (!(await this.writeSnapshot(sessionId, values, status, existing.capture_revision + 1, true))) {
				throw new KitError("conflict", "会话用量快照未保存，请重试");
			}
		});
	}

	async releaseFinal(sessionId: string) {
		await this.db.write((manager) =>
			manager.update(KitSessionUsageEntity, { session_id: sessionId, deleted_at: IsNull() }, { finalized_at: null }),
		);
	}

	async markDeleted(sessionId: string) {
		await this.db.transaction(async () => {
			const row = await this.get(sessionId);
			if (!row?.finalized_at) throw new KitError("conflict", "必须先成功保存最终用量快照");
			await this.db.write(async (manager) => {
				await manager
					.createQueryBuilder()
					.update(KitSessionUsageEntity)
					.set({ deleted_at: () => "COALESCE(deleted_at, :now)", status: "deleted" })
					.where({ session_id: sessionId })
					.setParameter("now", new Date().toISOString())
					.execute();
				await manager.delete(KitSessionsEntity, { session_id: sessionId });
				await manager.update(
					KitSessionDeletionsEntity,
					{ session_id: sessionId },
					{ stage: "deleted", updated_at: new Date().toISOString() },
				);
			});
		});
	}
}
