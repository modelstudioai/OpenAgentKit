import { Controller, Inject } from "@nestjs/common";
import {
	AdminIdentityViewSchema,
	ApplyRequestSchema,
	CreateTemplateDebugSessionRequestSchema,
	DebugSessionDetailSchema,
	KitError,
	PlanResponseSchema,
	SendMessageRequestSchema,
	SendMessageResponseSchema,
	ToolApprovalDecisionSchema,
	ToolApprovalsResponseSchema,
} from "@openagentkit/sdk/protocol";
import type { ServerConfig } from "../../config.ts";
import { ProtocolVersionHeadersSchema } from "../../http/protocol-header.ts";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import { streamSession } from "../../http/session-stream.ts";
import { DebugService } from "../../service/admin/debug.ts";
import { FileService } from "../../service/shared/session/files.ts";
import { expiringAuthStream } from "../../utils/expiring-auth-stream.ts";
import { KIT_CONFIG } from "../../utils/injection-tokens.ts";

const params = z.object({ sessionId: z.string().min(1) });

const _targetParams = z.object({ name: z.string().min(1), agentKey: z.string().min(1) });

const data = (schema: z.ZodTypeAny) => z.object({ data: schema });

const error = {
	description: "身份、用途归属、目标状态或确认校验失败",
	content: {
		"application/json": {
			schema: z.object({
				error: z.object({
					code: z.string(),
					message: z.string(),
					retryable: z.boolean().optional(),
				}),
			}),
		},
	},
};

const errors = { 400: error, 401: error, 403: error, 404: error, 409: error, 413: error, 428: error, 502: error };

const tags = ["admin-debug"];

const getIdentityRoute = defineRoute({
	method: "get",
	path: "/api/admin/identity",
	tags: ["admin"],
	responses: {
		200: {
			description: "当前管理员角色与令牌指纹",
			content: { "application/json": { schema: data(AdminIdentityViewSchema) } },
		},
		...errors,
	},
});

const postSessionsRoute = defineRoute({
	method: "post",
	path: "/api/admin/debug/sessions",
	tags,
	request: { body: { content: { "application/json": { schema: CreateTemplateDebugSessionRequestSchema } } } },
	responses: {
		201: {
			description: "校验远端智能体与运行时资源后创建模版调试会话",
			content: { "application/json": { schema: data(DebugSessionDetailSchema) } },
		},
		...errors,
	},
});

const getSessionsBySessionIdRoute = defineRoute({
	method: "get",
	path: "/api/admin/debug/sessions/{sessionId}",
	tags,
	request: { params },
	responses: {
		200: {
			description: "调试会话及其实际远端目标",
			content: { "application/json": { schema: data(DebugSessionDetailSchema) } },
		},
		...errors,
	},
});

const postSessionsBySessionIdMessagesRoute = defineRoute({
	method: "post",
	path: "/api/admin/debug/sessions/{sessionId}/messages",
	tags,
	request: {
		headers: ProtocolVersionHeadersSchema,
		params,
		body: { content: { "application/json": { schema: SendMessageRequestSchema } } },
	},
	responses: {
		202: {
			description: "消息已受理；管理员调试不扣员工 Credits",
			content: { "application/json": { schema: data(SendMessageResponseSchema) } },
		},
		...errors,
	},
});

const getSessionsBySessionIdStreamRoute = defineRoute({
	method: "get",
	path: "/api/admin/debug/sessions/{sessionId}/stream",
	tags,
	request: { headers: ProtocolVersionHeadersSchema, params, query: z.object({ after: z.string().optional() }) },
	responses: {
		200: {
			description: "实时 SSE。after 续传实时变更，reset 后通过调试事件分页恢复历史",
			content: { "text/event-stream": { schema: z.string() } },
		},
		...errors,
	},
});

const getSessionsBySessionIdEventsRoute = defineRoute({
	method: "get",
	path: "/api/admin/debug/sessions/{sessionId}/events",
	tags,
	request: {
		params,
		query: z.object({
			after_id: z.string().optional(),
			page_token: z.string().optional(),
			limit: z.coerce.number().int().min(1).max(100).optional(),
		}),
	},
	responses: {
		200: {
			description: "Provider 历史事件分页，正文不落库",
			content: {
				"application/json": {
					schema: z.object({ data: z.array(z.unknown()), next_page_token: z.string().nullable() }),
				},
			},
		},
		...errors,
	},
});

const postSessionsBySessionIdInterruptRoute = defineRoute({
	method: "post",
	path: "/api/admin/debug/sessions/{sessionId}/interrupt",
	tags,
	request: { params },
	responses: {
		200: {
			description: "停止当前执行",
			content: { "application/json": { schema: data(z.object({ interrupted: z.boolean() })) } },
		},
		...errors,
	},
});

const getSessionsBySessionIdToolApprovalsRoute = defineRoute({
	method: "get",
	path: "/api/admin/debug/sessions/{sessionId}/tool-approvals",
	tags,
	request: { headers: ProtocolVersionHeadersSchema, params },
	responses: {
		200: {
			description: "当前 Provider 工具审批集合",
			content: { "application/json": { schema: data(ToolApprovalsResponseSchema) } },
		},
		...errors,
	},
});

const postSessionsBySessionIdToolApprovalsRoute = defineRoute({
	method: "post",
	path: "/api/admin/debug/sessions/{sessionId}/tool-approvals",
	tags,
	request: {
		headers: ProtocolVersionHeadersSchema,
		params,
		body: { content: { "application/json": { schema: ToolApprovalDecisionSchema } } },
	},
	responses: {
		202: {
			description: "审批已提交，等待 Provider 事件确认",
			content: { "application/json": { schema: data(SendMessageResponseSchema) } },
		},
		...errors,
	},
});

const postSessionsBySessionIdPlanRoute = defineRoute({
	method: "post",
	path: "/api/admin/debug/sessions/{sessionId}/plan",
	tags,
	request: {
		params,
		body: { content: { "application/json": { schema: z.object({ action: z.literal("delete") }) } } },
	},
	responses: {
		200: {
			description: "删除调试会话的影响面与一次性确认令牌",
			content: { "application/json": { schema: data(PlanResponseSchema) } },
		},
		...errors,
	},
});

const deleteSessionsBySessionIdRoute = defineRoute({
	method: "delete",
	path: "/api/admin/debug/sessions/{sessionId}",
	tags,
	request: { params, body: { content: { "application/json": { schema: ApplyRequestSchema } } } },
	responses: {
		200: {
			description: "已删除调试会话",
			content: { "application/json": { schema: data(z.object({ deleted: z.boolean() })) } },
		},
		...errors,
	},
});

const postFilesRoute = defineRoute({
	method: "post",
	path: "/api/admin/debug/files",
	tags,
	request: {
		body: {
			content: {
				"multipart/form-data": {
					schema: z.object({ file: z.any().openapi({ type: "string", format: "binary" }) }),
				},
			},
		},
	},
	responses: {
		201: {
			description: "管理员调试附件，仅允许挂载到新调试会话",
			content: {
				"application/json": {
					schema: data(z.object({ file_id: z.string(), filename: z.string(), size: z.number() })),
				},
			},
		},
		...errors,
	},
});

const getFilesByFileIdDownloadRoute = defineRoute({
	method: "get",
	path: "/api/admin/debug/files/{fileId}/download",
	tags,
	request: {
		params: z.object({ fileId: z.string().min(1) }),
		query: z.object({ session_id: z.string().min(1).optional() }),
	},
	responses: {
		200: {
			description: "本人调试上传或调试会话已交付文件与产物；校验用途、归属与 Provider 证据",
			content: { "application/octet-stream": { schema: z.string() } },
		},
		...errors,
	},
});

@Controller()
export class AdminDebugController {
	constructor(@Inject(DebugService) private readonly debug: DebugService) {}

	/**
	 * 查询当前管理端调用方的角色与由令牌指纹标识的主体。
	 *
	 * @param request - 携带已认证管理端身份的请求。
	 * @return 200，`data` 包含当前角色 `role` 和主体标识 `subject`。
	 */
	@KitRoute(getIdentityRoute)
	getIdentity(@KitInput() request: KitRequest<typeof getIdentityRoute>) {
		return request.json({ data: request.admin }, 200);
	}

	/**
	 * 校验模版引用的智能体和运行资源，为当前管理员创建调试会话。
	 *
	 * @param request - 请求体指定 `remote_agent_id`，可附智能体版本、环境、标题及要挂载的资源。
	 * @return 201，`data` 包含新建的调试会话、远端目标及资源绑定。
	 */
	@KitRoute(postSessionsRoute)
	async postSessions(@KitInput() request: KitRequest<typeof postSessionsRoute>) {
		return request.json({ data: await this.debug.createTemplate(request.admin.subject, request.input) }, 201);
	}

	/**
	 * 查询本人调试会话的远端目标、运行状态及已挂载附件。
	 *
	 * @param request - 路径中的 `sessionId` 标识当前管理端主体的调试会话。
	 * @return 200，`data` 包含会话状态、远端智能体和挂载资源。
	 */
	@KitRoute(getSessionsBySessionIdRoute)
	async getSessionsBySessionId(@KitInput() request: KitRequest<typeof getSessionsBySessionIdRoute>) {
		return request.json({ data: await this.debug.detail(request.admin.subject, request.params.sessionId) }, 200);
	}

	/**
	 * 向本人调试会话发送消息，返回已受理消息的事件 ID。
	 *
	 * @param request - 路径指定 `sessionId`，请求头携带 `x-kit-protocol-version`，请求体提供 `text`，可附 `skills` 和 `client_message_id`。
	 * @return 202，`data` 包含 `session_id`、`accepted` 和受理消息的 `event_ids`。
	 */
	@KitRoute(postSessionsBySessionIdMessagesRoute)
	async postSessionsBySessionIdMessages(@KitInput() request: KitRequest<typeof postSessionsBySessionIdMessagesRoute>) {
		return request.json(
			{
				data: await this.debug.send(request.admin.subject, request.params.sessionId, request.input),
			},
			202,
		);
	}

	/**
	 * 订阅本人调试会话的实时事件，支持通过游标续传。
	 *
	 * @param request - 路径指定 `sessionId`，请求头携带 `x-kit-protocol-version`，查询参数 `after` 可指定续传游标。
	 * @return 200，返回 `text/event-stream` 格式的调试会话事件流。
	 */
	@KitRoute(getSessionsBySessionIdStreamRoute)
	async getSessionsBySessionIdStream(@KitInput() request: KitRequest<typeof getSessionsBySessionIdStreamRoute>) {
		const { sessionId } = request.params;
		await this.debug.authorizeStream(request.admin.subject, sessionId);
		return streamSession(request.signal, expiringAuthStream(), (signal) =>
			this.debug.openStream(sessionId, { after: request.query.after, signal }),
		);
	}

	/**
	 * 分页读取本人调试会话在 Provider 侧的历史事件。
	 *
	 * @param request - 路径指定 `sessionId`，可用查询参数 `after_id`、`page_token` 和 `limit` 选择事件范围或分页。
	 * @return 200，`data` 为历史事件列表，`next_page_token` 指向下一页。
	 */
	@KitRoute(getSessionsBySessionIdEventsRoute)
	async getSessionsBySessionIdEvents(@KitInput() request: KitRequest<typeof getSessionsBySessionIdEventsRoute>) {
		const { sessionId } = request.params;
		const query = request.query;
		const page = await this.debug.events(request.admin.subject, sessionId, {
			signal: request.signal,
			afterId: query.after_id,
			pageToken: query.page_token,
			limit: query.limit,
		});
		return request.json({ data: page.events, next_page_token: page.next_page_token }, 200);
	}

	/**
	 * 中断本人调试会话当前正在执行的回合。
	 *
	 * @param request - 路径中的 `sessionId` 标识要中断的调试会话。
	 * @return 200，`data.interrupted` 表示执行是否已中断。
	 */
	@KitRoute(postSessionsBySessionIdInterruptRoute)
	async postSessionsBySessionIdInterrupt(
		@KitInput() request: KitRequest<typeof postSessionsBySessionIdInterruptRoute>,
	) {
		return request.json({ data: await this.debug.interrupt(request.admin.subject, request.params.sessionId) }, 200);
	}

	/**
	 * 读取本人调试会话当前批次的工具审批请求及其处理状态。
	 *
	 * @param request - 路径指定 `sessionId`，请求头携带 `x-kit-protocol-version`。
	 * @return 200，`data` 包含是否需要审批、当前批次和工具调用审批列表。
	 */
	@KitRoute(getSessionsBySessionIdToolApprovalsRoute)
	async getSessionsBySessionIdToolApprovals(
		@KitInput() request: KitRequest<typeof getSessionsBySessionIdToolApprovalsRoute>,
	) {
		return request.json({ data: await this.debug.approvals(request.admin.subject, request.params.sessionId) }, 200);
	}

	/**
	 * 向 Provider 提交本人调试会话中指定工具调用的审批决定。
	 *
	 * @param request - 路径指定 `sessionId`，请求头携带 `x-kit-protocol-version`，请求体提供 `batch_id`、`call_id` 和 `result`，可附 `deny_message`。
	 * @return 202，`data` 包含 `session_id`、`accepted` 和此次审批的 `event_ids`。
	 */
	@KitRoute(postSessionsBySessionIdToolApprovalsRoute)
	async postSessionsBySessionIdToolApprovals(
		@KitInput() request: KitRequest<typeof postSessionsBySessionIdToolApprovalsRoute>,
	) {
		return request.json(
			{
				data: await this.debug.approve(request.admin.subject, request.params.sessionId, request.input),
			},
			202,
		);
	}

	/**
	 * 预览删除本人调试会话的影响，并签发一次性确认令牌。
	 *
	 * @param request - 路径指定 `sessionId`，请求体 `action` 取 `delete`。
	 * @return 200，`data` 包含删除影响、`plan_id`、`confirm_token` 和令牌有效期。
	 */
	@KitRoute(postSessionsBySessionIdPlanRoute)
	async postSessionsBySessionIdPlan(@KitInput() request: KitRequest<typeof postSessionsBySessionIdPlanRoute>) {
		return request.json({ data: await this.debug.planDelete(request.admin.subject, request.params.sessionId) }, 200);
	}

	/**
	 * 消费一次性确认令牌，删除本人调试会话及其本地索引。
	 *
	 * @param request - 路径指定 `sessionId`，请求体提供删除计划的 `plan_id` 和 `confirm_token`。
	 * @return 200，`data.deleted` 表示调试会话已删除。
	 */
	@KitRoute(deleteSessionsBySessionIdRoute)
	async deleteSessionsBySessionId(@KitInput() request: KitRequest<typeof deleteSessionsBySessionIdRoute>) {
		return request.json(
			{
				data: await this.debug.remove(request.admin.subject, request.params.sessionId, request.input),
			},
			200,
		);
	}
}

@Controller()
export class AdminDebugFilesController {
	constructor(
		@Inject(KIT_CONFIG) private readonly config: ServerConfig,
		@Inject(FileService) private readonly files: FileService,
	) {}

	/**
	 * 上传管理员调试附件，供本人创建调试会话时挂载。
	 *
	 * @param request - `multipart` 表单的 `file` 字段提供要上传的调试附件。
	 * @return 201，`data` 包含 `file_id`、`filename` 和字节数 `size`。
	 */
	@KitRoute(postFilesRoute)
	async postFiles(@KitInput() request: KitRequest<typeof postFilesRoute>) {
		const { files, config } = this;
		const form = await request.formData();
		const file = form.get("file");
		if (!(file instanceof File)) throw new KitError("invalid_request", "缺少 multipart 文件字段 file");
		if (file.size > config.uploadMaxBytes)
			throw new KitError("invalid_request", `文件超过上限 ${config.uploadMaxBytes} 字节`);
		const subject = request.admin.subject;
		const info = await files.uploadWithAudit(
			subject,
			{ filename: file.name, bytes: new Uint8Array(await file.arrayBuffer()), mimeType: file.type || undefined },
			"admin_debug",
		);
		return request.json({ data: info }, 201);
	}

	/**
	 * 下载本人上传的调试附件或本人调试会话交付的文件。
	 *
	 * @param request - 路径指定 `fileId`，下载会话交付的文件时可用查询参数 `session_id` 标识来源会话。
	 * @return 200，响应体为文件内容，`Content-Disposition` 提供下载文件名。
	 */
	@KitRoute(getFilesByFileIdDownloadRoute)
	async getFilesByFileIdDownload(
		@KitInput() request: KitRequest<typeof getFilesByFileIdDownloadRoute>,
	): Promise<Response> {
		const file = await this.files.download(
			request.admin.subject,
			request.params.fileId,
			request.query.session_id,
			"admin_debug",
		);
		// 同 kit 下载路由：非 ASCII 文件名按 RFC 5987 编码，避免响应头构造失败。
		const asciiName = file.filename.replace(/[^\x20-\x7e]|["\\]/g, "_") || "download";
		return new Response(file.body, {
			headers: {
				"Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
				"Content-Type": file.contentType,
				"Cache-Control": "private, no-store",
			},
		});
	}
}
