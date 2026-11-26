import { Controller, Inject } from "@nestjs/common";
import {
	ModelUsagePageSchema,
	ModelUsageSortBySchema,
	TemplateSessionsPageSchema,
	TemplateUsagePageSchema,
	TemplateUsageTrendSchema,
	ToolUsagePageSchema,
	ToolUsageSortBySchema,
	UsageToolSourceSchema,
} from "@openagentkit/sdk/protocol";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import { ProviderAdminService } from "../../service/admin/provider-admin.ts";
import { TemplateUsageService } from "../../service/admin/template-usage.ts";
import { adminErrors as errors } from "./admin-schemas.ts";

const usageTelemetryCommonQuery = {
	start_time: z.coerce.number().int().nonnegative().optional(),
	end_time: z.coerce.number().int().nonnegative().optional(),
	/** 传 session_id 时按会话口径查询（scope=session，忽略时间区间与 agent_id，按会话自身窗口统计）。 */
	session_id: z.string().min(1).max(128).optional(),
	agent_id: z.string().min(1).max(128).optional(),
	page_no: z.coerce.number().int().min(1).optional(),
	page_size: z.coerce.number().int().min(1).max(100).optional(),
	sort_order: z.enum(["asc", "desc"]).optional(),
};

const getUsageTemplatesRoute = defineRoute({
	method: "get",
	path: "/api/admin/usage/templates",
	tags: ["admin"],
	request: {
		query: z.object({ search: z.string().max(254).optional() }),
	},
	responses: {
		200: {
			description:
				"按模版聚合的体验会话用量（只统计从该模版上架条目发起的会话）；search 按模版名/智能体名/模版 ID 过滤；读取即登记新会话并按成员后台补采",
			content: { "application/json": { schema: TemplateUsagePageSchema } },
		},
		...errors,
	},
});

const getUsageTemplatesDailyTrendRoute = defineRoute({
	method: "get",
	path: "/api/admin/usage/templates/daily-trend",
	tags: ["admin"],
	request: {
		query: z.object({
			template_id: z.string().min(1).max(254).optional(),
			days: z.coerce
				.number()
				.int()
				.refine((value) => value === 7 || value === 14 || value === 28, "days 仅支持 7/14/28")
				.optional()
				.default(7),
		}),
	},
	responses: {
		200: {
			description:
				"模版用量逐日趋势（限额账本条目逐日账：tokens=输入+输出增量、active_seconds=执行时长增量，按采集确认日归属，自模版限额账本启用起记录、不含更早历史）；template_id 缺省为全部模版条目求和；零值补全到今天（UTC 日键）；模版不存在 404",
			content: { "application/json": { schema: z.object({ data: TemplateUsageTrendSchema }) } },
		},
		...errors,
	},
});

const getUsageTemplatesByTemplateIdSessionsRoute = defineRoute({
	method: "get",
	path: "/api/admin/usage/templates/{templateId}/sessions",
	tags: ["admin"],
	request: {
		params: z.object({ templateId: z.string().min(1) }),
		query: z.object({
			cursor: z.string().max(2048).optional(),
			limit: z.coerce.number().int().min(1).max(100).default(20),
		}),
	},
	responses: {
		200: {
			description: "模版会话用量明细（跨成员，含已删除会话与成员公开资料）",
			content: { "application/json": { schema: TemplateSessionsPageSchema } },
		},
		...errors,
	},
});

const getUsageModelUsageRoute = defineRoute({
	method: "get",
	path: "/api/admin/usage/model-usage",
	tags: ["admin"],
	request: {
		query: z.object({
			...usageTelemetryCommonQuery,
			model_name: z.string().min(1).max(128).optional(),
			sort_by: ModelUsageSortBySchema.optional(),
		}),
	},
	responses: {
		200: {
			description: "Provider 侧模型用量明细（workspace scope，workspace_ids 来自服务端配置）；默认统计最近 7 天",
			content: { "application/json": { schema: z.object({ data: ModelUsagePageSchema }) } },
		},
		...errors,
	},
});

const getUsageToolUsageRoute = defineRoute({
	method: "get",
	path: "/api/admin/usage/tool-usage",
	tags: ["admin"],
	request: {
		query: z.object({
			...usageTelemetryCommonQuery,
			source: UsageToolSourceSchema.optional(),
			tool_name: z.string().min(1).max(128).optional(),
			sort_by: ToolUsageSortBySchema.optional(),
		}),
	},
	responses: {
		200: {
			description: "Provider 侧工具调用明细（workspace scope，workspace_ids 来自服务端配置）；默认统计最近 7 天",
			content: { "application/json": { schema: z.object({ data: ToolUsagePageSchema }) } },
		},
		...errors,
	},
});

@Controller()
export class AdminUsageController {
	constructor(@Inject(TemplateUsageService) private readonly templateUsage: TemplateUsageService) {}

	/**
	 * 按模版汇总从上架条目创建的体验会话用量，支持按模版或智能体搜索。
	 *
	 * @param request - 可用查询参数 `search` 按模版名称、模版 ID 或智能体名称筛选。
	 * @return 200，`data` 为按模版汇总的体验会话用量列表。
	 */
	@KitRoute(getUsageTemplatesRoute)
	async getUsageTemplates(@KitInput() request: KitRequest<typeof getUsageTemplatesRoute>) {
		return request.json({ data: await this.templateUsage.summary(request.query) }, 200);
	}

	/**
	 * 查询指定模版或全部模版每天新增的 Token 用量和执行时长。
	 *
	 * @param request - 可用查询参数 `template_id` 限定模版，`days` 取 7、14 或 28，默认 7 天。
	 * @return 200，`data` 包含统计区间和逐日 Token、执行时长增量。
	 */
	@KitRoute(getUsageTemplatesDailyTrendRoute)
	async getUsageTemplatesDailyTrend(@KitInput() request: KitRequest<typeof getUsageTemplatesDailyTrendRoute>) {
		const query = request.query;
		return request.json({ data: await this.templateUsage.dailyTrend(query.template_id ?? null, query.days) }, 200);
	}

	/**
	 * 分页查询使用指定模版的各成员会话及其用量，包括已删除的会话。
	 *
	 * @param request - 路径指定 `templateId`，可用 `cursor` 和 `limit` 分页。
	 * @return 200，`data` 包含各成员的模版会话用量明细，`next_cursor` 指向下一页。
	 */
	@KitRoute(getUsageTemplatesByTemplateIdSessionsRoute)
	async getUsageTemplatesByTemplateIdSessions(
		@KitInput() request: KitRequest<typeof getUsageTemplatesByTemplateIdSessionsRoute>,
	) {
		return request.json(await this.templateUsage.sessions(request.params.templateId, request.query), 200);
	}
}

@Controller()
export class AdminProviderUsageController {
	constructor(@Inject(ProviderAdminService) private readonly providerAdmin: ProviderAdminService) {}

	/**
	 * 按时间范围查询服务端所配置工作空间的模型用量明细。
	 *
	 * @param request - 查询可指定 `session_id`，或用 `start_time`、`end_time`、`agent_id` 限定范围，可按 `model_name` 筛选，按 `sort_by`、`sort_order` 排序，用 `page_no`、`page_size` 分页。
	 * @return 200，`data` 包含模型用量 `items`、记录数、调用总数及分页信息。
	 */
	@KitRoute(getUsageModelUsageRoute)
	async getUsageModelUsage(@KitInput() request: KitRequest<typeof getUsageModelUsageRoute>) {
		return request.json({ data: await this.providerAdmin.modelUsage(request.query) }, 200);
	}

	/**
	 * 按时间范围查询服务端所配置工作空间的工具调用明细。
	 *
	 * @param request - 查询可指定 `session_id`，或用 `start_time`、`end_time`、`agent_id` 限定范围，可按 `source`、`tool_name` 筛选，按 `sort_by`、`sort_order` 排序，用 `page_no`、`page_size` 分页。
	 * @return 200，`data` 包含工具调用 `items`、记录数、调用总数及分页信息。
	 */
	@KitRoute(getUsageToolUsageRoute)
	async getUsageToolUsage(@KitInput() request: KitRequest<typeof getUsageToolUsageRoute>) {
		return request.json({ data: await this.providerAdmin.toolUsage(request.query) }, 200);
	}
}
