import type { MemberView } from "@openagentkit/sdk/protocol";

export type AdminRole = "admin" | "auditor";

export interface AdminIdentity {
	/** 审计主体使用 `admin:<role>:<令牌指纹>`。 */
	subject: string;
	role: AdminRole;
}

/** 终端用户身份：只由 server 的 IdentityProvider 解析；浏览器不持有该内部结构。 */
export interface Identity {
	subjectId: string;
	displayName?: string;
	tier?: string;
	metadata?: Record<string, unknown>;
}

export interface IdentityContext {
	/** 原始请求头或注入的凭据头。 */
	headers: Record<string, string>;
	/** 客户端提示（cookie / UA / 注入对象） */
	cookies?: Record<string, string>;
}

export interface IdentityProvider {
	readonly name: string;
	resolve(context: IdentityContext): Promise<Identity | null>;
}

export const ANONYMOUS_COOKIE = "kit_subject";
export const MEMBER_TOKEN_PREFIX = "kit_member_";
export const MEMBER_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export function identityForMember(member: MemberView): Identity {
	return { subjectId: member.member_id, displayName: member.display_name, tier: "member" };
}
