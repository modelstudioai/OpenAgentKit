import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { KitError } from "@openagentkit/sdk/protocol";
import type { ServerConfig } from "../config.ts";
import type { AuthenticatedMemberSession, MemberAuthService } from "../service/shared/member-auth.ts";
import type { OidcAuthService, OidcMemberGrant } from "../service/shared/oidc-auth.ts";
import {
	type AdminIdentity,
	type AdminRole,
	ANONYMOUS_COOKIE,
	type Identity,
	identityForMember,
	MEMBER_TOKEN_PREFIX,
} from "../utils/identity-types.ts";
import { verifyJwtClaims } from "../utils/jwt.ts";

type HeaderReader = { header(name: string): string | undefined };
type IdentityRequest = HeaderReader & {
	setHeader(name: string, value: string): void;
	memberSession?: AuthenticatedMemberSession;
	oidcMember?: OidcMemberGrant;
	authExpiresAt?: string;
};

function parseCookies(header: string | undefined): Record<string, string> {
	const out: Record<string, string> = {};
	for (const part of (header ?? "").split(";")) {
		const idx = part.indexOf("=");
		if (idx > 0) {
			try {
				out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
			} catch {
				// 畸形旧匿名 cookie 不影响登录；按未设置处理。
			}
		}
	}
	return out;
}

/**
 * 终端用户身份解析：本地登录 / 可信 JWT；默认拒绝未登录请求。
 * 匿名 cookie 仅用于显式演示模式，不能命中成员命名空间；无效 Bearer 不降级。
 */
export async function resolveIdentity(
	request: IdentityRequest,
	config: ServerConfig,
	memberAuth: MemberAuthService,
	oidcAuth: OidcAuthService,
): Promise<Identity> {
	const auth = request.header("authorization");
	const token = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
	if (config.passwordLogin && token?.startsWith(MEMBER_TOKEN_PREFIX)) {
		const resolved = await memberAuth.resolve(token);
		request.memberSession = resolved.session;
		request.authExpiresAt = resolved.session.expires_at;
		return resolved.view.identity;
	}
	if (config.authMode === "oidc") {
		if (!token) throw new KitError("unauthorized", "请先完成企业登录");
		const grant = await oidcAuth.resolve(token);
		request.oidcMember = grant;
		return identityForMember(grant.member);
	}
	if (auth) {
		const jwt = token && config.jwtSecret ? verifyJwtClaims(token, config.jwtSecret) : null;
		if (jwt) {
			request.authExpiresAt = jwt.expiresAt;
			return jwt.identity;
		}
		throw new KitError("unauthorized", "登录状态无效或已过期，请重新登录");
	}
	if (config.authMode !== "anonymous") throw new KitError("unauthorized", "请先登录");
	const cookies = parseCookies(request.header("cookie"));
	let subjectId = cookies[ANONYMOUS_COOKIE];
	if (!subjectId || subjectId.startsWith("member_") || subjectId.startsWith("kit_member_") || subjectId.length > 256) {
		subjectId = `anon_${randomBytes(9).toString("base64url")}`;
		request.setHeader(
			"Set-Cookie",
			`${ANONYMOUS_COOKIE}=${subjectId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`,
		);
	}
	return { subjectId, displayName: "访客", tier: "anonymous" };
}

function principalId(token: string, role: AdminRole): string {
	return `admin:${role}:${createHash("sha256").update(token).digest("hex").slice(0, 8)}`;
}

function bearerOf(request: HeaderReader): string {
	const auth = request.header("authorization");
	if (!auth?.startsWith("Bearer ")) throw new KitError("unauthorized", "缺少管理端令牌");
	return auth.slice(7);
}

/**
 * 管理端身份：多令牌 + 角色（`ADMIN_TOKEN` 恒为 admin，`KIT_ADMIN_TOKENS` 可追加 auditor）。
 * 常量时间比较；命中后只暴露指纹，令牌本身不进上下文、不进审计、不进日志。
 * 接企业 SSO/RBAC 时替换本函数即可。
 */
export function resolveAdminIdentity(request: HeaderReader, config: ServerConfig): AdminIdentity {
	if (config.adminPrincipals.length === 0) {
		throw new KitError("unauthorized", "服务端未配置 ADMIN_TOKEN / KIT_ADMIN_TOKENS");
	}
	const given = Buffer.from(bearerOf(request));
	for (const principal of config.adminPrincipals) {
		const want = Buffer.from(principal.token);
		if (given.length === want.length && timingSafeEqual(given, want)) {
			return { subject: principalId(principal.token, principal.role), role: principal.role };
		}
	}
	throw new KitError("forbidden", "管理端令牌无效");
}

/** 读取 HTTP 入口已认证的管理端主体。 */
export function requireAdmin(request: { admin: AdminIdentity }): AdminIdentity {
	return request.admin;
}

/**
 * 写操作闸门：auditor 是**只读**角色（看转写、看运营数据、导出），不能改 agent、不能放量、
 * 不能执行任何破坏性动作。中间件已按 method 统一拦截，这里给需要显式声明的路由做纵深防御。
 */
export function requireAdminWrite(request: { admin: AdminIdentity }): AdminIdentity {
	const identity = requireAdmin(request);
	if (identity.role !== "admin") throw new KitError("forbidden", "auditor 是只读角色，不能执行写操作");
	return identity;
}
