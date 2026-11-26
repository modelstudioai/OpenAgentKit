import { Controller, Inject } from "@nestjs/common";
import { KitError, MemberOidcBindingInputSchema, MemberOidcBindingResponseSchema } from "@openagentkit/sdk/protocol";
import { requireAdminWrite } from "../../http/identity.ts";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import { OidcAuthService } from "../../service/shared/oidc-auth.ts";

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

const getBinding = defineRoute({
	method: "get",
	path,
	tags: ["admin"],
	request: { params },
	responses: { 200: bindingResponse, ...errors },
});
const putBinding = defineRoute({
	method: "put",
	path,
	tags: ["admin"],
	request: {
		params,
		body: { required: true, content: { "application/json": { schema: MemberOidcBindingInputSchema } } },
	},
	responses: { 200: bindingResponse, ...errors },
});
const deleteBinding = defineRoute({
	method: "delete",
	path,
	tags: ["admin"],
	request: { params },
	responses: { 204: { description: "已解除当前成员的 Keycloak 绑定" }, ...errors },
});

@Controller()
export class AdminMemberOidcBindingsController {
	constructor(@Inject(OidcAuthService) private readonly oidcAuth: OidcAuthService) {}

	/**
	 * 查询员工当前关联的 Keycloak 账号。
	 * @param request - 路径参数 memberId 指定本地员工。
	 * @return 200，data 包含当前绑定，尚未绑定时为 null。
	 */
	@KitRoute(getBinding)
	async get(@KitInput() request: KitRequest<typeof getBinding>) {
		return request.json({ data: await this.oidcAuth.getBinding(request.params.memberId) }, 200);
	}

	/**
	 * 将 Keycloak 账号绑定到指定员工。
	 * @param request - 路径参数 memberId 指定员工，请求体 sub 标识企业账号。
	 * @return 200，data 包含生效的绑定。
	 */
	@KitRoute(putBinding, () => {
		throw new KitError("invalid_request", "请填写有效的 Keycloak subject");
	})
	async bind(@KitInput() request: KitRequest<typeof putBinding>) {
		const admin = requireAdminWrite(request);
		const binding = await this.oidcAuth.bind(request.params.memberId, request.input.sub, admin.subject);
		return request.json({ data: binding }, 200);
	}

	/**
	 * 解除员工的 Keycloak 绑定并撤销对应访问。
	 * @param request - 路径参数 memberId 指定本地员工。
	 * @return 204，响应体为空。
	 */
	@KitRoute(deleteBinding)
	async unbind(@KitInput() request: KitRequest<typeof deleteBinding>) {
		const admin = requireAdminWrite(request);
		await this.oidcAuth.unbind(request.params.memberId, admin.subject);
		return request.empty(204);
	}
}
