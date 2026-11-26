import { Controller, Inject } from "@nestjs/common";
import { SessionAgentsPageSchema, SessionListQuerySchema, SessionPageSchema } from "@openagentkit/sdk/protocol";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import { KitSessionService } from "../../service/staff/kit-sessions.ts";

const errorBody = z.object({ error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }) });

const errors = {
	400: { description: "查询参数或游标无效", content: { "application/json": { schema: errorBody } } },
	401: { description: "未认证", content: { "application/json": { schema: errorBody } } },
};

const getSessionAgentsRoute = defineRoute({
	method: "get",
	path: "/api/kit/session-agents",
	tags: ["kit"],
	responses: {
		200: {
			description: "本人未归档体验会话关联的全部智能体 slug",
			content: { "application/json": { schema: SessionAgentsPageSchema } },
		},
		...errors,
	},
});

const getSessionsRoute = defineRoute({
	method: "get",
	path: "/api/kit/sessions",
	tags: ["kit"],
	request: { query: SessionListQuerySchema },
	responses: {
		200: {
			description: "本人体验会话索引，按最近活动和会话 ID 倒序分页",
			content: { "application/json": { schema: SessionPageSchema } },
		},
		...errors,
	},
});

@Controller()
export class SessionDirectoryController {
	constructor(@Inject(KitSessionService) private readonly kitSessions: KitSessionService) {}

	/**
	 * 列出本人未归档的体验会话所关联的智能体标识。
	 *
	 * @param request - 请求身份用于限定本人的体验会话。
	 * @return 200，`data` 为本人未归档会话关联的智能体 `slug` 数组。
	 */
	@KitRoute(getSessionAgentsRoute)
	async getSessionAgents(@KitInput() request: KitRequest<typeof getSessionAgentsRoute>) {
		return request.json({ data: await this.kitSessions.listAgents(request.identity.subjectId) }, 200);
	}

	/**
	 * 按最近活动分页查询本人的体验会话，支持按智能体、关键词和归档状态筛选。
	 *
	 * @param request - 查询参数 `agent_slug`、`q` 和 `include_archived` 控制筛选，`limit` 和 `page_token` 控制分页。
	 * @return 200，`data` 为按最近活动倒序排列的会话摘要，`next_page_token` 用于读取下一页。
	 */
	@KitRoute(getSessionsRoute)
	async getSessions(@KitInput() request: KitRequest<typeof getSessionsRoute>) {
		const query = request.query;
		return request.json(
			await this.kitSessions.listPage(request.identity.subjectId, {
				agentSlug: query.agent_slug,
				limit: query.limit,
				pageToken: query.page_token,
				includeArchived: query.include_archived !== "false",
				...(query.q ? { q: query.q } : {}),
			}),
			200,
		);
	}
}
