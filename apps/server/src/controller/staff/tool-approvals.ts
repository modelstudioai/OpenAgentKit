import { Controller, Inject } from "@nestjs/common";
import {
	SendMessageResponseSchema,
	ToolApprovalDecisionSchema,
	ToolApprovalsResponseSchema,
} from "@openagentkit/sdk/protocol";
import { ProtocolVersionHeadersSchema } from "../../http/protocol-header.ts";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import { KitSessionService } from "../../service/staff/kit-sessions.ts";

const error = {
	description: "审批或归属校验失败",
	content: {
		"application/json": {
			schema: z.object({ error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }) }),
		},
	},
};

const responses = { 400: error, 401: error, 404: error, 409: error, 502: error };

const getSessionsBySessionIdToolApprovalsRoute = defineRoute({
	method: "get",
	path: "/api/kit/sessions/{sessionId}/tool-approvals",
	tags: ["kit"],
	request: { headers: ProtocolVersionHeadersSchema, params: z.object({ sessionId: z.string() }) },
	responses: {
		200: {
			description: "当前批次的工具审批请求",
			content: { "application/json": { schema: z.object({ data: ToolApprovalsResponseSchema }) } },
		},
		...responses,
	},
});

const postSessionsBySessionIdToolApprovalsRoute = defineRoute({
	method: "post",
	path: "/api/kit/sessions/{sessionId}/tool-approvals",
	tags: ["kit"],
	request: {
		headers: ProtocolVersionHeadersSchema,
		params: z.object({ sessionId: z.string() }),
		body: { content: { "application/json": { schema: ToolApprovalDecisionSchema } } },
	},
	responses: {
		202: {
			description: "决定已提交，执行结果由 Provider 事件确认",
			content: { "application/json": { schema: z.object({ data: SendMessageResponseSchema }) } },
		},
		...responses,
	},
});

@Controller()
export class ToolApprovalsController {
	constructor(@Inject(KitSessionService) private readonly kitSessions: KitSessionService) {}

	/**
	 * 查询本人会话中当前批次的工具审批请求及其处理状态。
	 *
	 * @param request - 路径参数 `sessionId` 指定本人会话，请求头携带 `x-kit-protocol-version`。
	 * @return 200，`data` 包含 `requires_action`、`batch_id`、`pending_call_ids` 和审批请求列表 `requests`。
	 */
	@KitRoute(getSessionsBySessionIdToolApprovalsRoute)
	async getSessionsBySessionIdToolApprovals(
		@KitInput() request: KitRequest<typeof getSessionsBySessionIdToolApprovalsRoute>,
	) {
		const data = await this.kitSessions.approvals(request.identity.subjectId, request.pathParam("sessionId"));
		return request.json({ data }, 200);
	}

	/**
	 * 对本人会话中指定批次的工具调用提交允许或拒绝的决定。
	 *
	 * @param request - 路径参数 `sessionId` 指定本人会话，请求头携带 `x-kit-protocol-version`，请求体包含 `batch_id`、`call_id` 和 `result`（`allow` 或 `deny`），可传 `deny_message`。
	 * @return 202，`data` 包含 `session_id`、受理标记 `accepted` 和关联事件标识 `event_ids`。
	 */
	@KitRoute(postSessionsBySessionIdToolApprovalsRoute)
	async postSessionsBySessionIdToolApprovals(
		@KitInput() request: KitRequest<typeof postSessionsBySessionIdToolApprovalsRoute>,
	) {
		const data = await this.kitSessions.approve(
			request.identity.subjectId,
			request.pathParam("sessionId"),
			request.input,
		);
		return request.json({ data }, 202);
	}
}
