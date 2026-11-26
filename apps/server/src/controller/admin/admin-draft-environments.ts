import { Controller } from "@nestjs/common";
import {
	ProjectEnvironmentCreateInputSchema,
	ResourceDraftEnvironmentCreateResultSchema,
} from "@openagentkit/sdk/protocol";
import { requireAdmin } from "../../http/identity.ts";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";

const errorBody = z.object({
	error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean().optional() }),
});

const error = (description: string) => ({ description, content: { "application/json": { schema: errorBody } } });

const basePath = "/api/admin/resource-drafts/{name}/resources";

const postResourceDraftsByNameResourcesEnvironmentsRoute = defineRoute({
	method: "post",
	path: `${basePath}/environments`,
	tags: ["admin-resource-draft"],
	request: {
		params: z.object({ name: z.string().min(1) }),
		body: { required: true, content: { "application/json": { schema: ProjectEnvironmentCreateInputSchema } } },
	},
	responses: {
		201: {
			description: "共享环境声明已保存到批次声明，尚未发布",
			content: {
				"application/json": {
					schema: z.object({
						data: ResourceDraftEnvironmentCreateResultSchema,
					}),
				},
			},
		},
		400: error("环境参数无效"),
		401: error("管理端未认证"),
		403: error("auditor 不可写"),
		404: error("资源批次不存在"),
		409: error("项目被修改或操作进行中"),
	},
});

@Controller()
export class AdminDraftEnvironmentsController {
	/**
	 * 向当前批次添加共享环境声明，保存软件包和网络配置。
	 *
	 * @param request - 路径参数 `name` 指定批次，JSON 请求体提供 `base_revision` 和环境名称，可附软件包、网络和元数据配置。
	 * @return 201，返回新修订号及环境的本地标识和名称。
	 */
	@KitRoute(postResourceDraftsByNameResourcesEnvironmentsRoute)
	async postResourceDraftsByNameResourcesEnvironments(
		@KitInput() request: KitRequest<typeof postResourceDraftsByNameResourcesEnvironmentsRoute>,
	) {
		const project = request.draftResources;
		const { subject } = requireAdmin(request);
		request.setHeader("Cache-Control", "no-store");
		return request.json({ data: await project.createEnvironment(request.params.name, request.input, subject) }, 201);
	}
}
