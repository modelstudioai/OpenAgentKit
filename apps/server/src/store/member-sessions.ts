import type { StoreDatabase } from "./database.ts";

export interface MemberSessionRecord {
	token_hash: string;
	member_id: string;
	created_at: string;
	expires_at: string;
}

/** 只存登录凭据的 SHA-256 摘要；随机 token 原文只返回给登录者。 */
export function createMemberSessionStore(db: StoreDatabase) {
	return {
		async create(session: MemberSessionRecord) {
			await db.run("DELETE FROM kit_member_sessions WHERE expires_at <= ?", session.created_at);
			await db.run(
				"INSERT INTO kit_member_sessions (token_hash, member_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
				session.token_hash,
				session.member_id,
				session.created_at,
				session.expires_at,
			);
		},
		async find(tokenHash: string): Promise<MemberSessionRecord | null> {
			return (
				((await db.get("SELECT * FROM kit_member_sessions WHERE token_hash = ?", tokenHash)) as unknown as
					| MemberSessionRecord
					| undefined) ?? null
			);
		},
		async revoke(tokenHash: string): Promise<void> {
			await db.run("DELETE FROM kit_member_sessions WHERE token_hash = ?", tokenHash);
		},
	};
}

export type MemberSessionStore = ReturnType<typeof createMemberSessionStore>;
