import { Controller, Inject } from "@nestjs/common";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import { ResourceDraftService } from "../../service/admin/resource-draft/resource-drafts.ts";
import { adminErrors as errors } from "./admin-schemas.ts";

const getOperationsRoute = defineRoute({
	method: "get",
	path: "/api/admin/operations",
	tags: ["admin"],
	request: { query: z.object({ session_id: z.string().optional(), limit: z.coerce.number().optional() }) },
	responses: {
		200: {
			description: "操作记录",
			content: { "application/json": { schema: z.object({ data: z.array(z.unknown()) }) } },
		},
		...errors,
	},
});

@Controller()
export class AdminOperationsController {
	constructor(@Inject(ResourceDraftService) private readonly resourceDrafts: ResourceDraftService) {}

	/**
	 * 列出当前管理身份可见的操作记录，支持按会话筛选和限制返回条数。
	 *
	 * @param request - 使用当前管理身份查询，可用 `session_id` 筛选会话、用 `limit` 限制条数。
	 * @return 200，`data` 为该身份可见的操作记录列表。
	 */
	@KitRoute(getOperationsRoute)
	async getOperations(@KitInput() request: KitRequest<typeof getOperationsRoute>) {
		const query = request.query;
		const data = await this.resourceDrafts.listOperations(request.admin.subject, {
			...(query.session_id ? { sessionId: query.session_id } : {}),
			...(query.limit ? { limit: query.limit } : {}),
		});
		return request.json({ data }, 200);
	}
}
