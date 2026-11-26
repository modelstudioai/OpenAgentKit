import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
	KitError,
	type MemberAuthView,
	type MemberLoginRequest,
	MemberLoginRequestSchema,
	type MemberLoginResult,
} from "@openagentkit/sdk/protocol";
import { LessThanOrEqual } from "typeorm";
import { KitMemberSessionsEntity } from "../../entity/tables/kit-member-sessions.entity.ts";
import { StoreDatabase } from "../../store/database.ts";
import type { AuthStreamBinding } from "../../utils/expiring-auth-stream.ts";
import { identityForMember, MEMBER_SESSION_TTL_MS, MEMBER_TOKEN_PREFIX } from "../../utils/identity-types.ts";
import { verifyPassword } from "../../utils/passwords.ts";
import { createRateLimiter } from "../../utils/rate-limit.ts";
import { AuditService } from "./audit.ts";
import { MemberDirectoryService } from "./member-directory.ts";

const TOKEN_PATTERN = /^kit_member_[A-Za-z0-9_-]{43}$/;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const unauthorized = () => new KitError("unauthorized", "登录状态无效或已过期，请重新登录");

export type AuthenticatedMemberSession = Pick<KitMemberSessionsEntity, "member_id" | "created_at" | "expires_at"> & {
	token_hash: string;
};

@Injectable()
export class MemberAuthService {
	private readonly accountLimiter = createRateLimiter({ rps: 1 / 60, burst: 10 });
	private readonly globalLimiter = createRateLimiter({ rps: 5, burst: 50 });
	private readonly streams = new Map<string, Set<AbortController>>();
	private checkingPasswords = 0;

	constructor(
		@Inject(MemberDirectoryService) private readonly members: MemberDirectoryService,
		@Inject(StoreDatabase) private readonly db: StoreDatabase,
		@Inject(AuditService) private readonly audit: AuditService,
	) {}

	async login(input: MemberLoginRequest): Promise<MemberLoginResult> {
		const parsed = MemberLoginRequestSchema.safeParse(input);
		if (!parsed.success) throw new KitError("invalid_request", "请输入有效的用户名和密码");
		const { username, password } = parsed.data;
		const global = this.globalLimiter.take("login");
		if (!global.ok) this.failLimited(global.retryAfterSeconds);
		const account = this.accountLimiter.take(digest(username));
		if (!account.ok) this.failLimited(account.retryAfterSeconds);
		// 未鉴权入口不能无限排队消耗 scrypt 线程池和内存；匿名 cookie 不参与此限流。
		if (this.checkingPasswords >= 4) this.failLimited(1);
		this.checkingPasswords += 1;
		let credential: Awaited<ReturnType<MemberDirectoryService["findCredentials"]>>;
		let valid: boolean;
		try {
			credential = await this.members.findCredentials(username);
			valid = await verifyPassword(password, credential?.passwordHash);
		} finally {
			this.checkingPasswords -= 1;
		}
		if (!valid || !credential || credential.member.status !== "active") {
			throw new KitError("unauthorized", "用户名或密码错误", {
				messageKey: "serverErrors.invalidCredentials",
			});
		}
		const accessToken = `${MEMBER_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
		const now = new Date();
		const createdAt = now.toISOString();
		const expiresAt = new Date(now.getTime() + MEMBER_SESSION_TTL_MS).toISOString();
		const { member } = credential;
		await this.db.write(async (manager) => {
			await manager.delete(KitMemberSessionsEntity, { expires_at: LessThanOrEqual(createdAt) });
			// 仅持久化登录凭据的 SHA-256 摘要，随机 token 原文只返回给登录者。
			await manager.insert(KitMemberSessionsEntity, {
				token_hash: digest(accessToken),
				member_id: member.member_id,
				created_at: createdAt,
				expires_at: expiresAt,
			});
		});
		await this.audit.append({
			subject: member.member_id,
			action: "member.auth.login",
			target: member.member_id,
		});
		return { access_token: accessToken, token_type: "Bearer", expires_at: expiresAt, member };
	}

	async resolve(token: string): Promise<{ view: MemberAuthView; session: AuthenticatedMemberSession }> {
		if (!TOKEN_PATTERN.test(token)) throw unauthorized();
		const { session, member } = await this.activeSession(digest(token));
		return {
			session,
			view: {
				identity: identityForMember(member),
				member,
				expires_at: session.expires_at,
			},
		};
	}

	async logout(token: string | undefined) {
		if (!token || !TOKEN_PATTERN.test(token)) return;
		const tokenHash = digest(token);
		const session = await this.findSession(tokenHash);
		await this.db.write((manager) => manager.delete(KitMemberSessionsEntity, { token_hash: tokenHash }));
		for (const controller of this.streams.get(tokenHash) ?? []) controller.abort(unauthorized());
		this.streams.delete(tokenHash);
		if (session)
			await this.audit.append({ subject: session.member_id, action: "member.auth.logout", target: session.member_id });
	}

	/** 每条 SSE 订阅独立取消；撤销一个登录态不会中断成员另一设备或云端 Agent。 */
	async bindStream(record: AuthenticatedMemberSession): Promise<AuthStreamBinding> {
		await this.activeSession(record.token_hash);
		const controller = new AbortController();
		const owned = this.streams.get(record.token_hash) ?? new Set<AbortController>();
		owned.add(controller);
		this.streams.set(record.token_hash, owned);
		const timer = setTimeout(
			() => controller.abort(unauthorized()),
			Math.max(0, Date.parse(record.expires_at) - Date.now()),
		);
		timer.unref();
		return {
			signal: controller.signal,
			assertActive: async () => {
				await this.activeSession(record.token_hash);
			},
			close: () => {
				clearTimeout(timer);
				owned.delete(controller);
				if (!owned.size) this.streams.delete(record.token_hash);
			},
		};
	}

	private failLimited(seconds: number): never {
		throw new KitError("rate_limited", "登录尝试过于频繁，请稍后重试", {
			retryable: true,
			details: { retry_after: seconds },
		});
	}

	private async findSession(tokenHash: string): Promise<AuthenticatedMemberSession | null> {
		const session = await this.db.read((manager) =>
			manager.findOneBy(KitMemberSessionsEntity, { token_hash: tokenHash }),
		);
		return session ? { ...session, token_hash: tokenHash } : null;
	}

	private async activeSession(tokenHash: string) {
		const session = await this.findSession(tokenHash);
		if (!session) throw unauthorized();
		const member = await this.members.findById(session.member_id);
		if (member?.status !== "active" || Date.parse(session.expires_at) <= Date.now()) throw unauthorized();
		return { session, member };
	}
}
