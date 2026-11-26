import { Controller, Inject } from "@nestjs/common";
import { RemoteEnvironmentSchema } from "@openagentkit/sdk/protocol";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import { ProviderAdminService } from "../../service/admin/provider-admin.ts";
import { adminErrors as errors } from "./admin-schemas.ts";

const getRemoteAgentsRoute = defineRoute({
	method: "get",
	path: "/api/admin/remote/agents",
	tags: ["admin"],
	responses: {
		200: {
			description: "Provider 侧 Agent 列表（上架时选择）",
			content: {
				"application/json": {
					schema: z.object({
						data: z.array(
							z.object({
								agent_id: z.string(),
								name: z.string(),
								version: z.number().optional(),
								is_coordinator: z.boolean().optional(),
							}),
						),
					}),
				},
			},
		},
		...errors,
	},
});

const getRemoteEnvironmentsRoute = defineRoute({
	method: "get",
	path: "/api/admin/remote/environments",
	tags: ["admin"],
	responses: {
		200: {
			description: "Provider 侧完整环境列表（上架时选择）",
			content: { "application/json": { schema: z.object({ data: z.array(RemoteEnvironmentSchema) }) } },
		},
		...errors,
	},
});

@Controller()
export class AdminProviderController {
	constructor(@Inject(ProviderAdminService) private readonly providerAdmin: ProviderAdminService) {}

	/**
	 * 列出 Provider 中可选的智能体，供管理员配置模版和目录条目。
	 *
	 * @param request - 已认证的管理端请求。
	 * @return 200，`data` 列出远端智能体 ID、名称及可用的版本和协调者标记。
	 */
	@KitRoute(getRemoteAgentsRoute)
	async getRemoteAgents(@KitInput() request: KitRequest<typeof getRemoteAgentsRoute>) {
		return request.json({ data: await this.providerAdmin.listAgents() }, 200);
	}

	/**
	 * 列出 Provider 中可选的运行环境，供管理员配置目录条目。
	 *
	 * @param request - 已认证的管理端请求。
	 * @return 200，`data` 为可选远端环境的 ID 和名称列表。
	 */
	@KitRoute(getRemoteEnvironmentsRoute)
	async getRemoteEnvironments(@KitInput() request: KitRequest<typeof getRemoteEnvironmentsRoute>) {
		return request.json({ data: await this.providerAdmin.listEnvironments() }, 200);
	}
}
