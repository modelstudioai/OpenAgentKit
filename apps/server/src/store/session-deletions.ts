import type { StoreDatabase } from "./database.ts";

export type DeletionStage = "preparing" | "captured" | "deleting" | "uncertain" | "deleted";
export interface SessionDeletion {
	session_id: string;
	subject_id: string;
	stage: DeletionStage;
	updated_at: string;
}

/** 仅保存删除阶段；重启后结果未确认的会话仍不允许产生新用量。 */
export function createSessionDeletionStore(db: StoreDatabase) {
	return {
		async get(sessionId: string) {
			return (await db.get("SELECT * FROM kit_session_deletions WHERE session_id = ?", sessionId)) as
				| SessionDeletion
				| undefined;
		},
		async set(sessionId: string, subjectId: string, stage: DeletionStage) {
			await db.upsert(
				`INSERT INTO kit_session_deletions (session_id, subject_id, stage, updated_at)
				VALUES (?, ?, ?, ?)`,
				"session_id",
				`stage=excluded.stage, updated_at=excluded.updated_at`,
				sessionId,
				subjectId,
				stage,
				new Date().toISOString(),
			);
		},
		async clear(sessionId: string) {
			await db.run("DELETE FROM kit_session_deletions WHERE session_id = ? AND stage != 'deleted'", sessionId);
		},
	};
}
export type SessionDeletionStore = ReturnType<typeof createSessionDeletionStore>;
