import { Controller, Inject } from "@nestjs/common";
import { RemoteFileSchema } from "@openagentkit/sdk/protocol";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import { ProviderAdminService } from "../../service/admin/provider-admin.ts";

const errorBody = z.object({ error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }) });

const getRemoteFilesRoute = defineRoute({
	method: "get",
	path: "/api/admin/remote/files",
	tags: ["admin"],
	responses: {
		200: {
			description: "Provider 已上传文件完整列表；保留扫描状态供选择器禁用不可用项",
			content: { "application/json": { schema: z.object({ data: z.array(RemoteFileSchema) }) } },
		},
		401: { description: "管理端未认证", content: { "application/json": { schema: errorBody } } },
		403: { description: "管理端令牌无效", content: { "application/json": { schema: errorBody } } },
		502: { description: "Provider 文件列表查询失败", content: { "application/json": { schema: errorBody } } },
	},
});

@Controller()
export class AdminFilesController {
	constructor(@Inject(ProviderAdminService) private readonly providerAdmin: ProviderAdminService) {}

	/**
	 * 列出 Provider 已上传的文件及扫描状态，供管理员选择可用文件。
	 *
	 * @param request - 已认证的管理端请求。
	 * @return 200，`data` 列出远端文件的 ID、名称、大小、扫描状态及可用性。
	 */
	@KitRoute(getRemoteFilesRoute)
	async getRemoteFiles(@KitInput() request: KitRequest<typeof getRemoteFilesRoute>) {
		return request.json({ data: await this.providerAdmin.listFiles() }, 200);
	}
}
