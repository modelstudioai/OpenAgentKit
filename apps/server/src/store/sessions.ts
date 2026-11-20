import type {
	AttachmentRef,
	CatalogMemoryStore,
	DebugSessionSummary,
	MessageFileAssociation,
	SessionPurpose,
	SessionSummary,
} from "@openagentkit/sdk/protocol";
import type { StoreDatabase } from "./database.ts";
import { createSessionDirectoryIndex } from "./session-directory.ts";

interface Row {
	session_id: string;
	subject_id: string;
	purpose: SessionPurpose;
	agent_slug: string | null;
	remote_agent_id: string | null;
	debug_source: "project" | "template" | null;
	remote_environment_id: string | null;
	runtime_json: string | null;
	project_name: string | null;
	agent_key: string | null;
	project_revision: string | null;
	source_dirty: number | null;
	title: string | null;
	status: string | null;
	created_at: string;
	last_event_at: string | null;
	files_json: string | null;
	message_files_json: string | null;
}

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

function targetColumns(input: CreateSessionIndexInput) {
	if (input.purpose !== "admin_debug")
		return [input.agentSlug, input.remoteAgentId ?? null, null, null, null, null, null, null, null];
	const target = input.debug;
	if (target.source === "template")
		return [
			null,
			target.remote_agent_id,
			null,
			null,
			null,
			null,
			"template",
			target.remote_environment_id ?? null,
			JSON.stringify({
				agent_version: target.agent_version,
				memory_stores: target.memory_stores ?? [],
				vault_ids: target.vault_ids ?? [],
			}),
		];
	return [
		null,
		target.remote_agent_id,
		target.project_name,
		target.agent_key,
		target.project_revision ?? null,
		target.source_dirty === undefined ? null : Number(target.source_dirty),
		"project",
		null,
		null,
	];
}

/** 只存会话索引；两个身份域即使 subject 相同也不可互相读取。事件正文始终由 Provider 保存。 */
export function createSessionIndex(db: StoreDatabase) {
	const directory = createSessionDirectoryIndex(db);
	async function getScoped(sessionId: string, purpose: SessionPurpose): Promise<Row | undefined> {
		return (await db.get(
			"SELECT * FROM kit_sessions WHERE session_id = ? AND purpose = ?",
			sessionId,
			purpose,
		)) as unknown as Row | undefined;
	}
	return {
		listAgentsForSubject: directory.agents,
		pageForSubject: directory.page,
		async create(input: CreateSessionIndexInput) {
			const now = new Date().toISOString();
			await db.run(
				`INSERT INTO kit_sessions
        (session_id, subject_id, purpose, agent_slug, remote_agent_id, project_name, agent_key,
          project_revision, source_dirty, debug_source, remote_environment_id, runtime_json,
          title, status, created_at, last_event_at, files_json)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
				input.sessionId,
				input.subjectId,
				input.purpose ?? "experience",
				...targetColumns(input),
				input.title ?? null,
				"idle",
				now,
				now,
				serializeFiles(input.files),
			);
		},
		async get(sessionId: string) {
			const row = await getScoped(sessionId, "experience");
			return row?.agent_slug != null ? experienceRow({ ...row, agent_slug: row.agent_slug }) : null;
		},
		async getForSubject(sessionId: string, subjectId: string) {
			const row = await this.get(sessionId);
			return row?.subject_id === subjectId ? row : null;
		},
		async getDebugForSubject(sessionId: string, subjectId: string) {
			const row = await getScoped(sessionId, "admin_debug");
			return row?.subject_id === subjectId ? debugRow(row) : null;
		},
		async owns(sessionId: string, subjectId: string, purpose: SessionPurpose = "experience") {
			return (await getScoped(sessionId, purpose))?.subject_id === subjectId;
		},
		/** 最近活动优先：侧栏「最近」与智能体分组都以 last_event_at（缺省回落 created_at）倒序为准。 */
		async listForSubject(subjectId: string, options: { agentSlug?: string; limit?: number } = {}) {
			const rows = (options.agentSlug
				? await db.all(
						"SELECT * FROM kit_sessions WHERE purpose = 'experience' AND subject_id = ? AND agent_slug = ? ORDER BY COALESCE(last_event_at, created_at) DESC LIMIT ?",
						subjectId,
						options.agentSlug,
						options.limit ?? 50,
					)
				: await db.all(
						"SELECT * FROM kit_sessions WHERE purpose = 'experience' AND subject_id = ? ORDER BY COALESCE(last_event_at, created_at) DESC LIMIT ?",
						subjectId,
						options.limit ?? 50,
					)) as unknown as (Row & { agent_slug: string })[];
			return rows.map((row) => experienceRow(row).summary);
		},
		async listDebugForSubject(subjectId: string, projectName: string, agentKey: string, limit = 50) {
			const rows = (await db.all(
				"SELECT * FROM kit_sessions WHERE purpose = 'admin_debug' AND subject_id = ? AND project_name = ? AND agent_key = ? ORDER BY created_at DESC LIMIT ?",
				subjectId,
				projectName,
				agentKey,
				limit,
			)) as unknown as Row[];
			return rows.map((row) => debugRow(row).summary);
		},
		async remove(sessionId: string): Promise<boolean> {
			return (await db.run("DELETE FROM kit_sessions WHERE session_id = ?", sessionId)).changes > 0;
		},
		async setTitle(sessionId: string, title: string) {
			await db.run("UPDATE kit_sessions SET title = ? WHERE session_id = ?", title, sessionId);
		},
		/** 运行时挂载成功后并入 files_json：provider 不回显运行时挂载，本地索引是唯一展示权威。 */
		async appendFiles(sessionId: string, files: AttachmentRef[]) {
			if (!files.length) return;
			await db.transaction(async () => {
				const row = await getScoped(sessionId, "experience");
				if (!row) return;
				const merged = [...parseFiles(row), ...files];
				await db.run("UPDATE kit_sessions SET files_json = ? WHERE session_id = ?", serializeFiles(merged), sessionId);
			});
		},
		/** 随消息挂载的附件按发送响应 event_ids 落关联；刷新后历史气泡的附件展示以它为准。 */
		async appendMessageFiles(sessionId: string, entry: MessageFileAssociation) {
			await db.transaction(async () => {
				const row = await getScoped(sessionId, "experience");
				if (!row) return;
				const merged = [...parseMessageFiles(row), entry];
				await db.run(
					"UPDATE kit_sessions SET message_files_json = ? WHERE session_id = ?",
					JSON.stringify(merged),
					sessionId,
				);
			});
		},
		/** 状态同步只写 status：订阅水合的历史终态回落与归档都走这里，不得影响「最近」排序。 */
		async setStatus(sessionId: string, status: string) {
			await db.run("UPDATE kit_sessions SET status = ? WHERE session_id = ?", status, sessionId);
		},
		async setStatusUnlessArchived(sessionId: string, status: string) {
			await db.run(
				"UPDATE kit_sessions SET status = ? WHERE session_id = ? AND (status IS NULL OR status <> 'archived')",
				status,
				sessionId,
			);
		},
		/** 推进「最近」排序的唯一入口：只由发消息等真实对话活动调用。 */
		async touch(sessionId: string, status?: string) {
			const now = new Date().toISOString();
			if (status)
				await db.run(
					"UPDATE kit_sessions SET last_event_at = ?, status = ? WHERE session_id = ?",
					now,
					status,
					sessionId,
				);
			else await db.run("UPDATE kit_sessions SET last_event_at = ? WHERE session_id = ?", now, sessionId);
		},
		/** 列表对账专用 CAS 写：只改仍处于 running 的行，避免与归档/删除竞态。 */
		async setStatusIfRunning(sessionId: string, status: string): Promise<boolean> {
			const result = await db.run(
				"UPDATE kit_sessions SET status = ? WHERE session_id = ? AND status = 'running'",
				status,
				sessionId,
			);
			return result.changes > 0;
		},
	};
}

export type SessionIndex = ReturnType<typeof createSessionIndex>;
