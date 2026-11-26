import { Inject, Injectable } from "@nestjs/common";

import type {
	AttachmentRef,
	CatalogMemoryStore,
	DebugSessionSummary,
	MessageFileAssociation,
	SessionPurpose,
	SessionSummary,
} from "@openagentkit/sdk/protocol";
import { KitError, type SessionPage } from "@openagentkit/sdk/protocol";
import type { EntityManager } from "typeorm";
import { IsNull, Not, Or } from "typeorm";
import { KitSessionsEntity } from "../../../entity/tables/kit-sessions.entity.ts";
import { StoreDatabase } from "../../../store/database.ts";
import { likePattern } from "../../../store/sql.ts";

type Row = KitSessionsEntity & {
	session_id: string;
	purpose: SessionPurpose;
	debug_source: "project" | "template" | null;
};

export type DebugSessionTarget =
	| {
			source?: "project";
			project_name: string;
			agent_key: string;
			remote_agent_id: string;
			project_revision?: string;
			source_dirty?: boolean;
	  }
	| {
			source: "template";
			remote_agent_id: string;
			agent_version?: number;
			remote_environment_id?: string;
			memory_stores?: CatalogMemoryStore[];
			vault_ids?: string[];
	  };

export type CreateSessionIndexInput = {
	sessionId: string;
	subjectId: string;
	title?: string;
	files?: AttachmentRef[];
} & (
	| { purpose?: "experience"; agentSlug: string; remoteAgentId?: string }
	| { purpose: "admin_debug"; debug: DebugSessionTarget }
);

function parseFiles(row: Row): AttachmentRef[] {
	if (!row.files_json) return [];
	const parsed = JSON.parse(row.files_json) as unknown;
	return Array.isArray(parsed) ? (parsed as AttachmentRef[]) : [];
}

function parseMessageFiles(row: Row): MessageFileAssociation[] {
	if (!row.message_files_json) return [];
	const parsed = JSON.parse(row.message_files_json) as unknown;
	return Array.isArray(parsed) ? (parsed as MessageFileAssociation[]) : [];
}

function serializeFiles(files?: AttachmentRef[]) {
	return files?.length ? JSON.stringify(files) : null;
}

function summary(row: Row) {
	return {
		session_id: row.session_id,
		...(row.title ? { title: row.title } : {}),
		...(row.status ? { status: row.status } : {}),
		created_at: row.created_at,
		...(row.last_event_at ? { last_event_at: row.last_event_at } : {}),
	};
}

function experienceRow(row: Row & { agent_slug: string }) {
	return {
		...row,
		summary: { ...summary(row), agent_slug: row.agent_slug } satisfies SessionSummary,
		files: parseFiles(row),
		messageFiles: parseMessageFiles(row),
	};
}

function debugRow(row: Row) {
	const view: DebugSessionSummary = {
		...summary(row),
		source: row.debug_source ?? "project",
		...(row.project_name ? { project_name: row.project_name } : {}),
		...(row.agent_key ? { agent_key: row.agent_key } : {}),
		remote_agent_id: row.remote_agent_id as string,
		...(row.remote_environment_id ? { remote_environment_id: row.remote_environment_id } : {}),
		...(row.project_revision ? { project_revision: row.project_revision } : {}),
		...(row.source_dirty !== null ? { source_dirty: Boolean(row.source_dirty) } : {}),
	};
	const runtime = row.runtime_json
		? (JSON.parse(row.runtime_json) as {
				agent_version?: number;
				memory_stores?: CatalogMemoryStore[];
				vault_ids?: string[];
			})
		: {};
	return { ...row, summary: view, files: parseFiles(row), runtime };
}

function targetColumns(input: CreateSessionIndexInput): Partial<KitSessionsEntity> {
	if (input.purpose !== "admin_debug") {
		return { agent_slug: input.agentSlug, remote_agent_id: input.remoteAgentId ?? null };
	}
	const target = input.debug;
	if (target.source === "template") {
		return {
			debug_source: "template",
			remote_agent_id: target.remote_agent_id,
			remote_environment_id: target.remote_environment_id ?? null,
			runtime_json: JSON.stringify({
				agent_version: target.agent_version,
				memory_stores: target.memory_stores ?? [],
				vault_ids: target.vault_ids ?? [],
			}),
		};
	}
	return {
		debug_source: "project",
		remote_agent_id: target.remote_agent_id,
		project_name: target.project_name,
		agent_key: target.agent_key,
		project_revision: target.project_revision ?? null,
		source_dirty: target.source_dirty === undefined ? null : Number(target.source_dirty),
	};
}

export interface SessionDirectoryQuery {
	agentSlug?: string;
	limit?: number;
	pageToken?: string;
	includeArchived?: boolean;
	q?: string;
	/** 当前 Catalog 展示名命中的智能体；与标题/slug 命中一起在分页前过滤。 */
	agentSlugs?: string[];
}

interface Cursor {
	context: string;
	at: string;
	id: string;
}

function readCursor(token: string | undefined, context: string): Cursor | undefined {
	if (!token) return undefined;
	try {
		const value: unknown = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
		if (
			value &&
			typeof value === "object" &&
			"context" in value &&
			value.context === context &&
			"at" in value &&
			typeof value.at === "string" &&
			/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.at) &&
			"id" in value &&
			typeof value.id === "string" &&
			value.id.length > 0
		)
			return { context, at: value.at, id: value.id };
	} catch {
		// 不回显不可信游标正文。
	}
	throw new KitError("invalid_request", "会话分页游标无效或与当前查询不匹配，请重新查询");
}

function nextCursor(data: SessionSummary[], hasMore: boolean, context: string): string | null {
	const last = data.at(-1);
	if (!hasMore || !last) return null;
	return Buffer.from(
		JSON.stringify({ context, at: last.last_event_at ?? last.created_at, id: last.session_id }),
	).toString("base64url");
}

const activity = "COALESCE(session.last_event_at, session.created_at)";

const notArchived = "COALESCE(session.status, '') <> 'archived'";

function ownedSessions(manager: EntityManager, subjectId: string) {
	return manager
		.createQueryBuilder(KitSessionsEntity, "session")
		.where({ subject_id: subjectId, purpose: "experience" })
		.andWhere("session.agent_slug IS NOT NULL");
}

function toSummary(row: KitSessionsEntity): SessionSummary {
	return {
		session_id: row.session_id!,
		agent_slug: row.agent_slug!,
		created_at: row.created_at,
		...(row.title ? { title: row.title } : {}),
		...(row.status ? { status: row.status } : {}),
		...(row.last_event_at ? { last_event_at: row.last_event_at } : {}),
	};
}

/** 会话索引和本人会话目录共享身份、用途与分页条件。 */
@Injectable()
export class SessionIndexService {
	constructor(@Inject(StoreDatabase) private readonly db: StoreDatabase) {}

	async listAgentsForSubject(subjectId: string): Promise<string[]> {
		const rows = await this.db.read((manager) =>
			ownedSessions(manager, subjectId)
				.select("session.agent_slug", "agent_slug")
				.andWhere(notArchived)
				.groupBy("session.agent_slug")
				.orderBy(`MAX(${activity})`, "DESC")
				.addOrderBy("session.agent_slug", "ASC")
				.getRawMany<{ agent_slug: string }>(),
		);
		return rows.map((row) => row.agent_slug);
	}

	async pageForSubject(subjectId: string, query: SessionDirectoryQuery = {}): Promise<SessionPage> {
		const limit = query.limit ?? 50;
		const includeArchived = query.includeArchived !== false;
		const q = query.q?.trim();
		const agentSlugs = q ? (query.agentSlugs ?? []) : [];
		const context = JSON.stringify([subjectId, query.agentSlug ?? null, includeArchived, q ?? null]);
		const cursor = readCursor(query.pageToken, context);
		const rows = await this.db.read((manager) => {
			const page = ownedSessions(manager, subjectId).select([
				"session.session_id",
				"session.agent_slug",
				"session.title",
				"session.status",
				"session.created_at",
				"session.last_event_at",
			]);
			if (query.agentSlug) page.andWhere({ agent_slug: query.agentSlug });
			if (!includeArchived) page.andWhere(notArchived);
			if (q) {
				const byAgent = agentSlugs.length ? " OR session.agent_slug IN (:...agentSlugs)" : "";
				page.andWhere(
					`(LOWER(session.title) LIKE LOWER(:pattern) ESCAPE '!' OR LOWER(session.agent_slug) LIKE LOWER(:pattern) ESCAPE '!'${byAgent})`,
					{ pattern: likePattern(q), agentSlugs },
				);
			}
			if (cursor) {
				page.andWhere(`(${activity} < :at OR (${activity} = :at AND session.session_id < :id))`, {
					at: cursor.at,
					id: cursor.id,
				});
			}
			return page
				.orderBy(activity, "DESC")
				.addOrderBy("session.session_id", "DESC")
				.limit(limit + 1)
				.getMany();
		});
		const data = rows.slice(0, limit).map(toSummary);
		return {
			data,
			next_page_token: nextCursor(data, rows.length > limit, context),
		};
	}

	private async getScoped(sessionId: string, purpose: SessionPurpose) {
		return (await this.db.read((manager) =>
			manager.findOneBy(KitSessionsEntity, { session_id: sessionId, purpose }),
		)) as Row | null;
	}

	async create(input: CreateSessionIndexInput) {
		const now = new Date().toISOString();
		await this.db.write((manager) =>
			manager.insert(KitSessionsEntity, {
				session_id: input.sessionId,
				subject_id: input.subjectId,
				purpose: input.purpose ?? "experience",
				...targetColumns(input),
				title: input.title ?? null,
				status: "idle",
				created_at: now,
				last_event_at: now,
				files_json: serializeFiles(input.files),
			}),
		);
	}

	async get(sessionId: string) {
		const row = await this.getScoped(sessionId, "experience");
		return row?.agent_slug != null ? experienceRow({ ...row, agent_slug: row.agent_slug }) : null;
	}

	async getForSubject(sessionId: string, subjectId: string) {
		const row = await this.get(sessionId);
		return row?.subject_id === subjectId ? row : null;
	}

	async getDebugForSubject(sessionId: string, subjectId: string) {
		const row = await this.getScoped(sessionId, "admin_debug");
		return row?.subject_id === subjectId ? debugRow(row) : null;
	}

	async owns(sessionId: string, subjectId: string, purpose: SessionPurpose = "experience") {
		return (await this.getScoped(sessionId, purpose))?.subject_id === subjectId;
	}

	/** 最近活动优先：侧栏「最近」与智能体分组都以 last_event_at（缺省回落 created_at）倒序为准。 */
	async listForSubject(subjectId: string, options: { agentSlug?: string; limit?: number } = {}) {
		const rows = (await this.db.read((manager) => {
			const query = manager.createQueryBuilder(KitSessionsEntity, "session").where({
				purpose: "experience",
				subject_id: subjectId,
			});
			if (options.agentSlug) query.andWhere({ agent_slug: options.agentSlug });
			return query
				.orderBy("COALESCE(session.last_event_at, session.created_at)", "DESC")
				.limit(options.limit ?? 50)
				.getMany();
		})) as (Row & { agent_slug: string })[];
		return rows.map((row) => experienceRow(row).summary);
	}

	async listDebugForSubject(subjectId: string, projectName: string, agentKey: string, limit = 50) {
		const rows = (await this.db.read((manager) =>
			manager.find(KitSessionsEntity, {
				where: { purpose: "admin_debug", subject_id: subjectId, project_name: projectName, agent_key: agentKey },
				order: { created_at: "DESC" },
				take: limit,
			}),
		)) as Row[];
		return rows.map((row) => debugRow(row).summary);
	}

	async remove(sessionId: string): Promise<boolean> {
		const result = await this.db.write((manager) => manager.delete(KitSessionsEntity, { session_id: sessionId }));
		return (result.affected ?? 0) > 0;
	}

	async setTitle(sessionId: string, title: string) {
		await this.db.write((manager) => manager.update(KitSessionsEntity, { session_id: sessionId }, { title }));
	}

	/** 运行时挂载成功后并入 files_json：provider 不回显运行时挂载，本地索引是唯一展示权威。 */
	async appendFiles(sessionId: string, files: AttachmentRef[]) {
		if (!files.length) return;
		await this.db.transaction(async () => {
			const row = await this.getScoped(sessionId, "experience");
			if (!row) return;
			const merged = [...parseFiles(row), ...files];
			await this.db.write((manager) =>
				manager.update(
					KitSessionsEntity,
					{ session_id: sessionId, purpose: "experience" },
					{ files_json: serializeFiles(merged) },
				),
			);
		});
	}

	/** 随消息挂载的附件按发送响应 event_ids 落关联；刷新后历史气泡的附件展示以它为准。 */
	async appendMessageFiles(sessionId: string, entry: MessageFileAssociation) {
		await this.db.transaction(async () => {
			const row = await this.getScoped(sessionId, "experience");
			if (!row) return;
			const merged = [...parseMessageFiles(row), entry];
			await this.db.write((manager) =>
				manager.update(
					KitSessionsEntity,
					{ session_id: sessionId, purpose: "experience" },
					{ message_files_json: JSON.stringify(merged) },
				),
			);
		});
	}

	/** 状态同步只写 status：订阅水合的历史终态回落与归档都走这里，不得影响「最近」排序。 */
	async setStatus(sessionId: string, status: string) {
		await this.db.write((manager) => manager.update(KitSessionsEntity, { session_id: sessionId }, { status }));
	}

	async setStatusUnlessArchived(sessionId: string, status: string) {
		await this.db.write((manager) =>
			manager.update(KitSessionsEntity, { session_id: sessionId, status: Or(IsNull(), Not("archived")) }, { status }),
		);
	}

	/** 推进「最近」排序的唯一入口：只由发消息等真实对话活动调用。 */
	async touch(sessionId: string, status?: string) {
		const now = new Date().toISOString();
		await this.db.write((manager) =>
			manager.update(
				KitSessionsEntity,
				{ session_id: sessionId },
				{ last_event_at: now, ...(status ? { status } : {}) },
			),
		);
	}

	/** 列表对账专用 CAS 写：只改仍处于 running 的行，避免与归档/删除竞态。 */
	async setStatusIfRunning(sessionId: string, status: string): Promise<boolean> {
		const result = await this.db.write((manager) =>
			manager.update(KitSessionsEntity, { session_id: sessionId, status: "running" }, { status }),
		);
		return (result.affected ?? 0) > 0;
	}
}
