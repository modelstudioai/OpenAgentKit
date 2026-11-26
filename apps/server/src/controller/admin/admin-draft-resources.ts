import { Controller, Inject } from "@nestjs/common";
import {
	DeclarationDeleteSchema,
	DeclarationPreviewInputSchema,
	DeclarationPreviewSchema,
	DeclarationWriteSchema,
	encodeFrame,
	KitError,
	type OperationProgress,
	type OperationView,
	OperationViewSchema,
	ProjectPlanSchema,
	ResourceDraftDeclarationSchema,
	ResourceDraftOverviewSchema,
} from "@openagentkit/sdk/protocol";
import { requireAdmin } from "../../http/identity.ts";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import { streamResponse } from "../../http/sse.ts";
import { ResourceDraftService } from "../../service/admin/resource-draft/resource-drafts.ts";

const errorBody = z.object({
	error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean().optional() }),
});

const errors = {
	400: { description: "invalid_request", content: { "application/json": { schema: errorBody } } },
	409: { description: "conflict", content: { "application/json": { schema: errorBody } } },
	401: { description: "unauthorized", content: { "application/json": { schema: errorBody } } },
	404: { description: "not_found", content: { "application/json": { schema: errorBody } } },
	428: { description: "confirmation_required", content: { "application/json": { schema: errorBody } } },
};

const data = (schema: z.ZodTypeAny) => z.object({ data: schema });

const params = z.object({ name: z.string() });

const execBody = z.object({ plan_id: z.string().min(1), confirm_token: z.string().min(1) });

const basePath = "/api/admin/resource-drafts/{name}/resources";

const getResourceDraftsByNameResourcesRoute = defineRoute({
	method: "get",
	path: `${basePath}`,
	tags: ["admin-resource-draft"],
	request: { params },
	responses: {
		200: {
			description: "三源概览与 drift",
			content: {
				"application/json": { schema: data(ResourceDraftOverviewSchema) },
			},
		},
		...errors,
	},
});

const getResourceDraftsByNameResourcesDeclarationsRoute = defineRoute({
	method: "get",
	path: `${basePath}/declarations`,
	tags: ["admin-resource-draft"],
	request: { params },
	responses: {
		200: {
			description: "声明清单",
			content: {
				"application/json": {
					schema: data(z.array(ResourceDraftDeclarationSchema)),
				},
			},
		},
		...errors,
	},
});

const getResourceDraftsByNameResourcesDeclarationsByTypeByIdRoute = defineRoute({
	method: "get",
	path: `${basePath}/declarations/{type}/{id}`,
	tags: ["admin-resource-draft"],
	request: { params: params.extend({ type: z.string(), id: z.string() }) },
	responses: {
		200: {
			description: "单个声明（vault 脱敏）",
			content: {
				"application/json": { schema: data(ResourceDraftDeclarationSchema) },
			},
		},
		...errors,
	},
});

const postResourceDraftsByNameResourcesValidateRoute = defineRoute({
	method: "post",
	path: `${basePath}/validate`,
	tags: ["admin-resource-draft"],
	request: { params },
	responses: {
		200: {
			description: "离线校验结果：阻塞诊断与非阻塞警告",
			content: {
				"application/json": {
					schema: data(z.object({ diagnostics: z.array(z.string()), warnings: z.array(z.string()).optional() })),
				},
			},
		},
		...errors,
	},
});

const postResourceDraftsByNameResourcesPlanRoute = defineRoute({
	method: "post",
	path: `${basePath}/plan`,
	tags: ["admin-resource-draft"],
	request: {
		params,
		body: {
			content: {
				"application/json": {
					schema: z.object({
						action: z.literal("publish"),
						version_id: z.string().optional(),
					}),
				},
			},
		},
	},
	responses: {
		200: {
			description: "plan + 一次性确认令牌",
			content: { "application/json": { schema: data(ProjectPlanSchema) } },
		},
		...errors,
	},
});

const postResourceDraftsByNameResourcesPublishRoute = defineRoute({
	method: "post",
	path: `${basePath}/publish`,
	tags: ["admin-resource-draft"],
	request: { params, body: { content: { "application/json": { schema: execBody } } } },
	responses: {
		202: {
			description: "已受理为 Operation",
			content: { "application/json": { schema: data(z.object({ operation_id: z.string() })) } },
		},
		...errors,
	},
});

const postResourceDraftsByNameResourcesDeclarationsByTypeByIdPreviewRoute = defineRoute({
	method: "post",
	path: `${basePath}/declarations/{type}/{id}/preview`,
	tags: ["admin-resource-draft"],
	request: {
		params: params.extend({ type: z.string(), id: z.string() }),
		body: { content: { "application/json": { schema: DeclarationPreviewInputSchema } } },
	},
	responses: {
		200: {
			description: "已有声明修改或删除的 SDK 校验与差异预览",
			content: { "application/json": { schema: data(DeclarationPreviewSchema) } },
		},
		...errors,
	},
});

const putResourceDraftsByNameResourcesDeclarationsByTypeByIdRoute = defineRoute({
	method: "put",
	path: `${basePath}/declarations/{type}/{id}`,
	tags: ["admin-resource-draft"],
	request: {
		params: params.extend({ type: z.string(), id: z.string() }),
		body: { content: { "application/json": { schema: DeclarationWriteSchema } } },
	},
	responses: {
		200: {
			description: "声明已更新",
			content: { "application/json": { schema: data(z.object({ new_revision: z.string() })) } },
		},
		...errors,
	},
});

const deleteResourceDraftsByNameResourcesDeclarationsByTypeByIdRoute = defineRoute({
	method: "delete",
	path: `${basePath}/declarations/{type}/{id}`,
	tags: ["admin-resource-draft"],
	request: {
		params: params.extend({ type: z.string(), id: z.string() }),
		body: { content: { "application/json": { schema: DeclarationDeleteSchema } } },
	},
	responses: {
		200: {
			description: "声明已删除（仅当前批次）",
			content: { "application/json": { schema: data(z.object({ new_revision: z.string() })) } },
		},
		...errors,
	},
});

const getOperationsByOperationIdEventsRoute = defineRoute({
	method: "get",
	path: "/api/admin/operations/{operationId}/events",
	tags: ["admin"],
	request: { params: z.object({ operationId: z.string() }) },
	responses: {
		200: {
			description: "Operation 进度 SSE（operation/done 帧）",
			content: { "text/event-stream": { schema: z.string() } },
		},
		...errors,
	},
});

const getOperationsByOperationIdRoute = defineRoute({
	method: "get",
	path: "/api/admin/operations/{operationId}",
	tags: ["admin"],
	request: { params: z.object({ operationId: z.string() }) },
	responses: {
		200: { description: "Operation 详情", content: { "application/json": { schema: data(OperationViewSchema) } } },
		...errors,
	},
});

@Controller()
export class AdminDraftResourcesController {
	constructor(@Inject(ResourceDraftService) private readonly resourceDrafts: ResourceDraftService) {}

	/**
	 * 读取批次修订号、智能体与环境清单，以及正在执行的变更。
	 *
	 * @param request - 路径参数 `name` 为当前管理员的批次标识。
	 * @return 200，返回批次修订号、智能体和环境清单，以及当前变更状态。
	 */
	@KitRoute(getResourceDraftsByNameResourcesRoute)
	async getResourceDraftsByNameResources(
		@KitInput() request: KitRequest<typeof getResourceDraftsByNameResourcesRoute>,
	) {
		return request.json({ data: await request.draftResources.overview(request.params.name) }, 200);
	}

	/**
	 * 列出当前批次的资源声明及其引用关系。
	 *
	 * @param request - 路径参数 `name` 为当前管理员的批次标识。
	 * @return 200，`data` 为批次的资源声明列表，每项包含类型、本地标识、配置与引用关系。
	 */
	@KitRoute(getResourceDraftsByNameResourcesDeclarationsRoute)
	async getResourceDraftsByNameResourcesDeclarations(
		@KitInput() request: KitRequest<typeof getResourceDraftsByNameResourcesDeclarationsRoute>,
	) {
		return request.json({ data: await request.draftResources.declarations(request.params.name) }, 200);
	}

	/**
	 * 按类型和本地标识读取资源声明及其引用关系，返回脱敏后的配置。
	 *
	 * @param request - 路径参数 `name`、`type`、`id` 指定批次及其资源声明。
	 * @return 200，返回指定声明的脱敏配置、基础修订号、只读字段和引用关系。
	 */
	@KitRoute(getResourceDraftsByNameResourcesDeclarationsByTypeByIdRoute)
	async getResourceDraftsByNameResourcesDeclarationsByTypeById(
		@KitInput() request: KitRequest<typeof getResourceDraftsByNameResourcesDeclarationsByTypeByIdRoute>,
	) {
		const p = request.params;
		return request.json({ data: await request.draftResources.declaration(p.name, p.type, p.id) }, 200);
	}

	/**
	 * 离线校验当前批次的资源声明，列出阻塞发布的问题和非阻塞警告。
	 *
	 * @param request - 路径参数 `name` 为当前管理员的批次标识。
	 * @return 200，`data.diagnostics` 列出阻塞问题，`data.warnings` 列出警告。
	 */
	@KitRoute(postResourceDraftsByNameResourcesValidateRoute)
	async postResourceDraftsByNameResourcesValidate(
		@KitInput() request: KitRequest<typeof postResourceDraftsByNameResourcesValidateRoute>,
	) {
		return request.json({ data: await request.draftResources.validate(request.params.name) }, 200);
	}

	/**
	 * 预览当前批次的发布差异，并签发与当前管理员绑定的一次性确认令牌。
	 *
	 * @param request - 路径参数 `name` 指定批次，JSON 请求体的 `action` 为 `publish`，可附 `version_id`。
	 * @return 200，返回发布差异、批次修订号、`plan_id`、一次性 `confirm_token` 和到期时间。
	 */
	@KitRoute(postResourceDraftsByNameResourcesPlanRoute)
	async postResourceDraftsByNameResourcesPlan(
		@KitInput() request: KitRequest<typeof postResourceDraftsByNameResourcesPlanRoute>,
	) {
		const { subject } = requireAdmin(request);
		const _body = request.input;
		return request.json(
			{
				data: await request.draftResources.plan(request.params.name, subject),
			},
			200,
		);
	}

	/**
	 * 核对批次修订号并消费计划的确认令牌，启动异步发布并返回操作标识。
	 *
	 * @param request - 路径参数 `name` 指定批次，JSON 请求体提供已确认计划的 `plan_id` 和 `confirm_token`。
	 * @return 202，发布已受理，`data.operation_id` 可用于查询或订阅进度。
	 */
	@KitRoute(postResourceDraftsByNameResourcesPublishRoute)
	async postResourceDraftsByNameResourcesPublish(
		@KitInput() request: KitRequest<typeof postResourceDraftsByNameResourcesPublishRoute>,
	) {
		const { subject } = requireAdmin(request);
		const body = request.input;
		const result = await request.draftResources.execute(request.params.name, body, subject);
		return request.json({ data: result }, 202);
	}

	/**
	 * 预览修改或删除指定声明的差异，返回引用关系和校验结果。
	 *
	 * @param request - 路径参数 `name`、`type`、`id` 指定声明，JSON 请求体提供 `base_revision` 和 `action`，更新时还需提供 `declaration`。
	 * @return 200，返回变更前后内容、引用关系、诊断结果及可提交标志 `can_commit`。
	 */
	@KitRoute(postResourceDraftsByNameResourcesDeclarationsByTypeByIdPreviewRoute)
	async postResourceDraftsByNameResourcesDeclarationsByTypeByIdPreview(
		@KitInput() request: KitRequest<typeof postResourceDraftsByNameResourcesDeclarationsByTypeByIdPreviewRoute>,
	) {
		const input = request.params;
		return request.json(
			{
				data: await request.draftResources.declarationPreview(input.name, input.type, input.id, request.input),
			},
			200,
		);
	}

	/**
	 * 按指定修订号更新批次内的资源声明，返回新的修订号。
	 *
	 * @param request - 路径参数 `name`、`type`、`id` 指定声明，JSON 请求体提供 `base_revision` 和替换内容 `declaration`。
	 * @return 200，`data.new_revision` 为更新声明后的批次修订号。
	 */
	@KitRoute(putResourceDraftsByNameResourcesDeclarationsByTypeByIdRoute)
	async putResourceDraftsByNameResourcesDeclarationsByTypeById(
		@KitInput() request: KitRequest<typeof putResourceDraftsByNameResourcesDeclarationsByTypeByIdRoute>,
	) {
		const { subject } = requireAdmin(request);
		const input = request.params;
		return request.json(
			{
				data: await request.draftResources.declarationPut(input.name, input.type, input.id, request.input, subject),
			},
			200,
		);
	}

	/**
	 * 按指定修订号从当前批次移除资源声明，返回新的修订号。
	 *
	 * @param request - 路径参数 `name`、`type`、`id` 指定声明，JSON 请求体提供待校验的 `base_revision`。
	 * @return 200，`data.new_revision` 为移除声明后的批次修订号。
	 */
	@KitRoute(deleteResourceDraftsByNameResourcesDeclarationsByTypeByIdRoute)
	async deleteResourceDraftsByNameResourcesDeclarationsByTypeById(
		@KitInput() request: KitRequest<typeof deleteResourceDraftsByNameResourcesDeclarationsByTypeByIdRoute>,
	) {
		const { subject } = requireAdmin(request);
		const input = request.params;
		return request.json(
			{
				data: await request.draftResources.declarationDelete(
					input.name,
					input.type,
					input.id,
					request.input.base_revision,
					subject,
				),
			},
			200,
		);
	}

	/**
	 * 通过 SSE 推送指定操作的进度，并在操作结束时发送结束帧。
	 *
	 * @param request - 路径参数 `operationId` 为异步操作标识。
	 * @return 200，返回 `text/event-stream`，以 `operation` 帧推送进度，到达终态时发送 `done` 帧。
	 */
	@KitRoute(getOperationsByOperationIdEventsRoute)
	async getOperationsByOperationIdEvents(
		@KitInput() request: KitRequest<typeof getOperationsByOperationIdEventsRoute>,
	) {
		requireAdmin(request);
		const operationId = request.pathParam("operationId");
		const { resourceDrafts } = this;
		if (!(await resourceDrafts.getOperation(operationId))) throw new KitError("not_found", "operation 不存在");
		return streamResponse(request.signal, async (stream) => {
			const signal = request.signal;
			let unsubscribe: (() => void) | undefined;
			let onAbort: (() => void) | undefined;
			try {
				await new Promise<void>((resolve, reject) => {
					let terminal = false;
					const publish = async (view: OperationView) => {
						if (terminal || signal.aborted) return;
						const done = ["succeeded", "failed", "cancelled"].includes(view.status);
						terminal = done;
						await stream.write(encodeFrame({ type: "operation", data: view as OperationProgress }));
						if (done) {
							await stream.write(
								encodeFrame({
									type: "done",
									data: {
										session_id: operationId,
										status: view.status,
										last_event_id: null,
										reason: "operation_closed",
									},
								}),
							);
							resolve();
						}
					};
					unsubscribe = resourceDrafts.subscribeOperation(
						operationId,
						(view) => void publish(view).catch(reject),
						reject,
					);
					onAbort = resolve;
					signal.addEventListener("abort", onAbort, { once: true });
					if (signal.aborted) return resolve();
				});
			} finally {
				unsubscribe?.();
				if (onAbort) signal.removeEventListener("abort", onAbort);
			}
		});
	}

	/**
	 * 按操作标识查询当前状态、进度及执行详情。
	 *
	 * @param request - 路径参数 `operationId` 为异步操作标识。
	 * @return 200，返回操作类型、状态、进度和日志，以及可用的结果或错误详情。
	 */
	@KitRoute(getOperationsByOperationIdRoute)
	async getOperationsByOperationId(@KitInput() request: KitRequest<typeof getOperationsByOperationIdRoute>) {
		const view = await this.resourceDrafts.getOperation(request.pathParam("operationId"));
		if (!view) return request.json({ error: { code: "not_found", message: "operation 不存在" } }, 404);
		return request.json({ data: view }, 200);
	}
}
