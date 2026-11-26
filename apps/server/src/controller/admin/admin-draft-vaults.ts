import { Controller } from "@nestjs/common";
import { ProjectVaultCreateInputSchema, ResourceDraftVaultCreateResultSchema } from "@openagentkit/sdk/protocol";
import { requireAdmin } from "../../http/identity.ts";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";

const errorBody = z.object({
	error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean().optional() }),
});

const error = (description: string) => ({ description, content: { "application/json": { schema: errorBody } } });

const basePath = "/api/admin/resource-drafts/{name}/resources";

const postResourceDraftsByNameResourcesVaultsRoute = defineRoute({
	method: "post",
	path: `${basePath}/vaults`,
	tags: ["admin-resource-draft"],
	request: {
		params: z.object({ name: z.string().min(1) }),
		body: { required: true, content: { "application/json": { schema: ProjectVaultCreateInputSchema } } },
	},
	responses: {
		201: {
			description: "密钥库及密钥引用声明已保存，尚未发布；不返回密钥值",
			content: {
				"application/json": {
					schema: z.object({
						data: ResourceDraftVaultCreateResultSchema,
					}),
				},
			},
		},
		400: error("密钥库参数无效"),
		401: error("管理端未认证"),
		403: error("auditor 不可写"),
		404: error("资源批次不存在"),
		409: error("项目被修改或操作进行中"),
	},
});

@Controller()
export class AdminDraftVaultsController {
	/**
	 * 向当前批次添加密钥库声明，以引用记录凭据并将密钥值暂存在批次内存中。
	 *
	 * @param request - 路径参数 `name` 指定批次，JSON 请求体提供 `base_revision`、`display_name` 和可选的凭据配置 `credentials`。
	 * @return 201，返回新修订号及密钥库的本地标识和显示名称。
	 */
	@KitRoute(postResourceDraftsByNameResourcesVaultsRoute)
	async postResourceDraftsByNameResourcesVaults(
		@KitInput() request: KitRequest<typeof postResourceDraftsByNameResourcesVaultsRoute>,
	) {
		const project = request.draftResources;
		const { subject } = requireAdmin(request);
		request.setHeader("Cache-Control", "no-store");
		return request.json({ data: await project.createVault(request.params.name, request.input, subject) }, 201);
	}
}
