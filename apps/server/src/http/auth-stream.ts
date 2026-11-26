import type { MemberAuthService } from "../service/shared/member-auth.ts";
import type { OidcAuthService } from "../service/shared/oidc-auth.ts";
import { type AuthStreamBinding, expiringAuthStream } from "../utils/expiring-auth-stream.ts";
import type { KitRequest } from "./request.ts";

/** 绑定当前员工的登录凭据，保证 SSE 随注销、解绑或令牌到期终止。 */
export async function createAuthStreamGuard(
	request: KitRequest,
	memberAuth: MemberAuthService,
	oidcAuth: OidcAuthService,
): Promise<AuthStreamBinding> {
	if (request.oidcMember) return oidcAuth.bindStream(request.oidcMember);
	if (request.memberSession) return memberAuth.bindStream(request.memberSession);
	return expiringAuthStream(request.authExpiresAt);
}
