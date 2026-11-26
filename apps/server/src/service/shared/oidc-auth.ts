import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { KitError, type MemberOidcBinding, type MemberView, OidcSubjectSchema } from "@openagentkit/sdk/protocol";
import { createRemoteJWKSet, errors, jwtVerify } from "jose";
import { LessThanOrEqual } from "typeorm";
import type { OidcConfig, ServerConfig } from "../../config.ts";
import { KitOidcMemberBindingsEntity } from "../../entity/tables/kit-oidc-member-bindings.entity.ts";
import { KitOidcTokenRevocationsEntity } from "../../entity/tables/kit-oidc-token-revocations.entity.ts";
import { StoreDatabase } from "../../store/database.ts";
import { type AuthStreamBinding, expiringAuthStream } from "../../utils/expiring-auth-stream.ts";
import { KIT_CONFIG } from "../../utils/injection-tokens.ts";
import { AuditService } from "./audit.ts";
import { MemberDirectoryService } from "./member-directory.ts";

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

@Injectable()
export class OidcAuthService {
	private readonly provider?: { config: OidcConfig; issuerKey: string; jwks: ReturnType<typeof createRemoteJWKSet> };
	private readonly streams = new Map<AbortController, VerifiedToken>();

	constructor(
		@Inject(KIT_CONFIG) config: ServerConfig,
		@Inject(StoreDatabase) private readonly db: StoreDatabase,
		@Inject(MemberDirectoryService) private readonly members: MemberDirectoryService,
		@Inject(AuditService) private readonly audit: AuditService,
	) {
		if (config.oidc) {
			this.provider = {
				config: config.oidc,
				issuerKey: digest(config.oidc.issuer),
				jwks: createRemoteJWKSet(new URL(`${config.oidc.issuer}/protocol/openid-connect/certs`), {
					timeoutDuration: 3000,
				}),
			};
		}
	}

	private configured() {
		if (!this.provider) throw new KitError("not_found", "当前部署未配置 Keycloak");
		return this.provider;
	}

	private keyOf(value: string) {
		return digest(JSON.stringify([this.configured().config.issuer, value]));
	}

	private closeStreams(property: "subjectKey" | "tokenKey", key: string) {
		for (const [controller, token] of this.streams) {
			if (token[property] !== key) continue;
			this.streams.delete(controller);
			controller.abort(unauthorized());
		}
	}

	private async verify(token?: string): Promise<VerifiedToken | null> {
		if (!token) return null;
		const { jwks, config } = this.configured();
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
				subjectKey: this.keyOf(sub),
				tokenKey: this.keyOf(jti),
				issuedAt: iat * 1000,
				expiresAt: new Date(exp * 1000).toISOString(),
			};
		} catch (error) {
			if (isInvalidToken(error)) return null;
			throw new KitError("provider_error", "暂时无法验证企业登录，请稍后重试", { retryable: true });
		}
	}

	private async requireMember(memberId: string): Promise<MemberView> {
		const member = await this.members.findById(memberId);
		if (member?.status !== "active") throw new KitError("not_found", "成员不存在");
		return member;
	}

	private bindingView(binding: KitOidcMemberBindingsEntity): MemberOidcBinding {
		return {
			issuer: this.configured().config.issuer,
			sub: binding.subject,
			member_id: binding.member_id,
			bound_at: binding.bound_at,
		};
	}

	private bySubject(subjectKey: string) {
		return this.db.read((manager) => manager.findOneBy(KitOidcMemberBindingsEntity, { subject_key: subjectKey }));
	}

	private byMember(memberId: string) {
		const { issuerKey } = this.configured();
		return this.db.read((manager) =>
			manager.findOneBy(KitOidcMemberBindingsEntity, { issuer_key: issuerKey, member_id: memberId }),
		);
	}

	private isRevoked(tokenKey: string) {
		return this.db.read((manager) => manager.existsBy(KitOidcTokenRevocationsEntity, { token_hash: tokenKey }));
	}

	async resolve(token: string): Promise<OidcMemberGrant> {
		const proof = await this.verify(token);
		if (!proof || (await this.isRevoked(proof.tokenKey))) throw unauthorized();
		const binding = await this.bySubject(proof.subjectKey);
		if (!binding) throw unbound();
		if (proof.issuedAt <= Date.parse(binding.bound_at)) throw unauthorized();
		const member = await this.members.findById(binding.member_id);
		if (member?.status !== "active") throw unbound();
		return { ...proof, member, boundAt: binding.bound_at };
	}

	async logout(token?: string) {
		const proof = await this.verify(token);
		if (!proof) return;
		const now = new Date().toISOString();
		await this.db.transaction(async () => {
			await this.db.write((manager) =>
				manager.delete(KitOidcTokenRevocationsEntity, { expires_at: LessThanOrEqual(now) }),
			);
			if (proof.expiresAt > now)
				await this.db.insertEntityIfAbsent(
					KitOidcTokenRevocationsEntity,
					{ token_hash: proof.tokenKey, expires_at: proof.expiresAt },
					["token_hash"],
				);
		});
		this.closeStreams("tokenKey", proof.tokenKey);
	}

	async bindStream(grant: OidcMemberGrant): Promise<AuthStreamBinding> {
		const controller = new AbortController();
		const stream = expiringAuthStream(grant.expiresAt, controller);
		// 先登记，再复核已验证身份，覆盖 HTTP 验证与订阅之间发生的撤销或解绑。
		this.streams.set(controller, grant);
		const close = () => {
			this.streams.delete(controller);
			stream.close();
		};
		try {
			const binding = await this.bySubject(grant.subjectKey);
			if (
				binding?.member_id !== grant.member.member_id ||
				binding.bound_at !== grant.boundAt ||
				(await this.isRevoked(grant.tokenKey))
			)
				throw unauthorized();
			await stream.assertActive();
			return { ...stream, close };
		} catch (error) {
			close();
			throw error;
		}
	}

	async getBinding(memberId: string) {
		this.configured();
		await this.requireMember(memberId);
		const binding = await this.byMember(memberId);
		return binding ? this.bindingView(binding) : null;
	}

	async bind(memberId: string, sub: string, actor: string): Promise<MemberOidcBinding> {
		const { issuerKey } = this.configured();
		await this.requireMember(memberId);
		const binding = {
			issuer_key: issuerKey,
			subject_key: this.keyOf(sub),
			subject: sub,
			member_id: memberId,
			bound_at: new Date().toISOString(),
		};
		return await this.db.transaction(async () => {
			const current = await this.byMember(memberId);
			if (current?.subject_key === binding.subject_key) return this.bindingView(current);
			if (current || !(await this.db.insertEntityIfAbsent(KitOidcMemberBindingsEntity, binding)))
				throw new KitError("conflict", "成员或 Keycloak 用户已绑定，请先解除原绑定");
			await this.audit.append({ subject: actor, action: "members.oidc.bind", target: memberId });
			return this.bindingView(binding);
		});
	}

	async unbind(memberId: string, actor: string) {
		this.configured();
		await this.requireMember(memberId);
		const binding = await this.db.transaction(async () => {
			const current = await this.byMember(memberId);
			if (!current) return null;
			const result = await this.db.write((manager) =>
				manager.delete(KitOidcMemberBindingsEntity, { subject_key: current.subject_key, bound_at: current.bound_at }),
			);
			if (!result.affected) return null;
			await this.audit.append({ subject: actor, action: "members.oidc.unbind", target: memberId });
			return current;
		});
		if (binding) this.closeStreams("subjectKey", binding.subject_key);
	}
}
