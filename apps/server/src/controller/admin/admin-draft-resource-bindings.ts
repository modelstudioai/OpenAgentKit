import { Controller } from "@nestjs/common";
import { ProjectResourceBindingInputSchema, ProjectResourceBindingsSchema } from "@openagentkit/sdk/protocol";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";

const errorBody = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

const error = (description: string) => ({ description, content: { "application/json": { schema: errorBody } } });

const basePath = "/api/admin/resource-drafts/{name}/resources";

const getResourceDraftsByNameResourcesResourceBindingsRoute = defineRoute({
	method: "get",
	path: `${basePath}/resource-bindings`,
	tags: ["admin-resource-draft"],
	request: { params: z.object({ name: z.string().min(1) }) },
	responses: {
		200: {
			description: "当前源码内已发布且绑定完整的资源标识与 Agent 具体版本",
			content: { "application/json": { schema: z.object({ data: ProjectResourceBindingsSchema }) } },
		},
		401: error("管理端未认证"),
		404: error("项目不存在"),
		409: error("批次声明变化或正在修改"),
	},
});

const postResourceDraftsByNameResourcesResourceBindingsResolveRoute = defineRoute({
	method: "post",
	path: `${basePath}/resource-bindings/resolve`,
	tags: ["admin-resource-draft"],
	request: {
		params: z.object({ name: z.string().min(1) }),
		body: { required: true, content: { "application/json": { schema: ProjectResourceBindingInputSchema } } },
	},
	responses: {
		200: {
			description: "本地声明已发布的远端标识与 Agent 具体版本",
			content: { "application/json": { schema: z.object({ data: ProjectResourceBindingsSchema }) } },
		},
		400: error("资源引用参数无效"),
		401: error("管理端未认证"),
		403: error("当前角色不能使用 POST 查询"),
		404: error("项目或声明不存在"),
		409: error("尚未发布、绑定不完整或项目正在修改"),
	},
});

@Controller()
export class AdminDraftResourceBindingsController {
	/**
	 * 列出批次中已发布资源的远端绑定，其中智能体绑定包含具体版本。
	 *
	 * @param request - 路径参数 `name` 为当前管理员的批次标识。
	 * @return 200，`data.resources` 列出资源的类型、本地标识与远端标识，智能体另含具体版本。
	 */
	@KitRoute(getResourceDraftsByNameResourcesResourceBindingsRoute)
	async getResourceDraftsByNameResourcesResourceBindings(
		@KitInput() request: KitRequest<typeof getResourceDraftsByNameResourcesResourceBindingsRoute>,
	) {
		request.setHeader("Cache-Control", "no-store");
		return request.json({ data: await request.draftResources.resourceBindings(request.params.name) }, 200);
	}

	/**
	 * 按指定的资源引用解析远端标识和智能体版本，并检查所选绑定是否完整。
	 *
	 * @param request - 路径参数 `name` 指定批次，JSON 请求体的 `resources` 列出所选资源的 `type` 和本地 `id`。
	 * @return 200，`data.resources` 返回所选资源的远端标识及适用的智能体版本。
	 */
	@KitRoute(postResourceDraftsByNameResourcesResourceBindingsResolveRoute)
	async postResourceDraftsByNameResourcesResourceBindingsResolve(
		@KitInput() request: KitRequest<typeof postResourceDraftsByNameResourcesResourceBindingsResolveRoute>,
	) {
		request.setHeader("Cache-Control", "no-store");
		return request.json(
			{
				data: await request.draftResources.resolveResourceBindings(request.params.name, request.input),
			},
			200,
		);
	}
}
