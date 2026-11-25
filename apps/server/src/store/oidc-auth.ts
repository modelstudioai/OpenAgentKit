import type { StoreDatabase } from "./database.ts";

export interface OidcBindingRecord {
	subject_key: string;
	member_id: string;
	subject: string;
	bound_at: string;
}

export function createOidcAuthStore(db: StoreDatabase) {
	const columns = "subject_key, member_id, subject, bound_at";
	async function byMember(issuerKey: string, memberId: string) {
		return (await db.get(
			`SELECT ${columns} FROM kit_oidc_member_bindings WHERE issuer_key = ? AND member_id = ?`,
			issuerKey,
			memberId,
		)) as OidcBindingRecord | undefined;
	}
	return {
		transaction: db.transaction,
		byMember,
		async bySubject(subjectKey: string) {
			return (await db.get(`SELECT ${columns} FROM kit_oidc_member_bindings WHERE subject_key = ?`, subjectKey)) as
				| OidcBindingRecord
				| undefined;
		},
		async bind(issuerKey: string, binding: OidcBindingRecord) {
			const current = await byMember(issuerKey, binding.member_id);
			if (current) return { binding: current.subject_key === binding.subject_key ? current : null, created: false };
			const result = await db.insertIfAbsent(
				"INSERT INTO kit_oidc_member_bindings (subject_key, issuer_key, member_id, subject, bound_at) VALUES (?, ?, ?, ?, ?)",
				"",
				binding.subject_key,
				issuerKey,
				binding.member_id,
				binding.subject,
				binding.bound_at,
			);
			return { binding: result.changes ? binding : null, created: result.changes > 0 };
		},
		async unbind(issuerKey: string, memberId: string) {
			const binding = await byMember(issuerKey, memberId);
			if (binding) await db.run("DELETE FROM kit_oidc_member_bindings WHERE subject_key = ?", binding.subject_key);
			return binding;
		},
		async isRevoked(tokenKey: string) {
			return Boolean(await db.get("SELECT 1 FROM kit_oidc_token_revocations WHERE token_hash = ?", tokenKey));
		},
		async revoke(tokenKey: string, expiresAt: string, now: string) {
			await db.transaction(async () => {
				await db.run("DELETE FROM kit_oidc_token_revocations WHERE expires_at <= ?", now);
				if (expiresAt > now)
					await db.insertIfAbsent(
						"INSERT INTO kit_oidc_token_revocations (token_hash, expires_at) VALUES (?, ?)",
						"token_hash",
						tokenKey,
						expiresAt,
					);
			});
		},
	};
}

export type OidcAuthStore = ReturnType<typeof createOidcAuthStore>;
