import { Controller, Inject } from "@nestjs/common";
import { MemoryStoreConfigurationSchema, RemoteMemoryStoreSchema } from "@openagentkit/sdk/protocol";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import { ProviderAdminService } from "../../service/admin/provider-admin.ts";

const errorBody = z.object({ error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }) });

const getRemoteMemoryStoresByStoreIdRoute = defineRoute({
	method: "get",
	path: "/api/admin/remote/memory-stores/{storeId}",
	tags: ["admin"],
	request: { params: z.object({ storeId: z.string().regex(/^[A-Za-z0-9_-]+$/) }) },
	responses: {
		200: {
			description: "完整记忆库配置及条目正文，仅用于管理员导入",
			content: { "application/json": { schema: z.object({ data: MemoryStoreConfigurationSchema }) } },
		},
		400: { description: "记忆库 ID 无效" },
		401: { description: "管理端未认证" },
		403: { description: "无读取权限" },
		404: { description: "记忆库不存在或已归档" },
		502: { description: "条目未完整读取或超出可编辑范围" },
	},
});

const getRemoteMemoryStoresRoute = defineRoute({
	method: "get",
	path: "/api/admin/remote/memory-stores",
	tags: ["admin"],
	responses: {
		200: {
			description: "Provider 未归档记忆库完整列表；只返回 ID 与名称，不读取记忆内容",
			content: { "application/json": { schema: z.object({ data: z.array(RemoteMemoryStoreSchema) }) } },
		},
		401: { description: "管理端未认证", content: { "application/json": { schema: errorBody } } },
		403: { description: "管理端令牌无效", content: { "application/json": { schema: errorBody } } },
		502: { description: "Provider 记忆库查询失败", content: { "application/json": { schema: errorBody } } },
	},
});

@Controller()
export class AdminMemoryStoresController {
	constructor(@Inject(ProviderAdminService) private readonly providerAdmin: ProviderAdminService) {}

	/**
	 * 读取指定远端记忆库的配置和条目正文，供管理员导入。
	 *
	 * @param request - 路径参数 `storeId` 指定待导入的远端记忆库。
	 * @return 200，`data` 包含记忆库配置及含正文的条目列表。
	 */
	@KitRoute(getRemoteMemoryStoresByStoreIdRoute)
	async getRemoteMemoryStoresByStoreId(@KitInput() request: KitRequest<typeof getRemoteMemoryStoresByStoreIdRoute>) {
		request.setHeader("Cache-Control", "no-store");
		const data = await this.providerAdmin.memoryStoreConfiguration(request.params.storeId);
		return request.json({ data }, 200);
	}

	/**
	 * 列出可选的未归档远端记忆库，返回各库的 ID 和名称。
	 *
	 * @param request - 已认证的管理端请求。
	 * @return 200，`data` 为未归档记忆库的 ID 和名称列表。
	 */
	@KitRoute(getRemoteMemoryStoresRoute)
	async getRemoteMemoryStores(@KitInput() request: KitRequest<typeof getRemoteMemoryStoresRoute>) {
		return request.json({ data: await this.providerAdmin.listMemoryStores() }, 200);
	}
}
