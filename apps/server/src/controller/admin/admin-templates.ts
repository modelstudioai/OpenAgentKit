import { Controller, Inject } from "@nestjs/common";
import {
	ApplyRequestSchema,
	CatalogAgentViewSchema,
	KitError,
	PlanResponseSchema,
	TemplateInputSchema,
	TemplateListingInputSchema,
	TemplateListingRequestSchema,
	TemplatesPageSchema,
	TemplatesQuerySchema,
	TemplateUpdateInputSchema,
	TemplateViewSchema,
} from "@openagentkit/sdk/protocol";
import { requireAdmin } from "../../http/identity.ts";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import { TemplateService } from "../../service/admin/catalog/templates.ts";

const errorBody = z.object({ error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }) });

const errors = {
	400: { description: "模版配置、资源或分页游标无效", content: { "application/json": { schema: errorBody } } },
	401: { description: "管理端未认证", content: { "application/json": { schema: errorBody } } },
	403: { description: "令牌无效或 auditor 写入被拒绝", content: { "application/json": { schema: errorBody } } },
	404: { description: "模版不存在", content: { "application/json": { schema: errorBody } } },
	409: {
		description: "模版版本或名称冲突、目录名称冲突或所选文件尚不可用",
		content: { "application/json": { schema: errorBody } },
	},
	428: { description: "上架或删除需要有效且未使用的确认令牌", content: { "application/json": { schema: errorBody } } },
};

const response = {
	description: "模版最新配置、版本与资源名称快照",
	content: { "application/json": { schema: z.object({ data: TemplateViewSchema }) } },
};

function rejectInvalid(result: { success: boolean; error?: { issues: { message: string }[] } }): undefined {
	if (!result.success) throw new KitError("invalid_request", result.error?.issues[0]?.message ?? "模版参数无效");
	return undefined;
}

const postTemplatesByTemplateIdDeletePlanRoute = defineRoute({
	method: "post",
	path: "/api/admin/templates/{templateId}/delete/plan",
	tags: ["admin"],
	request: { params: z.object({ templateId: z.string().min(1) }) },
	responses: {
		200: {
			description: "模版及关联条目的只读删除计划",
			content: { "application/json": { schema: z.object({ data: PlanResponseSchema }) } },
		},
		...errors,
	},
});

const deleteTemplatesByTemplateIdRoute = defineRoute({
	method: "delete",
	path: "/api/admin/templates/{templateId}",
	tags: ["admin"],
	request: {
		params: z.object({ templateId: z.string().min(1) }),
		body: { content: { "application/json": { schema: ApplyRequestSchema.partial().default({}) } } },
	},
	responses: {
		200: {
			description: "已删除模版全部版本及关联条目，既有会话和远端资源保留",
			content: { "application/json": { schema: z.object({ data: z.object({ deleted: z.literal(true) }) }) } },
		},
		...errors,
	},
});

const putTemplatesByTemplateIdRoute = defineRoute({
	method: "put",
	path: "/api/admin/templates/{templateId}",
	tags: ["admin"],
	request: {
		params: z.object({ templateId: z.string().min(1) }),
		body: { required: true, content: { "application/json": { schema: TemplateUpdateInputSchema } } },
	},
	responses: { 200: response, ...errors },
});

const postTemplatesByTemplateIdListingPlanRoute = defineRoute({
	method: "post",
	path: "/api/admin/templates/{templateId}/listing/plan",
	tags: ["admin"],
	request: {
		params: z.object({ templateId: z.string().min(1) }),
		body: { required: true, content: { "application/json": { schema: TemplateListingInputSchema } } },
	},
	responses: {
		200: {
			description: "只读上架计划",
			content: { "application/json": { schema: z.object({ data: PlanResponseSchema }) } },
		},
		...errors,
	},
});

const postTemplatesByTemplateIdListingRoute = defineRoute({
	method: "post",
	path: "/api/admin/templates/{templateId}/listing",
	tags: ["admin"],
	request: {
		params: z.object({ templateId: z.string().min(1) }),
		body: { required: true, content: { "application/json": { schema: TemplateListingRequestSchema } } },
	},
	responses: {
		200: {
			description: "已上架的模版条目",
			content: { "application/json": { schema: z.object({ data: CatalogAgentViewSchema }) } },
		},
		...errors,
	},
});

const getTemplatesRoute = defineRoute({
	method: "get",
	path: "/api/admin/templates",
	tags: ["admin"],
	request: { query: TemplatesQuerySchema },
	responses: {
		200: { description: "模版分页列表", content: { "application/json": { schema: TemplatesPageSchema } } },
		...errors,
	},
});

const postTemplatesRoute = defineRoute({
	method: "post",
	path: "/api/admin/templates",
	tags: ["admin"],
	request: { body: { required: true, content: { "application/json": { schema: TemplateInputSchema } } } },
	responses: { 201: response, ...errors },
});

const getTemplatesByTemplateIdRoute = defineRoute({
	method: "get",
	path: "/api/admin/templates/{templateId}",
	tags: ["admin"],
	request: { params: z.object({ templateId: z.string().min(1) }) },
	responses: { 200: response, ...errors },
});

@Controller()
export class AdminTemplatesController {
	constructor(@Inject(TemplateService) private readonly templates: TemplateService) {}

	/**
	 * 预览删除模版对关联目录条目的影响，并签发一次性确认令牌。
	 *
	 * @param request - 路径参数 `templateId` 指定待删除的模版，计划绑定当前管理员。
	 * @return 200，`data` 包含删除差异、计划 ID、一次性确认令牌及有效期。
	 */
	@KitRoute(postTemplatesByTemplateIdDeletePlanRoute, rejectInvalid)
	async postTemplatesByTemplateIdDeletePlan(
		@KitInput() request: KitRequest<typeof postTemplatesByTemplateIdDeletePlanRoute>,
	) {
		return request.json(
			{
				data: await this.templates.planDelete(request.params.templateId, requireAdmin(request).subject),
			},
			200,
		);
	}

	/**
	 * 确认删除计划后，删除模版的全部版本和关联目录条目。
	 *
	 * @param request - 路径参数 `templateId` 指定模版，请求体提交删除计划的 `plan_id` 和 `confirm_token`。
	 * @return 200，`data.deleted` 为 `true`，表示模版及其关联目录条目已删除。
	 */
	@KitRoute(deleteTemplatesByTemplateIdRoute, rejectInvalid)
	async deleteTemplatesByTemplateId(@KitInput() request: KitRequest<typeof deleteTemplatesByTemplateIdRoute>) {
		return request.json(
			{
				data: await this.templates.remove(request.params.templateId, request.input, requireAdmin(request).subject),
			},
			200,
		);
	}

	/**
	 * 校验基准版本后保存模版配置，并同步已有的关联目录条目。
	 *
	 * @param request - 路径参数 `templateId` 指定模版，请求体提交 `base_version`、名称、分类、智能体及资源配置。
	 * @return 200，`data` 为保存后的模版配置和版本号。
	 */
	@KitRoute(putTemplatesByTemplateIdRoute, rejectInvalid)
	async putTemplatesByTemplateId(@KitInput() request: KitRequest<typeof putTemplatesByTemplateIdRoute>) {
		return request.json(
			{
				data: await this.templates.update(request.params.templateId, request.input, requireAdmin(request).subject),
			},
			200,
		);
	}

	/**
	 * 预览上架模版将创建或更新的目录条目，并签发一次性确认令牌。
	 *
	 * @param request - 路径参数 `templateId` 指定模版，请求体以 `display_name` 指定上架名称。
	 * @return 200，`data` 包含目录变更差异、计划 ID、一次性确认令牌及有效期。
	 */
	@KitRoute(postTemplatesByTemplateIdListingPlanRoute, rejectInvalid)
	async postTemplatesByTemplateIdListingPlan(
		@KitInput() request: KitRequest<typeof postTemplatesByTemplateIdListingPlanRoute>,
	) {
		return request.json(
			{
				data: await this.templates.planListing(request.params.templateId, request.input, requireAdmin(request).subject),
			},
			200,
		);
	}

	/**
	 * 确认上架计划后，将模版发布到员工目录。
	 *
	 * @param request - 路径参数 `templateId` 指定模版，请求体提交 `display_name`、`plan_id` 和 `confirm_token`。
	 * @return 200，`data` 为上架后的智能体目录条目。
	 */
	@KitRoute(postTemplatesByTemplateIdListingRoute, rejectInvalid)
	async postTemplatesByTemplateIdListing(
		@KitInput() request: KitRequest<typeof postTemplatesByTemplateIdListingRoute>,
	) {
		return request.json(
			{
				data: await this.templates.listing(request.params.templateId, request.input, requireAdmin(request).subject),
			},
			200,
		);
	}

	/**
	 * 分页列出已保存的模版及其上架状态。
	 *
	 * @param request - 可按 `search`、`status`、`category` 筛选，并用 `limit` 和 `page_token` 分页。
	 * @return 200，`data` 为本页模版，`next_page_token` 为可用的下一页游标。
	 */
	@KitRoute(getTemplatesRoute, rejectInvalid)
	async getTemplates(@KitInput() request: KitRequest<typeof getTemplatesRoute>) {
		return request.json(await this.templates.list(request.query), 200);
	}

	/**
	 * 校验所选智能体与资源，创建模版并保存首个配置版本。
	 *
	 * @param request - 请求体提供 `name`、`category`、`remote_agent_id` 以及所选运行资源和展示配置。
	 * @return 201，`data` 包含新建模版的 ID、版本和已保存配置。
	 */
	@KitRoute(postTemplatesRoute, rejectInvalid)
	async postTemplates(@KitInput() request: KitRequest<typeof postTemplatesRoute>) {
		return request.json({ data: await this.templates.create(request.input, requireAdmin(request).subject) }, 201);
	}

	/**
	 * 读取指定模版的最新配置、版本号和关联资源名称。
	 *
	 * @param request - 路径参数 `templateId` 指定模版。
	 * @return 200，`data` 包含模版配置、版本号及可用的上架信息。
	 */
	@KitRoute(getTemplatesByTemplateIdRoute, rejectInvalid)
	async getTemplatesByTemplateId(@KitInput() request: KitRequest<typeof getTemplatesByTemplateIdRoute>) {
		return request.json({ data: await this.templates.get(request.params.templateId) }, 200);
	}
}
