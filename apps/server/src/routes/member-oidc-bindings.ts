import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { KitError, MemberOidcBindingInputSchema, MemberOidcBindingResponseSchema } from "@openagentkit/sdk/protocol";
import type { Context } from "hono";
import type { AppEnv } from "../app-env.ts";
import { requireAdminWrite } from "../services/identity.ts";

const path = "/api/admin/members/{memberId}/oidc-binding";
const params = z.object({ memberId: z.string().min(1) });
const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }) });
const errorContent = { "application/json": { schema: errorSchema } };
const errors = {
	400: { description: "绑定参数无效", content: errorContent },
	401: { description: "缺少管理员身份", content: errorContent },
	403: { description: "当前管理身份无权执行此操作", content: errorContent },
	404: { description: "成员不存在或部署未配置 Keycloak", content: errorContent },
	409: { description: "成员或 Keycloak 用户已存在其他绑定", content: errorContent },
};
const bindingResponse = {
	description: "当前 Keycloak 绑定",
	content: { "application/json": { schema: MemberOidcBindingResponseSchema } },
};

function oidcAuth(c: Context<AppEnv>) {
	const service = c.get("services").oidcAuth;
	if (!service) throw new KitError("not_found", "当前部署未配置 Keycloak");
	return service;
}

export function registerMemberOidcBindingRoutes(app: OpenAPIHono<AppEnv>) {
	app.openapi(
		createRoute({
			method: "get",
			path,
			tags: ["admin"],
			request: { params },
			responses: { 200: bindingResponse, ...errors },
		}),
		async (c) => c.json({ data: await oidcAuth(c).getBinding(c.req.valid("param").memberId) }, 200),
	);
	app.openapi(
		createRoute({
			method: "put",
			path,
			tags: ["admin"],
			request: {
				params,
				body: { required: true, content: { "application/json": { schema: MemberOidcBindingInputSchema } } },
			},
			responses: { 200: bindingResponse, ...errors },
		}),
		async (c) => {
			const admin = requireAdminWrite(c, c.get("services").config);
			const binding = await oidcAuth(c).bind(c.req.valid("param").memberId, c.req.valid("json").sub, admin.subject);
			return c.json({ data: binding }, 200);
		},
		(result) => {
			if (!result.success) throw new KitError("invalid_request", "请填写有效的 Keycloak subject");
			return undefined;
		},
	);
	app.openapi(
		createRoute({
			method: "delete",
			path,
			tags: ["admin"],
			request: { params },
			responses: { 204: { description: "已解除当前成员的 Keycloak 绑定" }, ...errors },
		}),
		async (c) => {
			const admin = requireAdminWrite(c, c.get("services").config);
			await oidcAuth(c).unbind(c.req.valid("param").memberId, admin.subject);
			return c.body(null, 204);
		},
	);
}
