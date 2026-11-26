import { Controller, Inject } from "@nestjs/common";
import { RemoteSkillSchema, RemoteSkillsQuerySchema } from "@openagentkit/sdk/protocol";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import { ProviderAdminService } from "../../service/admin/provider-admin.ts";

const getRemoteSkillsRoute = defineRoute({
	method: "get",
	path: "/api/admin/remote/skills",
	tags: ["admin"],
	request: { query: RemoteSkillsQuerySchema },
	responses: {
		200: {
			description: "指定来源的完整 Skill 候选列表",
			content: { "application/json": { schema: z.object({ data: z.array(RemoteSkillSchema) }) } },
		},
		400: { description: "Skill 来源无效" },
		401: { description: "管理端未认证" },
		403: { description: "无管理端读取权限" },
		502: { description: "Skill 列表查询失败" },
	},
});

@Controller()
export class AdminRemoteSkillsController {
	constructor(@Inject(ProviderAdminService) private readonly providerAdmin: ProviderAdminService) {}

	/**
	 * 按来源列出可供管理员选择的远端 Skill。
	 *
	 * @param request - 查询参数 `source` 可选 `official` 或 `custom`，默认 `custom`。
	 * @return 200，`data` 包含 Skill 标识、名称、来源、状态和可用版本信息。
	 */
	@KitRoute(getRemoteSkillsRoute)
	async getRemoteSkills(@KitInput() request: KitRequest<typeof getRemoteSkillsRoute>) {
		request.setHeader("Cache-Control", "no-store");
		return request.json({ data: await this.providerAdmin.listSkills(request.query.source) }, 200);
	}
}
