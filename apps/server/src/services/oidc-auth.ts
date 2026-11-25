import { createHash } from "node:crypto";
import { KitError, type MemberOidcBinding, type MemberView, OidcSubjectSchema } from "@openagentkit/sdk/protocol";
import { createRemoteJWKSet, errors, jwtVerify } from "jose";
import type { OidcConfig } from "../config.ts";
import type { AuditLog } from "../store/audit.ts";
import type { MemberStore } from "../store/members.ts";
import type { OidcAuthStore, OidcBindingRecord } from "../store/oidc-auth.ts";
import { expiringAuthStream } from "./auth-stream.ts";

interface VerifiedToken {
	subjectKey: string;
	tokenKey: string;
	issuedAt: number;
	expiresAt: string;
}

export interface OidcMemberGrant extends VerifiedToken {
	member: MemberView;
	boundAt: string;
}

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const unauthorized = () => new KitError("unauthorized", "企业登录已失效，请重新登录");
const unbound = () =>
	new KitError("forbidden", "企业账号尚未绑定 Kit 成员，请联系管理员", {
		details: { reason: "member_not_bound" },
		messageKey: "serverErrors.memberNotBound",
	});

function isInvalidToken(error: unknown): boolean {
	return (
		error instanceof errors.JWTExpired ||
		error instanceof errors.JWTClaimValidationFailed ||
		error instanceof errors.JWTInvalid ||
		error instanceof errors.JWSInvalid ||
		error instanceof errors.JWSSignatureVerificationFailed ||
		error instanceof errors.JOSEAlgNotAllowed ||
		error instanceof errors.JWKSNoMatchingKey ||
		error instanceof errors.JWKSMultipleMatchingKeys
	);
}

export function createOidcAuthService({
	config,
	store,
	members,
	audit,
}: {
	config: OidcConfig;
	store: OidcAuthStore;
	members: MemberStore;
	audit: AuditLog;
}) {
	const issuerKey = digest(config.issuer);
	const keyOf = (value: string) => digest(JSON.stringify([config.issuer, value]));
	const jwks = createRemoteJWKSet(new URL(`${config.issuer}/protocol/openid-connect/certs`), { timeoutDuration: 3000 });
	const streams = new Map<AbortController, VerifiedToken>();

	function closeStreams(property: "subjectKey" | "tokenKey", key: string) {
		for (const [controller, token] of streams) {
			if (token[property] !== key) continue;
			streams.delete(controller);
			controller.abort(unauthorized());
		}
	}

	async function verify(token?: string): Promise<VerifiedToken | null> {
		if (!token) return null;
		try {
			const { payload } = await jwtVerify(token, jwks, {
				algorithms: ["RS256"],
				issuer: config.issuer,
				audience: config.audience,
				requiredClaims: ["sub", "jti", "iat", "exp", "azp", "typ"],
			});
			const { sub, jti, iat, exp } = payload;
			if (
				payload.typ !== "Bearer" ||
				payload.azp !== config.clientId ||
				!OidcSubjectSchema.safeParse(sub).success ||
				typeof sub !== "string" ||
				typeof jti !== "string" ||
				!jti ||
				typeof iat !== "number" ||
				!Number.isSafeInteger(iat) ||
				iat <= 0 ||
				iat * 1000 > Date.now() ||
				typeof exp !== "number" ||
				!Number.isSafeInteger(exp) ||
				exp <= iat ||
				exp >= 8_640_000_000_000
			) {
				return null;
			}
			return {
				subjectKey: keyOf(sub),
				tokenKey: keyOf(jti),
				issuedAt: iat * 1000,
				expiresAt: new Date(exp * 1000).toISOString(),
			};
		} catch (error) {
			if (isInvalidToken(error)) return null;
			throw new KitError("provider_error", "暂时无法验证企业登录，请稍后重试", { retryable: true });
		}
	}

	async function requireMember(memberId: string): Promise<MemberView> {
		const member = await members.findById(memberId);
		if (member?.status !== "active") throw new KitError("not_found", "成员不存在");
		return member;
	}

	function bindingView(binding: OidcBindingRecord): MemberOidcBinding {
		return { issuer: config.issuer, sub: binding.subject, member_id: binding.member_id, bound_at: binding.bound_at };
	}

	return {
		async resolve(token: string): Promise<OidcMemberGrant> {
			const proof = await verify(token);
			if (!proof || (await store.isRevoked(proof.tokenKey))) throw unauthorized();
			const binding = await store.bySubject(proof.subjectKey);
			if (!binding) throw unbound();
			if (proof.issuedAt <= Date.parse(binding.bound_at)) throw unauthorized();
			const member = await members.findById(binding.member_id);
			if (member?.status !== "active") throw unbound();
			return { ...proof, member, boundAt: binding.bound_at };
		},
		async logout(token?: string) {
			const proof = await verify(token);
			if (!proof) return;
			await store.revoke(proof.tokenKey, proof.expiresAt, new Date().toISOString());
			closeStreams("tokenKey", proof.tokenKey);
		},
		async bindStream(grant: OidcMemberGrant) {
			const controller = new AbortController();
			const stream = expiringAuthStream(grant.expiresAt, controller);
			// 先登记，再复核已验证身份。撤销/解绑发生在 HTTP 验证与订阅建立之间也会收口。
			streams.set(controller, grant);
			const close = () => {
				streams.delete(controller);
				stream.close();
			};
			try {
				const binding = await store.bySubject(grant.subjectKey);
				if (
					binding?.member_id !== grant.member.member_id ||
					binding.bound_at !== grant.boundAt ||
					(await store.isRevoked(grant.tokenKey))
				) {
					throw unauthorized();
				}
				await stream.assertActive();
				return { ...stream, close };
			} catch (error) {
				close();
				throw error;
			}
		},
		async getBinding(memberId: string) {
			await requireMember(memberId);
			const binding = await store.byMember(issuerKey, memberId);
			return binding ? bindingView(binding) : null;
		},
		async bind(memberId: string, sub: string, actor: string) {
			await requireMember(memberId);
			return await store.transaction(async () => {
				const result = await store.bind(issuerKey, {
					subject_key: keyOf(sub),
					subject: sub,
					member_id: memberId,
					bound_at: new Date().toISOString(),
				});
				if (!result.binding) throw new KitError("conflict", "成员或 Keycloak 用户已绑定，请先解除原绑定");
				if (result.created) await audit.append({ subject: actor, action: "members.oidc.bind", target: memberId });
				return bindingView(result.binding);
			});
		},
		async unbind(memberId: string, actor: string) {
			await requireMember(memberId);
			const binding = await store.transaction(async () => {
				const removed = await store.unbind(issuerKey, memberId);
				if (removed) await audit.append({ subject: actor, action: "members.oidc.unbind", target: memberId });
				return removed;
			});
			if (binding) closeStreams("subjectKey", binding.subject_key);
		},
	};
}

export type OidcAuthService = ReturnType<typeof createOidcAuthService>;
