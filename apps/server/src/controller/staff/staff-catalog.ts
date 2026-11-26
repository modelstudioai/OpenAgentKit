import { Controller, Inject } from "@nestjs/common";
import { AgentDetailSchema, AgentSummarySchema } from "@openagentkit/sdk/protocol";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import { StaffCatalogService } from "../../service/staff/catalog.ts";

import { data, kitErrors as errors } from "./staff-schemas.ts";

const getAgentsRoute = defineRoute({
	method: "get",
	path: "/api/kit/agents",
	tags: ["kit"],
	responses: {
		200: {
			description: "已上架条目",
			content: { "application/json": { schema: data(z.array(AgentSummarySchema)) } },
		},
		...errors,
	},
});

const getAgentsBySlugRoute = defineRoute({
	method: "get",
	path: "/api/kit/agents/{slug}",
	tags: ["kit"],
	request: { params: z.object({ slug: z.string() }) },
	responses: {
		200: { description: "条目详情", content: { "application/json": { schema: data(AgentDetailSchema) } } },
		...errors,
	},
});

@Controller()
export class StaffCatalogController {
	constructor(@Inject(StaffCatalogService) private readonly catalogService: StaffCatalogService) {}

	/**
	 * 列出员工端可使用的已上架智能体。
	 *
	 * @param request - 已通过员工端身份校验的目录查询请求，无筛选参数。
	 * @return 200，`data` 为已上架智能体摘要数组，包含 `slug`、`display_name` 和 `capabilities` 等字段。
	 */
	@KitRoute(getAgentsRoute)
	async getAgents(@KitInput() request: KitRequest<typeof getAgentsRoute>) {
		return request.json({ data: await this.catalogService.listPublished() }, 200);
	}

	/**
	 * 按标识查询已上架智能体的详情及可见资源。
	 *
	 * @param request - 路径参数 `slug` 指定已上架智能体的目录标识。
	 * @return 200，`data` 包含智能体详情及可用的资源摘要。
	 */
	@KitRoute(getAgentsBySlugRoute)
	async getAgentsBySlug(@KitInput() request: KitRequest<typeof getAgentsBySlugRoute>) {
		return request.json({ data: await this.catalogService.publishedDetail(request.pathParam("slug")) }, 200);
	}
}
