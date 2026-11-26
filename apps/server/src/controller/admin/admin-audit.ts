import { Controller, Inject } from "@nestjs/common";
import { AuditLogsPageSchema, AuditLogsQuerySchema } from "@openagentkit/sdk/protocol";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import { AuditService } from "../../service/shared/audit.ts";

const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

const getAuditRoute = defineRoute({
	method: "get",
	path: "/api/admin/audit",
	tags: ["admin"],
	request: { query: AuditLogsQuerySchema },
	responses: {
		200: {
			description: "当前管理身份的操作审计日志",
			content: { "application/json": { schema: AuditLogsPageSchema } },
		},
		400: { description: "查询参数无效", content: { "application/json": { schema: errorSchema } } },
		401: { description: "管理端未认证", content: { "application/json": { schema: errorSchema } } },
		403: { description: "令牌无效", content: { "application/json": { schema: errorSchema } } },
	},
});

@Controller()
export class AdminAuditController {
	constructor(@Inject(AuditService) private readonly auditService: AuditService) {}

	/**
	 * 分页查询当前管理身份的操作审计记录。
	 *
	 * @param request - 按当前管理身份查询，可用 `limit` 和 `offset` 分页。
	 * @return 200，`data` 为本页审计记录，`total` 为匹配记录总数。
	 */
	@KitRoute(getAuditRoute)
	async getAudit(@KitInput() request: KitRequest<typeof getAuditRoute>) {
		request.setHeader("Cache-Control", "no-store");
		return request.json(await this.auditService.page(request.admin.subject, request.query), 200);
	}
}
