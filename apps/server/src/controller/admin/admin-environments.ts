import { Controller, Inject } from "@nestjs/common";
import { RemoteEnvironmentDetailSchema } from "@openagentkit/sdk/protocol";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import { ProviderAdminService } from "../../service/admin/provider-admin.ts";

const getRemoteEnvironmentsByEnvironmentIdRoute = defineRoute({
	method: "get",
	path: "/api/admin/remote/environments/{environmentId}",
	tags: ["admin"],
	request: { params: z.object({ environmentId: z.string().regex(/^[A-Za-z0-9_-]+$/) }) },
	responses: {
		200: {
			description: "环境基本信息与脱敏后的运行配置",
			content: { "application/json": { schema: z.object({ data: RemoteEnvironmentDetailSchema }) } },
		},
		400: { description: "环境 ID 无效" },
		401: { description: "管理端未认证" },
		403: { description: "无管理端读取权限" },
		404: { description: "环境不存在或已不可用" },
	},
});

@Controller()
export class AdminEnvironmentsController {
	constructor(@Inject(ProviderAdminService) private readonly providerAdmin: ProviderAdminService) {}

	/**
	 * 读取指定远端环境的基本信息和脱敏后的运行配置。
	 *
	 * @param request - 路径参数 `environmentId` 指定远端环境。
	 * @return 200，`data` 包含环境基本信息、运行配置及受限字段清单。
	 */
	@KitRoute(getRemoteEnvironmentsByEnvironmentIdRoute)
	async getRemoteEnvironmentsByEnvironmentId(
		@KitInput() request: KitRequest<typeof getRemoteEnvironmentsByEnvironmentIdRoute>,
	) {
		request.setHeader("Cache-Control", "no-store");
		return request.json({ data: await this.providerAdmin.environmentDetail(request.params.environmentId) }, 200);
	}
}
