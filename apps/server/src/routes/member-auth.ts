import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import {
	KitError,
	MemberAuthViewSchema,
	MemberLoginRequestSchema,
	MemberLoginResultSchema,
} from "@openagentkit/sdk/protocol";
import type { AppEnv } from "../app-env.ts";
import { MEMBER_TOKEN_PREFIX } from "../services/member-auth.ts";

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

export function registerMemberAuthRoutes(app: OpenAPIHono<AppEnv>) {
	app.openapi(
		createRoute({
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
		}),
		async (c) => {
			if (!c.get("services").config.passwordLogin) throw new KitError("forbidden", "请使用企业登录");
			try {
				return c.json({ data: await c.get("services").memberAuth.login(c.req.valid("json")) }, 200);
			} catch (error) {
				if (error instanceof KitError && error.code === "rate_limited") {
					const retryAfter = (error.details as { retry_after: number }).retry_after;
					c.header("Retry-After", String(retryAfter));
				}
				throw error;
			}
		},
		(result) => {
			if (!result.success) throw new KitError("invalid_request", "请输入有效的用户名和密码");
			return undefined;
		},
	);
	app.openapi(
		createRoute({
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
		}),
		async (c) => {
			const identity = c.get("identity");
			if (!c.req.header("authorization")) throw new KitError("unauthorized", "请先登录");
			const oidcMember = c.get("oidcMember");
			if (oidcMember)
				return c.json({ data: { identity, member: oidcMember.member, expires_at: oidcMember.expiresAt } }, 200);
			const memberSession = c.get("memberSession");
			if (memberSession) {
				const token = (c.req.header("authorization") as string).slice(7);
				return c.json({ data: (await c.get("services").memberAuth.resolve(token)).view }, 200);
			}
			const expiresAt = c.get("authExpiresAt");
			return c.json({ data: { identity, ...(expiresAt ? { expires_at: expiresAt } : {}) } }, 200);
		},
	);
	app.openapi(
		createRoute({
			method: "post",
			path: "/api/kit/auth/logout",
			tags: ["kit"],
			responses: {
				204: { description: "当前 Kit 访问令牌已在本地撤销；过期或已退出时仍成功" },
				502: errors[502],
			},
		}),
		async (c) => {
			const authorization = c.req.header("authorization");
			const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
			const { config, memberAuth, oidcAuth } = c.get("services");
			if (config.authMode === "oidc" && !(config.passwordLogin && token?.startsWith(MEMBER_TOKEN_PREFIX))) {
				if (!oidcAuth) throw new KitError("internal", "缺少 Keycloak OIDC 配置");
				await oidcAuth.logout(token);
			} else await memberAuth.logout(token);
			return c.body(null, 204);
		},
	);
}
