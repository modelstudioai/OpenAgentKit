import { Controller, Inject } from "@nestjs/common";
import {
	KitError,
	MemberAuthViewSchema,
	MemberLoginRequestSchema,
	MemberLoginResultSchema,
} from "@openagentkit/sdk/protocol";
import type { ServerConfig } from "../../config.ts";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import { MemberAuthService } from "../../service/shared/member-auth.ts";

import { OidcAuthService } from "../../service/shared/oidc-auth.ts";
import { MEMBER_TOKEN_PREFIX } from "../../utils/identity-types.ts";
import { KIT_CONFIG } from "../../utils/injection-tokens.ts";

const errorBody = z.object({
	error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean(), details: z.unknown().optional() }),
});
const errors = {
	400: { description: "登录参数无效", content: { "application/json": { schema: errorBody } } },
	401: { description: "用户名或密码错误，或登录已失效", content: { "application/json": { schema: errorBody } } },
	403: {
		description: "部署仅允许企业登录，或企业账号尚未绑定",
		content: { "application/json": { schema: errorBody } },
	},
	429: { description: "登录尝试过于频繁", content: { "application/json": { schema: errorBody } } },
	502: { description: "暂时无法验证企业登录", content: { "application/json": { schema: errorBody } } },
};

const postAuthLoginRoute = defineRoute({
	method: "post",
	path: "/api/kit/auth/login",
	tags: ["kit"],
	request: { body: { required: true, content: { "application/json": { schema: MemberLoginRequestSchema } } } },
	responses: {
		200: {
			description: "登录成功，签发固定八小时有效的可撤销凭据",
			content: { "application/json": { schema: z.object({ data: MemberLoginResultSchema }) } },
		},
		...errors,
	},
});

const getAuthMeRoute = defineRoute({
	method: "get",
	path: "/api/kit/auth/me",
	tags: ["kit"],
	responses: {
		200: {
			description: "当前有效身份；成员登录与 OIDC 登录返回已关联的本地成员资料",
			content: { "application/json": { schema: z.object({ data: MemberAuthViewSchema }) } },
		},
		...errors,
	},
});

const postAuthLogoutRoute = defineRoute({
	method: "post",
	path: "/api/kit/auth/logout",
	tags: ["kit"],
	responses: { 204: { description: "当前 Kit 访问令牌已在本地撤销；过期或已退出时仍成功" }, 502: errors[502] },
});

@Controller()
export class MemberAuthController {
	constructor(
		@Inject(MemberAuthService) private readonly memberAuth: MemberAuthService,
		@Inject(OidcAuthService) private readonly oidcAuth: OidcAuthService,
		@Inject(KIT_CONFIG) private readonly config: ServerConfig,
	) {}

	/**
	 * 验证本地成员的用户名和密码，签发可撤销的访问令牌。
	 *
	 * @param request - 请求体包含本地成员的 `username` 和 `password`。
	 * @return 200，`data` 包含 `access_token`、`token_type`、`expires_at` 和成员资料 `member`。
	 */
	@KitRoute(postAuthLoginRoute, (result) => {
		if (!result.success) throw new KitError("invalid_request", "请输入有效的用户名和密码");
		return undefined;
	})
	async postAuthLogin(@KitInput() request: KitRequest<typeof postAuthLoginRoute>) {
		if (!this.config.passwordLogin) throw new KitError("forbidden", "请使用企业登录");
		try {
			return request.json({ data: await this.memberAuth.login(request.input) }, 200);
		} catch (error) {
			if (error instanceof KitError && error.code === "rate_limited") {
				const retryAfter = (error.details as { retry_after: number }).retry_after;
				request.setHeader("Retry-After", String(retryAfter));
			}
			throw error;
		}
	}

	/**
	 * 读取当前令牌对应的身份，以及可用的成员资料和到期时间。
	 *
	 * @param request - `Authorization` 请求头携带当前身份的 Bearer 令牌。
	 * @return 200，`data` 包含 `identity`，以及可用的 `member` 和 `expires_at`。
	 */
	@KitRoute(getAuthMeRoute)
	async getAuthMe(@KitInput() request: KitRequest<typeof getAuthMeRoute>) {
		const identity = request.identity;
		if (!request.header("authorization")) throw new KitError("unauthorized", "请先登录");
		const oidcMember = request.oidcMember;
		if (oidcMember) {
			return request.json({ data: { identity, member: oidcMember.member, expires_at: oidcMember.expiresAt } }, 200);
		}
		const memberSession = request.memberSession;
		if (memberSession) {
			const token = (request.header("authorization") as string).slice(7);
			return request.json({ data: (await this.memberAuth.resolve(token)).view }, 200);
		}
		const expiresAt = request.authExpiresAt;
		return request.json({ data: { identity, ...(expiresAt ? { expires_at: expiresAt } : {}) } }, 200);
	}

	/**
	 * 撤销当前员工访问令牌，并关闭使用该令牌的 SSE 订阅。
	 *
	 * @param request - `Authorization` 请求头可携带要撤销的本地成员或 OIDC Bearer 令牌。
	 * @return 204，响应体为空，重复退出同样成功。
	 */
	@KitRoute(postAuthLogoutRoute)
	async postAuthLogout(@KitInput() request: KitRequest<typeof postAuthLogoutRoute>) {
		const authorization = request.header("authorization");
		const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
		if (this.config.authMode === "oidc" && !(this.config.passwordLogin && token?.startsWith(MEMBER_TOKEN_PREFIX))) {
			await this.oidcAuth.logout(token);
		} else {
			await this.memberAuth.logout(token);
		}
		return request.empty(204);
	}
}
