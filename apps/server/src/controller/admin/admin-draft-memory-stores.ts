import { Controller } from "@nestjs/common";
import {
	MemoryStoreConfigurationSchema,
	ProjectMemoryStoreCreateInputSchema,
	ResourceDraftMemoryStoreCreateResultSchema,
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

const getResourceDraftsByNameResourcesMemoryStoresByStoreIdRoute = defineRoute({
	method: "get",
	path: `${basePath}/memory-stores/{storeId}`,
	tags: ["admin-resource-draft"],
	request: { params: z.object({ name: z.string().min(1), storeId: z.string().regex(/^[A-Za-z0-9_-]+$/) }) },
	responses: {
		200: {
			description: "本地记忆库配置及已解析条目正文",
			content: { "application/json": { schema: z.object({ data: MemoryStoreConfigurationSchema }) } },
		},
		400: error("记忆库参数无效"),
		401: error("管理端未认证"),
		403: error("无读取权限"),
		404: error("项目或记忆库不存在"),
		409: error("项目正在修改"),
	},
});

const postResourceDraftsByNameResourcesMemoryStoresRoute = defineRoute({
	method: "post",
	path: `${basePath}/memory-stores`,
	tags: ["admin-resource-draft"],
	request: {
		params: z.object({ name: z.string().min(1) }),
		body: { required: true, content: { "application/json": { schema: ProjectMemoryStoreCreateInputSchema } } },
	},
	responses: {
		201: {
			description: "记忆库声明已保存到批次声明，尚未发布",
			content: {
				"application/json": {
					schema: z.object({
						data: ResourceDraftMemoryStoreCreateResultSchema,
					}),
				},
			},
		},
		400: error("记忆库参数无效"),
		401: error("管理端未认证"),
		403: error("auditor 不可写"),
		404: error("资源批次不存在"),
		409: error("项目被修改或操作进行中"),
	},
});

@Controller()
export class AdminDraftMemoryStoresController {
	/**
	 * 读取当前批次指定记忆库的配置和初始条目正文。
	 *
	 * @param request - 路径参数 `name` 和 `storeId` 分别指定批次与记忆库声明。
	 * @return 200，返回记忆库标识、名称、说明和初始化条目。
	 */
	@KitRoute(getResourceDraftsByNameResourcesMemoryStoresByStoreIdRoute)
	async getResourceDraftsByNameResourcesMemoryStoresByStoreId(
		@KitInput() request: KitRequest<typeof getResourceDraftsByNameResourcesMemoryStoresByStoreIdRoute>,
	) {
		request.setHeader("Cache-Control", "no-store");
		const { name, storeId } = request.params;
		return request.json({ data: await request.draftResources.memoryStoreConfiguration(name, storeId) }, 200);
	}

	/**
	 * 向当前批次添加记忆库声明及其初始条目。
	 *
	 * @param request - 路径参数 `name` 指定批次，JSON 请求体提供 `base_revision` 和记忆库名称，可附说明及初始条目 `entries`。
	 * @return 201，返回新修订号及记忆库的本地标识和名称。
	 */
	@KitRoute(postResourceDraftsByNameResourcesMemoryStoresRoute)
	async postResourceDraftsByNameResourcesMemoryStores(
		@KitInput() request: KitRequest<typeof postResourceDraftsByNameResourcesMemoryStoresRoute>,
	) {
		const project = request.draftResources;
		const { subject } = requireAdmin(request);
		request.setHeader("Cache-Control", "no-store");
		return request.json({ data: await project.createMemoryStore(request.params.name, request.input, subject) }, 201);
	}
}
