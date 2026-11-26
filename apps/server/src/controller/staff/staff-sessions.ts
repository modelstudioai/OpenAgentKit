import { Controller, Inject } from "@nestjs/common";
import {
	CreateSessionRequestSchema,
	SendMessageRequestSchema,
	SendMessageResponseSchema,
	SessionDetailSchema,
	type SessionEvent,
} from "@openagentkit/sdk/protocol";
import { createAuthStreamGuard } from "../../http/auth-stream.ts";
import { ProtocolVersionHeadersSchema } from "../../http/protocol-header.ts";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import { streamSession } from "../../http/session-stream.ts";
import { MemberAuthService } from "../../service/shared/member-auth.ts";
import { OidcAuthService } from "../../service/shared/oidc-auth.ts";
import { KitSessionService } from "../../service/staff/kit-sessions.ts";
import { data, kitErrors as errors } from "./staff-schemas.ts";

const postSessionsRoute = defineRoute({
	method: "post",
	path: "/api/kit/sessions",
	tags: ["kit"],
	request: {
		body: { content: { "application/json": { schema: CreateSessionRequestSchema } } },
	},
	responses: {
		201: {
			description: "会话已创建（files 为已挂载进 sandbox 的附件）",
			content: { "application/json": { schema: data(SessionDetailSchema) } },
		},
		...errors,
	},
});

const getSessionsBySessionIdRoute = defineRoute({
	method: "get",
	path: "/api/kit/sessions/{sessionId}",
	tags: ["kit"],
	request: { params: z.object({ sessionId: z.string() }) },
	responses: {
		200: { description: "会话详情", content: { "application/json": { schema: data(SessionDetailSchema) } } },
		...errors,
	},
});

const getSessionsBySessionIdArtifactsRoute = defineRoute({
	method: "get",
	path: "/api/kit/sessions/{sessionId}/artifacts",
	tags: ["kit"],
	request: { params: z.object({ sessionId: z.string() }) },
	responses: {
		200: {
			description: "会话产物",
			content: {
				"application/json": {
					schema: data(
						z.array(
							z.object({
								file_id: z.string(),
								filename: z.string(),
								content_type: z.string().optional(),
								size: z.number().nonnegative().optional(),
							}),
						),
					),
				},
			},
		},
		...errors,
	},
});

const patchSessionsBySessionIdRoute = defineRoute({
	method: "patch",
	path: "/api/kit/sessions/{sessionId}",
	tags: ["kit"],
	request: {
		params: z.object({ sessionId: z.string() }),
		body: { content: { "application/json": { schema: z.object({ title: z.string().min(1).max(120) }) } } },
	},
	responses: {
		200: { description: "已改名", content: { "application/json": { schema: data(SessionDetailSchema) } } },
		...errors,
	},
});

const postSessionsBySessionIdMessagesRoute = defineRoute({
	method: "post",
	path: "/api/kit/sessions/{sessionId}/messages",
	tags: ["kit"],
	request: {
		headers: ProtocolVersionHeadersSchema,
		params: z.object({ sessionId: z.string() }),
		body: { content: { "application/json": { schema: SendMessageRequestSchema } } },
	},
	responses: {
		202: { description: "已受理", content: { "application/json": { schema: data(SendMessageResponseSchema) } } },
		...errors,
	},
});

const postSessionsBySessionIdInterruptRoute = defineRoute({
	method: "post",
	path: "/api/kit/sessions/{sessionId}/interrupt",
	tags: ["kit"],
	request: { params: z.object({ sessionId: z.string() }) },
	responses: {
		200: {
			description: "已中断",
			content: { "application/json": { schema: data(z.object({ interrupted: z.boolean() })) } },
		},
		...errors,
	},
});

const postSessionsBySessionIdPlanRoute = defineRoute({
	method: "post",
	path: "/api/kit/sessions/{sessionId}/plan",
	tags: ["kit"],
	request: {
		params: z.object({ sessionId: z.string() }),
		body: { content: { "application/json": { schema: z.object({ action: z.enum(["archive", "delete"]) }) } } },
	},
	responses: {
		200: {
			description: "会话级破坏性动作的 plan + 一次性确认令牌",
			content: { "application/json": { schema: data(z.unknown()) } },
		},
		...errors,
	},
});

const postSessionsBySessionIdArchiveRoute = defineRoute({
	method: "post",
	path: "/api/kit/sessions/{sessionId}/archive",
	tags: ["kit"],
	request: {
		params: z.object({ sessionId: z.string() }),
		body: {
			content: {
				"application/json": { schema: z.object({ plan_id: z.string().min(1), confirm_token: z.string().min(1) }) },
			},
		},
	},
	responses: {
		200: {
			description: "已归档",
			content: { "application/json": { schema: data(z.object({ archived: z.boolean() })) } },
		},
		...errors,
	},
});

const deleteSessionsBySessionIdRoute = defineRoute({
	method: "delete",
	path: "/api/kit/sessions/{sessionId}",
	tags: ["kit"],
	request: {
		params: z.object({ sessionId: z.string() }),
		body: {
			content: {
				"application/json": { schema: z.object({ plan_id: z.string().min(1), confirm_token: z.string().min(1) }) },
			},
		},
	},
	responses: {
		200: {
			description: "已删除",
			content: { "application/json": { schema: data(z.object({ deleted: z.boolean() })) } },
		},
		...errors,
	},
});

const getSessionsBySessionIdEventsRoute = defineRoute({
	method: "get",
	path: "/api/kit/sessions/{sessionId}/events",
	tags: ["kit"],
	request: {
		params: z.object({ sessionId: z.string() }),
		query: z.object({
			after_id: z.string().optional(),
			page_token: z.string().optional(),
			limit: z.coerce.number().min(1).max(100).optional(),
		}),
	},
	responses: {
		200: {
			description: "历史事件分页",
			content: {
				"application/json": {
					schema: z.object({ data: z.array(z.unknown()), next_page_token: z.string().nullable() }),
				},
			},
		},
		...errors,
	},
});

const getSessionsBySessionIdStreamRoute = defineRoute({
	method: "get",
	path: "/api/kit/sessions/{sessionId}/stream",
	tags: ["kit"],
	request: {
		headers: ProtocolVersionHeadersSchema,
		params: z.object({ sessionId: z.string() }),
		query: z.object({ after: z.string().optional() }),
	},
	responses: {
		200: {
			description: "实时 SSE。after 续传实时变更，reset 后通过事件分页恢复历史",
			content: { "text/event-stream": { schema: z.string() } },
		},
		...errors,
	},
});

@Controller()
export class StaffSessionsController {
	constructor(
		@Inject(KitSessionService) private readonly kitSessions: KitSessionService,
		@Inject(MemberAuthService) private readonly memberAuth: MemberAuthService,
		@Inject(OidcAuthService) private readonly oidcAuth: OidcAuthService,
	) {}

	/**
	 * 为当前身份创建已上架智能体的会话，并挂载配置的文件及本人选用的附件。
	 *
	 * @param request - 请求体以 `agent_slug` 指定已上架智能体，可传入会话标题 `title` 和待挂载附件 `files`。
	 * @return 201，`data` 包含 `session_id`、`agent_slug`、`status` 和 `created_at`，如有挂载附件还返回 `files`。
	 */
	@KitRoute(postSessionsRoute)
	async postSessions(@KitInput() request: KitRequest<typeof postSessionsRoute>) {
		const data = await this.kitSessions.create(request.identity.subjectId, request.input);
		return request.json({ data }, 201);
	}

	/**
	 * 读取本人会话的详情，包含可用的运行状态、用量和附件信息。
	 *
	 * @param request - 路径参数 `sessionId` 指定本人的体验会话。
	 * @return 200，`data` 包含会话摘要，以及可用的远端状态、用量、运行统计和附件。
	 */
	@KitRoute(getSessionsBySessionIdRoute)
	async getSessionsBySessionId(@KitInput() request: KitRequest<typeof getSessionsBySessionIdRoute>) {
		const data = await this.kitSessions.detail(request.identity.subjectId, request.pathParam("sessionId"));
		return request.json({ data }, 200);
	}

	/**
	 * 列出本人会话中的文件产物。
	 *
	 * @param request - 路径参数 `sessionId` 指定产物所属的本人会话。
	 * @return 200，`data` 为产物数组，含 `file_id`、`filename`，以及可用的 `content_type` 和 `size`。
	 */
	@KitRoute(getSessionsBySessionIdArtifactsRoute)
	async getSessionsBySessionIdArtifacts(@KitInput() request: KitRequest<typeof getSessionsBySessionIdArtifactsRoute>) {
		const data = await this.kitSessions.artifacts(request.identity.subjectId, request.pathParam("sessionId"));
		return request.json({ data }, 200);
	}

	/**
	 * 更新本人会话的标题。
	 *
	 * @param request - 路径参数 `sessionId` 指定本人会话，请求体中的 `title` 为 1 至 120 个字符的新标题。
	 * @return 200，`data` 为更新标题后的会话摘要。
	 */
	@KitRoute(patchSessionsBySessionIdRoute)
	async patchSessionsBySessionId(@KitInput() request: KitRequest<typeof patchSessionsBySessionIdRoute>) {
		const data = await this.kitSessions.rename(
			request.identity.subjectId,
			request.pathParam("sessionId"),
			request.input.title,
		);
		return request.json({ data }, 200);
	}

	/**
	 * 向本人会话提交消息和可选附件，返回受理结果及关联事件标识。
	 *
	 * @param request - 路径参数 `sessionId` 指定本人会话，请求头携带 `x-kit-protocol-version`，请求体包含 `text` 及可选的 `skills`、`attachments`、`client_message_id`。
	 * @return 202，`data` 包含 `session_id`、受理标记 `accepted` 和关联事件标识 `event_ids`。
	 */
	@KitRoute(postSessionsBySessionIdMessagesRoute)
	async postSessionsBySessionIdMessages(@KitInput() request: KitRequest<typeof postSessionsBySessionIdMessagesRoute>) {
		const data = await this.kitSessions.send(request.identity.subjectId, request.pathParam("sessionId"), request.input);
		return request.json({ data }, 202);
	}

	/**
	 * 中断本人会话中正在执行的回合。
	 *
	 * @param request - 路径参数 `sessionId` 指定要中断当前回合的本人会话。
	 * @return 200，`data.interrupted` 为 `true`。
	 */
	@KitRoute(postSessionsBySessionIdInterruptRoute)
	async postSessionsBySessionIdInterrupt(
		@KitInput() request: KitRequest<typeof postSessionsBySessionIdInterruptRoute>,
	) {
		const data = await this.kitSessions.interrupt(request.identity.subjectId, request.pathParam("sessionId"));
		return request.json({ data }, 200);
	}

	/**
	 * 为本人会话的归档或删除生成操作计划，并签发一次性确认令牌。
	 *
	 * @param request - 路径参数 `sessionId` 指定本人会话，请求体 `action` 取 `archive` 或 `delete`。
	 * @return 200，`data` 包含计划差异 `diff`、`plan_id`、一次性 `confirm_token` 和到期时间 `expires_at`。
	 */
	@KitRoute(postSessionsBySessionIdPlanRoute)
	async postSessionsBySessionIdPlan(@KitInput() request: KitRequest<typeof postSessionsBySessionIdPlanRoute>) {
		const data = await this.kitSessions.plan(
			request.identity.subjectId,
			request.pathParam("sessionId"),
			request.input.action,
		);
		return request.json({ data }, 200);
	}

	/**
	 * 校验归档计划并消费一次性确认令牌，归档本人会话。
	 *
	 * @param request - 路径参数 `sessionId` 指定本人会话，请求体携带该归档计划的 `plan_id` 和 `confirm_token`。
	 * @return 200，`data.archived` 为 `true`。
	 */
	@KitRoute(postSessionsBySessionIdArchiveRoute)
	async postSessionsBySessionIdArchive(@KitInput() request: KitRequest<typeof postSessionsBySessionIdArchiveRoute>) {
		const data = await this.kitSessions.apply(
			request.identity.subjectId,
			request.pathParam("sessionId"),
			"archive",
			request.input,
		);
		return request.json({ data }, 200);
	}

	/**
	 * 校验删除计划并消费一次性确认令牌，删除本人会话。
	 *
	 * @param request - 路径参数 `sessionId` 指定本人会话，请求体携带该删除计划的 `plan_id` 和 `confirm_token`。
	 * @return 200，`data.deleted` 为 `true`。
	 */
	@KitRoute(deleteSessionsBySessionIdRoute)
	async deleteSessionsBySessionId(@KitInput() request: KitRequest<typeof deleteSessionsBySessionIdRoute>) {
		const data = await this.kitSessions.apply(
			request.identity.subjectId,
			request.pathParam("sessionId"),
			"delete",
			request.input,
		);
		return request.json({ data }, 200);
	}

	/**
	 * 分页读取本人会话的历史事件。
	 *
	 * @param request - 路径参数 `sessionId` 指定本人会话，查询参数可传 `after_id`、`page_token` 和 `limit`。
	 * @return 200，`data` 为历史事件数组，`next_page_token` 为下一页游标。
	 */
	@KitRoute(getSessionsBySessionIdEventsRoute)
	async getSessionsBySessionIdEvents(@KitInput() request: KitRequest<typeof getSessionsBySessionIdEventsRoute>) {
		const query = request.query;
		const page = await this.kitSessions.events(request.identity.subjectId, request.pathParam("sessionId"), {
			signal: request.signal,
			...(query.after_id ? { afterId: query.after_id } : {}),
			...(query.page_token ? { pageToken: query.page_token } : {}),
			...(query.limit ? { limit: query.limit } : {}),
		});
		return request.json({ data: page.events as SessionEvent[], next_page_token: page.next_page_token }, 200);
	}

	/**
	 * 订阅本人会话的实时 SSE 事件，支持从指定游标续传。
	 *
	 * @param request - 路径参数 `sessionId` 指定本人会话，请求头携带 `x-kit-protocol-version`，可用查询参数 `after` 传入上一条 SSE 游标。
	 * @return 200，返回 `text/event-stream` 实时事件流，游标失效时发送 `reset` 帧以提示恢复历史。
	 */
	@KitRoute(getSessionsBySessionIdStreamRoute)
	async getSessionsBySessionIdStream(@KitInput() request: KitRequest<typeof getSessionsBySessionIdStreamRoute>) {
		const row = await this.kitSessions.requireSession(request.identity.subjectId, request.pathParam("sessionId"));
		const grant = await createAuthStreamGuard(request, this.memberAuth, this.oidcAuth);
		return streamSession(request.signal, grant, (signal) =>
			this.kitSessions.openStream(row.session_id, { after: request.query.after, signal }),
		);
	}
}
