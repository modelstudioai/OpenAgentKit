import { Controller, Inject } from "@nestjs/common";
import { RemoteAgentVersionDetailSchema, RemoteAgentVersionSchema } from "@openagentkit/sdk/protocol";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import { ProviderAdminService } from "../../service/admin/provider-admin.ts";

const getRemoteAgentsByAgentIdVersionsRoute = defineRoute({
	method: "get",
	path: "/api/admin/remote/agents/{agentId}/versions",
	tags: ["admin"],
	request: { params: z.object({ agentId: z.string().regex(/^[A-Za-z0-9_-]+$/) }) },
	responses: {
		200: {
			description: "可选择的远端 Agent 版本，按版本号降序排列",
			content: { "application/json": { schema: z.object({ data: z.array(RemoteAgentVersionSchema) }) } },
		},
		400: { description: "Agent ID 无效" },
		401: { description: "管理端未认证" },
		403: { description: "无管理端读取权限" },
		404: { description: "Agent 不存在" },
	},
});

const getRemoteAgentsByAgentIdVersionsByVersionRoute = defineRoute({
	method: "get",
	path: "/api/admin/remote/agents/{agentId}/versions/{version}",
	tags: ["admin"],
	request: {
		params: z.object({
			agentId: z.string().regex(/^[A-Za-z0-9_-]+$/),
			version: z.coerce.number().int().positive(),
		}),
	},
	responses: {
		200: {
			description: "指定远端 Agent 版本的安全配置投影",
			content: { "application/json": { schema: z.object({ data: RemoteAgentVersionDetailSchema }) } },
		},
		400: { description: "Agent ID 或版本无效" },
		401: { description: "管理端未认证" },
		403: { description: "无管理端读取权限" },
		404: { description: "Agent 或版本不存在、已不可用" },
	},
});

@Controller()
export class AdminAgentVersionsController {
	constructor(@Inject(ProviderAdminService) private readonly providerAdmin: ProviderAdminService) {}

	/**
	 * 按版本号从新到旧列出指定远端智能体可选的版本。
	 *
	 * @param request - 路径参数 `agentId` 指定远端智能体。
	 * @return 200，`data` 为按版本号降序排列的版本列表。
	 */
	@KitRoute(getRemoteAgentsByAgentIdVersionsRoute)
	async getRemoteAgentsByAgentIdVersions(
		@KitInput() request: KitRequest<typeof getRemoteAgentsByAgentIdVersionsRoute>,
	) {
		return request.json({ data: await this.providerAdmin.listAgentVersions(request.params.agentId) }, 200);
	}

	/**
	 * 读取远端智能体指定版本的配置摘要，供管理员核对所选版本。
	 *
	 * @param request - 路径参数 `agentId` 和 `version` 指定智能体及版本。
	 * @return 200，`data` 包含版本信息、脱敏配置和已脱敏字段清单。
	 */
	@KitRoute(getRemoteAgentsByAgentIdVersionsByVersionRoute)
	async getRemoteAgentsByAgentIdVersionsByVersion(
		@KitInput() request: KitRequest<typeof getRemoteAgentsByAgentIdVersionsByVersionRoute>,
	) {
		const { agentId, version } = request.params;
		return request.json({ data: await this.providerAdmin.agentVersionDetail(agentId, version) }, 200);
	}
}
