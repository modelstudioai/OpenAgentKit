import { randomUUID } from "node:crypto";
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type {
	UsageCoverage,
	UsageGranularity,
	UsageSummary,
	UsageTrend,
	UsageTrendPoint,
} from "@openagentkit/sdk/protocol";
import {
	CatalogAgentInputSchema,
	CreateQuotaPackSchema,
	EvalRunDetailSchema,
	EvalRunSummarySchema,
	EvalWorkspaceViewSchema,
	KitError,
	PutQuotaOverrideSchema,
	PutQuotaPolicySchema,
	QuotaOverrideViewSchema,
	QuotaPackViewSchema,
	QuotaPolicyViewSchema,
	QuotaRequestViewSchema,
	QuotaUsageRowSchema,
	RemoteEnvironmentSchema,
	ReviewQuotaRequestSchema,
	TemplateSessionsPageSchema,
	TemplateUsagePageSchema,
	TemplateUsageTrendSchema,
	UsageGranularitySchema,
	UsageSummarySchema,
	UsageTrendSchema,
} from "@openagentkit/sdk/protocol";
import { ApiError, type UsageSummaryRequest, type UsageTimeRange, type UsageTrendRequest } from "@openagentpack/sdk";
import type { AppEnv } from "../app-env.ts";
import { redactSecrets } from "../config.ts";
import type { ProviderGateway } from "../gateway/types.ts";
import { prepareCatalogResources, updateCatalogResources } from "../services/catalog-resources.ts";
import { requireAdmin, requireAdminWrite } from "../services/identity.ts";
import { emptyUsageSummary, emptyUsageTrend, mergeTrends, mergeUsageSummaries } from "../services/usage-aggregate.ts";
import { registerAgentVersionRoutes } from "./agent-versions.ts";
import { registerAuditRoutes } from "./audit.ts";
import { registerBrandingRoutes } from "./branding.ts";
import { registerEnvironmentRoutes } from "./environments.ts";
import { registerRemoteSkillRoutes } from "./remote-skills.ts";

const errorBody = z.object({
	error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean().optional() }),
});
const errors = {
	400: { description: "invalid_request", content: { "application/json": { schema: errorBody } } },
	401: { description: "管理端未认证", content: { "application/json": { schema: errorBody } } },
	403: {
		description: "forbidden（令牌无效，或 auditor 尝试写操作）",
		content: { "application/json": { schema: errorBody } },
	},
	404: { description: "not_found", content: { "application/json": { schema: errorBody } } },
	409: { description: "conflict", content: { "application/json": { schema: errorBody } } },
	428: {
		description: "confirmation_required（上下架等破坏性动作缺确认令牌）",
		content: { "application/json": { schema: errorBody } },
	},
};

const planSchema = z.object({
	plan_id: z.string(),
	confirm_token: z.string(),
	destructive: z.boolean(),
	expires_at: z.number(),
	diff: z.array(
		z.object({ resource: z.string(), action: z.string(), destructive: z.boolean(), summary: z.string().optional() }),
	),
});

/** 上下架 / 删条目的确认动作名（plan 与 execute 必须一致，令牌才验得过）。 */
const LISTING_ACTION = "catalog.listing";
const DELETE_ACTION = "catalog.delete";

export function registerAdminRoutes(app: OpenAPIHono<AppEnv>) {
	app.use("/api/admin/*", (c, next) => {
		requireAdmin(c, c.get("services").config);
		return next();
	});
	registerAgentVersionRoutes(app);
	registerAuditRoutes(app);
	registerBrandingRoutes(app);
	registerEnvironmentRoutes(app);
	registerRemoteSkillRoutes(app);

	app.openapi(
		{
			method: "get",
			path: "/api/admin/agents",
			tags: ["admin"],
			responses: {
				200: {
					description: "全部条目（含未上架）",
					content: { "application/json": { schema: z.object({ data: z.array(z.unknown()) }) } },
				},
				...errors,
			},
		},
		(c) => {
			const { catalog } = c.get("services");
			return c.json({ data: catalog.all() }, 200);
		},
	);

	app.openapi(
		{
			method: "post",
			path: "/api/admin/agents",
			tags: ["admin"],
			request: {
				body: {
					content: {
						// 上架表单的完整展示字段（开场白/示例问题/主题/可见性/排序）由 protocol 契约约束
						"application/json": { schema: CatalogAgentInputSchema },
					},
				},
			},
			responses: {
				201: {
					description: "已创建（默认未上架）",
					content: { "application/json": { schema: z.object({ data: z.unknown() }) } },
				},
				...errors,
			},
		},
		async (c) => {
			const { catalog, gateway, audit } = c.get("services");
			const { subject } = requireAdmin(c, c.get("services").config);
			const body = c.req.valid("json");
			const entry = catalog.create(await prepareCatalogResources(gateway, body));
			audit.append({
				subject,
				action: "catalog.create",
				target: entry.slug,
				detail: { name: redactSecrets(entry.display_name) },
			});
			return c.json({ data: entry }, 201);
		},
	);

	app.openapi(
		{
			method: "post",
			path: "/api/admin/agents/{slug}/plan",
			tags: ["admin"],
			request: {
				params: z.object({ slug: z.string() }),
				body: {
					content: {
						"application/json": {
							schema: z.discriminatedUnion("action", [
								z.object({ action: z.literal("listing"), status: z.enum(["listed", "unlisted"]) }),
								z.object({ action: z.literal("delete") }),
							]),
						},
					},
				},
			},
			responses: {
				200: {
					description: "上/下架或删除条目的 plan 与一次性确认令牌（AGENTS.md 红线：必须 plan → 确认）",
					content: { "application/json": { schema: z.object({ data: planSchema }) } },
				},
				...errors,
			},
		},
		async (c) => {
			const { catalog, gate } = c.get("services");
			const { subject } = requireAdmin(c, c.get("services").config);
			const slug = c.req.param("slug") ?? "";
			const entry = catalog.getBySlug(slug);
			if (!entry || entry.deleted) throw new KitError("not_found", "agent 不存在");
			const body = c.req.valid("json");
			const isDelete = body.action === "delete";
			// planId 每次唯一：同一条目反复上/下架不能被闸门的「已消费」集合误判为重放
			const planId = `catalog_${slug}_${isDelete ? "delete" : body.status}_${randomUUID().slice(0, 8)}`;
			const issued = await gate.issue({ planId, action: isDelete ? DELETE_ACTION : LISTING_ACTION, subject });
			return c.json(
				{
					data: {
						plan_id: planId,
						confirm_token: issued.confirmToken,
						destructive: true,
						expires_at: issued.expiresAt,
						diff: [
							{
								resource: `catalog:${slug}`,
								action: isDelete ? "delete" : body.status === "listed" ? "list" : "unlist",
								destructive: true,
								summary: isDelete
									? `${entry.display_name}：删除上架条目（标记删除，当前 ${entry.status}；Provider 上的 Agent 不受影响）`
									: `${entry.display_name}：${entry.status} → ${body.status}`,
							},
						],
					},
				},
				200,
			);
		},
	);

	app.openapi(
		{
			method: "patch",
			path: "/api/admin/agents/{slug}",
			tags: ["admin"],
			request: {
				params: z.object({ slug: z.string() }),
				body: {
					content: {
						"application/json": {
							schema: z.object({
								status: z.enum(["listed", "unlisted"]),
								plan_id: z.string().min(1),
								confirm_token: z.string().min(1),
							}),
						},
					},
				},
			},
			responses: {
				200: {
					description: "已更新（确认令牌已消费）",
					content: { "application/json": { schema: z.object({ data: z.unknown() }) } },
				},
				...errors,
			},
		},
		async (c) => {
			const { catalog, gate, audit } = c.get("services");
			const { subject } = requireAdmin(c, c.get("services").config);
			const slug = c.req.param("slug") ?? "";
			const body = c.req.valid("json");
			await gate.consume({ planId: body.plan_id, action: LISTING_ACTION, subject, token: body.confirm_token });
			const entry = catalog.setStatus(slug, body.status);
			if (!entry) throw new KitError("not_found", "agent 不存在");
			audit.append({
				subject,
				action: `catalog.${body.status === "listed" ? "list" : "unlist"}`,
				target: slug,
				detail: { name: redactSecrets(entry.display_name) },
			});
			return c.json({ data: entry }, 200);
		},
	);

	app.openapi(
		{
			method: "put",
			path: "/api/admin/agents/{slug}",
			tags: ["admin"],
			request: {
				params: z.object({ slug: z.string() }),
				body: {
					content: {
						"application/json": { schema: CatalogAgentInputSchema.omit({ slug: true }).partial() },
					},
				},
			},
			responses: {
				200: {
					description: "展示信息已更新（status 不在此路径修改）",
					content: { "application/json": { schema: z.object({ data: z.unknown() }) } },
				},
				...errors,
			},
		},
		async (c) => {
			const { catalog, audit, gateway } = c.get("services");
			const { subject } = requireAdmin(c, c.get("services").config);
			const slug = c.req.param("slug") ?? "";
			const body = c.req.valid("json");
			const entry = await updateCatalogResources(gateway, catalog, slug, body);
			if (!entry) throw new KitError("not_found", "agent 不存在");
			audit.append({
				subject,
				action: "catalog.update",
				target: slug,
				detail: { name: redactSecrets(entry.display_name), fields: Object.keys(body) },
			});
			return c.json({ data: entry }, 200);
		},
	);

	app.openapi(
		{
			method: "delete",
			path: "/api/admin/agents/{slug}",
			tags: ["admin"],
			request: {
				params: z.object({ slug: z.string() }),
				body: {
					content: {
						"application/json": {
							schema: z.object({ plan_id: z.string().min(1), confirm_token: z.string().min(1) }),
						},
					},
				},
			},
			responses: {
				200: {
					description: "条目已标记删除（软删，确认令牌已消费）",
					content: { "application/json": { schema: z.object({ data: z.object({ deleted: z.boolean() }) }) } },
				},
				...errors,
			},
		},
		async (c) => {
			const { catalog, templates, gate, audit } = c.get("services");
			const { subject } = requireAdmin(c, c.get("services").config);
			const slug = c.req.param("slug") ?? "";
			const entry = catalog.getBySlug(slug);
			if (!entry || entry.deleted) throw new KitError("not_found", "agent 不存在");
			const body = c.req.valid("json");
			await gate.consume({ planId: body.plan_id, action: DELETE_ACTION, subject, token: body.confirm_token });
			const deleted = catalog.markDeleted(entry.id);
			// 原硬删经外键级联解除模版关联；软删改为显式解除，模版回到未上架展示。
			templates.detachListingByCatalog(entry.id);
			audit.append({
				subject,
				action: "catalog.delete",
				target: slug,
				detail: { name: redactSecrets(entry.display_name), remote_agent_id: entry.remote_agent_id },
			});
			return c.json({ data: { deleted } }, 200);
		},
	);

	app.openapi(
		{
			method: "get",
			path: "/api/admin/remote/agents",
			tags: ["admin"],
			responses: {
				200: {
					description: "Provider 侧 Agent 列表（上架时选择）",
					content: {
						"application/json": {
							schema: z.object({
								data: z.array(
									z.object({
										agent_id: z.string(),
										name: z.string(),
										version: z.number().optional(),
										is_coordinator: z.boolean().optional(),
									}),
								),
							}),
						},
					},
				},
				...errors,
			},
		},
		async (c) => {
			const { gateway } = c.get("services");
			return c.json({ data: await gateway.listRemoteAgents() }, 200);
		},
	);

	app.openapi(
		createRoute({
			method: "get",
			path: "/api/admin/remote/environments",
			tags: ["admin"],
			responses: {
				200: {
					description: "Provider 侧完整环境列表（上架时选择）",
					content: { "application/json": { schema: z.object({ data: z.array(RemoteEnvironmentSchema) }) } },
				},
				...errors,
			},
		}),
		async (c) => c.json({ data: await c.get("services").gateway.listRemoteEnvironments() }, 200),
	);

	app.openapi(
		{
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
		},
		(c) => {
			const { operations } = c.get("services");
			const query = c.req.valid("query");
			const rows = operations.list({
				...(query.session_id ? { sessionId: query.session_id } : {}),
				...(query.limit ? { limit: query.limit } : {}),
			});
			return c.json(
				{
					data: rows.filter((row) =>
						c.get("services").resourceDrafts.canReadOperation(row.operation_id, c.get("admin").subject),
					),
				},
				200,
			);
		},
	);

	app.openapi(
		{
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
		},
		(c) => c.json({ data: c.get("services").memberUsage.summaryByTemplate(c.req.valid("query")) }, 200),
	);

	app.openapi(
		{
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
		},
		(c) => {
			const { templates, usageLimits } = c.get("services");
			const query = c.req.valid("query");
			if (query.template_id) templates.get(query.template_id);
			return c.json({ data: usageLimits.templateDailyTrend(query.template_id ?? null, query.days) }, 200);
		},
	);

	app.openapi(
		{
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
		},
		(c) => {
			const { templates, memberUsage } = c.get("services");
			templates.get(c.req.valid("param").templateId);
			return c.json(memberUsage.listByTemplate(c.req.valid("param").templateId, c.req.valid("query")), 200);
		},
	);

	/** 用量汇总时间窗口固定按 UTC+8 拼 RFC 3339 字符串（上游契约），默认最近 7 天。 */
	const USAGE_DEFAULT_RANGE_MS = 7 * 24 * 60 * 60 * 1000;
	/** 毫秒时间戳 → 带 +08:00 偏移的 RFC 3339（秒级，无毫秒）。 */
	function utc8Rfc3339(ms: number) {
		return `${new Date(ms + 8 * 60 * 60 * 1000).toISOString().slice(0, 19)}+08:00`;
	}
	function usageTimeWindowMs(query: { start_time?: number; end_time?: number }) {
		const end = query.end_time ?? Date.now();
		const start = query.start_time ?? end - USAGE_DEFAULT_RANGE_MS;
		if (start > end) throw new KitError("invalid_request", "时间区间无效：start_time 不能晚于 end_time");
		return { start, end };
	}
	function usageTimeRange(query: { start_time?: number; end_time?: number }) {
		const { start, end } = usageTimeWindowMs(query);
		return { start_time: utc8Rfc3339(start), end_time: utc8Rfc3339(end) };
	}

	const usageTelemetryCommonQuery = {
		start_time: z.coerce.number().int().nonnegative().optional(),
		end_time: z.coerce.number().int().nonnegative().optional(),
		/** 传 session_id 时按会话维度查询（dimension=session，忽略时间区间与 agent_id，按会话自身窗口统计）。 */
		session_id: z.string().min(1).max(128).optional(),
		agent_id: z.string().min(1).max(128).optional(),
	};
	/** 维度组装：session_id 优先（会话维度），其次 agent_id（agent 维度）；两者都缺省时路由已拦截走模版口径扇出，
	 * 不暴露 workspace——此分支仅为 0.11.0 互斥联合类型的完备性（运行时不可达）。 */
	function usageSummaryRequest(query: {
		session_id?: string;
		agent_id?: string;
		start_time?: number;
		end_time?: number;
	}): UsageSummaryRequest {
		if (query.session_id) return { dimension: "session", session_id: query.session_id };
		if (query.agent_id) return { dimension: "agent", agent_id: query.agent_id, time_range: usageTimeRange(query) };
		return { dimension: "workspace", time_range: usageTimeRange(query) };
	}

	/** 「全部」模版口径：逐模版绑定智能体（含已删模版，去重）以 agent 维度查询后合并，非模版智能体不计入。
	 * 单个智能体查询失败不打挂整个请求（P2-5）：返回已成功部分的合并并标注 coverage 部分成功。 */
	function coverageOf(agentIds: string[], settled: PromiseSettledResult<unknown>[]): UsageCoverage | undefined {
		const missing = agentIds.filter((_, index) => settled[index]?.status === "rejected");
		return missing.length ? { complete: false, missing_agent_ids: missing } : undefined;
	}

	async function usageSummaryAcrossTemplates(
		gateway: Pick<ProviderGateway, "getUsageSummary">,
		templates: { boundAgentIds(): string[] },
		time_range: UsageTimeRange,
	): Promise<UsageSummary> {
		const agentIds = templates.boundAgentIds();
		if (!agentIds.length) return emptyUsageSummary(time_range);
		const settled = await Promise.allSettled(
			agentIds.map((agent_id) => gateway.getUsageSummary({ dimension: "agent", agent_id, time_range })),
		);
		const merged =
			mergeUsageSummaries(settled.flatMap((result) => (result.status === "fulfilled" ? [result.value.data] : []))) ??
			emptyUsageSummary(time_range);
		const coverage = coverageOf(agentIds, settled);
		return coverage ? { ...merged, coverage } : merged;
	}

	app.openapi(
		{
			method: "get",
			path: "/api/admin/usage/summary",
			tags: ["admin"],
			request: {
				query: z.object(usageTelemetryCommonQuery),
			},
			responses: {
				200: {
					description:
						"Provider 侧用量汇总（app-control usage.summary）：维度由参数决定——传 session_id 为 dimension:session（按会话自身窗口，不传 time_range/granularity；本地账本已标记删除的会话直接返回零值空汇总，不查询 Provider），传 agent_id 为 dimension:agent，都不传为模版口径（服务端逐模版绑定智能体——含已删模版、去重——以 agent 维度查询并合并为各模版求和，非模版智能体不计入；单个智能体查询失败不打挂整个请求，返回已成功部分的合并并在 data.coverage 标注 {complete:false, missing_agent_ids}，缺省即完整）；?start_time=&end_time=（毫秒，缺省最近 7 天）在服务端转成 UTC+8 偏移的 RFC 3339 字符串；返回 {data:{query_range,data_updated_at,usage:{total,models,tools}}}，指标统一为 {value,unit}（未知为 null、已知零值为 0，跨智能体合并时任一来源未知即未知，cache_hit_ratio 按合并后的 cache_read/input 重算）；模型/工具明细同一次响应返回，无分页、无服务端名称筛选，单次明细合计上限 10 万条；无模版绑定时返回零值汇总；管理员与 auditor 可读",
					content: { "application/json": { schema: z.object({ data: UsageSummarySchema }) } },
				},
				...errors,
			},
		},
		async (c) => {
			const { gateway, templates, memberUsage } = c.get("services");
			const query = c.req.valid("query");
			if (!query.session_id && !query.agent_id) {
				return c.json({ data: await usageSummaryAcrossTemplates(gateway, templates, usageTimeRange(query)) }, 200);
			}
			// 已删除会话在 Provider 侧明细不可得：直接返回零值空汇总，不再打 Provider。
			if (query.session_id && memberUsage.isDeletedSession(query.session_id)) {
				return c.json({ data: emptyUsageSummary() }, 200);
			}
			const result = await gateway.getUsageSummary(usageSummaryRequest(c.req.valid("query")));
			return c.json({ data: result.data }, 200);
		},
	);

	/** 趋势查询（单智能体）：上游仅支持 workspace/agent 维度、无 session 维度；粒度可传 hour/day/month，缺省按天（UTC+8 对齐）。 */
	function usageTrendRequest(query: {
		agent_id: string;
		start_time?: number;
		end_time?: number;
		granularity?: UsageGranularity;
	}): UsageTrendRequest {
		const time_range = usageTimeRange(query);
		const granularity: UsageGranularity = query.granularity ?? "day";
		return { dimension: "agent", agent_id: query.agent_id, time_range, granularity };
	}

	/** 「全部」模版口径：逐模版绑定智能体（含已删模版，去重）以 agent 维度查询后按时间桶合并，非模版智能体不计入。
	 * 单个智能体查询失败不打挂整个请求（P2-5）：返回已成功部分的合并并标注 coverage 部分成功。 */
	async function usageTrendAcrossTemplates(
		gateway: Pick<ProviderGateway, "getUsageTrend">,
		templates: { boundAgentIds(): string[] },
		query: { start_time?: number; end_time?: number; granularity?: UsageGranularity },
	): Promise<UsageTrend> {
		const agentIds = templates.boundAgentIds();
		const granularity: UsageGranularity = query.granularity ?? "day";
		if (!agentIds.length) return emptyUsageTrend(usageTimeRange(query), granularity);
		const settled = await Promise.allSettled(
			agentIds.map((agent_id) => usageTrendAggregated(gateway, usageTrendRequest({ ...query, agent_id }))),
		);
		// 分页游标缺失是服务端聚合不变量被破坏（KitError），不属于可标注的单智能体不可用，照旧整体拒绝。
		const fatal = settled.find(
			(result): result is PromiseRejectedResult => result.status === "rejected" && result.reason instanceof KitError,
		);
		if (fatal) throw fatal.reason;
		const merged =
			mergeTrends(settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []))) ??
			emptyUsageTrend(usageTimeRange(query), granularity);
		const coverage = coverageOf(agentIds, settled);
		return coverage ? { ...merged, coverage } : merged;
	}

	const USAGE_TREND_PAGE_SIZE = 100;

	/** 单轮分页聚合为单响应。 */
	async function usageTrendPages(
		gateway: Pick<ProviderGateway, "getUsageTrend">,
		request: UsageTrendRequest,
	): Promise<UsageTrend> {
		let first: UsageTrend | null = null;
		const points: UsageTrendPoint[] = [];
		let pageToken: string | null | undefined;
		do {
			const page = await gateway.getUsageTrend({
				...request,
				page_size: USAGE_TREND_PAGE_SIZE,
				...(pageToken ? { page_token: pageToken } : {}),
			});
			first ??= page.data;
			points.push(...page.data.points);
			if (page.data.has_more && !page.data.next_page_token)
				throw new KitError("provider_error", "用量趋势缺少下一页游标，请稍后重试", { retryable: true });
			pageToken = page.data.next_page_token;
		} while (pageToken);
		return { ...first, points, has_more: false, next_page_token: null };
	}

	/** page_token 15 分钟过期（Provider 410）→ 清空聚合从第一页整轮重查一次（趋势只读幂等）。 */
	function isExpiredTrendToken(error: unknown): boolean {
		return error instanceof ApiError && error.statusCode === 410;
	}

	async function usageTrendAggregated(
		gateway: Pick<ProviderGateway, "getUsageTrend">,
		request: UsageTrendRequest,
	): Promise<UsageTrend> {
		let trend = await usageTrendPages(gateway, request).catch((error: unknown) => {
			if (!isExpiredTrendToken(error)) throw error;
			return null;
		});
		if (!trend) trend = await usageTrendPages(gateway, request);
		return trend;
	}

	app.openapi(
		{
			method: "get",
			path: "/api/admin/usage/trend",
			tags: ["admin"],
			request: {
				query: z.object({
					start_time: usageTelemetryCommonQuery.start_time,
					end_time: usageTelemetryCommonQuery.end_time,
					agent_id: usageTelemetryCommonQuery.agent_id,
					granularity: UsageGranularitySchema.optional(),
				}),
			},
			responses: {
				200: {
					description:
						"用量分桶趋势：传 agent_id 为 agent 维度；都不传为模版口径（服务端逐模版绑定智能体——含已删模版、去重——以 agent 维度查询并按时间桶合并为各模版求和，非模版智能体不计入，无模版绑定时返回空点；单个智能体查询失败不打挂整个请求，返回已成功部分的合并并在 data.coverage 标注 {complete:false, missing_agent_ids}，缺省即完整；服务端分页游标缺失仍整体拒绝）（Provider 侧，UTC+8 对齐，无数据的时间桶省略）；粒度由 granularity 参数决定（hour/day/month，缺省 day）；服务端聚合全部分页返回，has_more 恒为 false",
					content: { "application/json": { schema: z.object({ data: UsageTrendSchema }) } },
				},
				...errors,
			},
		},
		async (c) => {
			const { gateway, templates } = c.get("services");
			const query = c.req.valid("query");
			const { agent_id } = query;
			if (agent_id) {
				return c.json({ data: await usageTrendAggregated(gateway, usageTrendRequest({ ...query, agent_id })) }, 200);
			}
			return c.json({ data: await usageTrendAcrossTemplates(gateway, templates, query) }, 200);
		},
	);

	app.openapi(
		{
			method: "get",
			path: "/api/admin/metrics",
			tags: ["admin"],
			responses: {
				200: {
					description:
						"Prometheus 文本格式的进程内指标（label 只有路由模板/方法/状态码，不含令牌、事件正文与用户输入）",
					content: { "text/plain": { schema: z.string() } },
				},
				...errors,
			},
		},
		(c) => {
			const { metrics, buffers } = c.get("services");
			metrics.gauge("kit_event_buffer_sessions", buffers.size());
			// Prometheus 文本格式；zod-openapi 的 text/plain 响应要求用 c.text（TypedResponse 一致性）
			return c.text(metrics.render(), 200);
		},
	);

	/** ---- 评测浏览（只读；auditor 可用）---- */

	app.openapi(
		{
			method: "get",
			path: "/api/admin/eval/workspaces",
			tags: ["admin"],
			responses: {
				200: {
					description: "已配置的评测 workspace 列表（KIT_EVAL_WORKSPACES）",
					content: { "application/json": { schema: z.object({ data: z.array(EvalWorkspaceViewSchema) }) } },
				},
				...errors,
			},
		},
		(c) => {
			requireAdmin(c, c.get("services").config);
			return c.json({ data: c.get("services").eval.workspaces() }, 200);
		},
	);

	app.openapi(
		{
			method: "get",
			path: "/api/admin/eval/runs",
			tags: ["admin"],
			request: { query: z.object({ workspace: z.string().min(1) }) },
			responses: {
				200: {
					description: "workspace 下 complete 的 run 摘要（新→旧）",
					content: { "application/json": { schema: z.object({ data: z.array(EvalRunSummarySchema) }) } },
				},
				...errors,
			},
		},
		(c) => {
			requireAdmin(c, c.get("services").config);
			return c.json({ data: c.get("services").eval.runs(c.req.valid("query").workspace) }, 200);
		},
	);

	app.openapi(
		{
			method: "get",
			path: "/api/admin/eval/runs/{runId}",
			tags: ["admin"],
			request: {
				params: z.object({ runId: z.string() }),
				query: z.object({ workspace: z.string().min(1) }),
			},
			responses: {
				200: {
					description: "run 详情：逐 case 断言 + 基线 + report.html 原文",
					content: { "application/json": { schema: z.object({ data: EvalRunDetailSchema }) } },
				},
				...errors,
			},
		},
		(c) => {
			requireAdmin(c, c.get("services").config);
			const data = c.get("services").eval.run(c.req.valid("query").workspace, c.req.param("runId") ?? undefined);
			return c.json({ data }, 200);
		},
	);

	/** ---- 用量配额与提额审批（v1）---- */

	app.openapi(
		{
			method: "get",
			path: "/api/admin/quota/policy",
			tags: ["admin"],
			responses: {
				200: {
					description: "默认月度政策",
					content: { "application/json": { schema: z.object({ data: QuotaPolicyViewSchema }) } },
				},
				...errors,
			},
		},
		(c) => {
			requireAdmin(c, c.get("services").config);
			return c.json({ data: c.get("services").quota.policy() }, 200);
		},
	);

	app.openapi(
		{
			method: "put",
			path: "/api/admin/quota/policy",
			tags: ["admin"],
			request: { body: { content: { "application/json": { schema: PutQuotaPolicySchema } } } },
			responses: {
				200: {
					description: "政策已更新（-1=不限量）",
					content: { "application/json": { schema: z.object({ data: QuotaPolicyViewSchema }) } },
				},
				...errors,
			},
		},
		(c) => {
			const { subject } = requireAdminWrite(c, c.get("services").config);
			const body = c.req.valid("json");
			return c.json({ data: c.get("services").quota.putPolicy(body.monthly_credits, subject) }, 200);
		},
	);

	app.openapi(
		{
			method: "get",
			path: "/api/admin/quota/overrides",
			tags: ["admin"],
			responses: {
				200: {
					description: "每员工长期上限（含当月用量与加油包）",
					content: { "application/json": { schema: z.object({ data: z.array(QuotaOverrideViewSchema) }) } },
				},
				...errors,
			},
		},
		(c) => {
			requireAdmin(c, c.get("services").config);
			return c.json({ data: c.get("services").quota.overrides() }, 200);
		},
	);

	app.openapi(
		{
			method: "put",
			path: "/api/admin/quota/overrides/{subjectId}",
			tags: ["admin"],
			request: {
				params: z.object({ subjectId: z.string() }),
				body: { content: { "application/json": { schema: PutQuotaOverrideSchema } } },
			},
			responses: {
				200: {
					description: "override 已写入",
					content: { "application/json": { schema: z.object({ data: QuotaOverrideViewSchema }) } },
				},
				...errors,
			},
		},
		(c) => {
			const { subject } = requireAdminWrite(c, c.get("services").config);
			const body = c.req.valid("json");
			const view = c.get("services").quota.putOverride(
				{
					subjectId: c.req.param("subjectId") ?? "",
					monthlyCredits: body.monthly_credits,
					...(body.reason ? { reason: body.reason } : {}),
				},
				subject,
			);
			return c.json({ data: view }, 200);
		},
	);

	app.openapi(
		{
			method: "delete",
			path: "/api/admin/quota/overrides/{subjectId}",
			tags: ["admin"],
			request: { params: z.object({ subjectId: z.string() }) },
			responses: {
				200: {
					description: "override 已删除（回落到默认政策）",
					content: { "application/json": { schema: z.object({ data: z.object({ deleted: z.boolean() }) }) } },
				},
				...errors,
			},
		},
		(c) => {
			const { subject } = requireAdminWrite(c, c.get("services").config);
			const deleted = c.get("services").quota.deleteOverride(c.req.param("subjectId") ?? "", subject);
			if (!deleted) throw new KitError("not_found", "该 subject 没有 override");
			return c.json({ data: { deleted } }, 200);
		},
	);

	app.openapi(
		{
			method: "post",
			path: "/api/admin/quota/packs",
			tags: ["admin"],
			request: { body: { content: { "application/json": { schema: CreateQuotaPackSchema } } } },
			responses: {
				201: {
					description: "当月加油包已发放",
					content: { "application/json": { schema: z.object({ data: QuotaPackViewSchema }) } },
				},
				...errors,
			},
		},
		(c) => {
			const { subject } = requireAdminWrite(c, c.get("services").config);
			const body = c.req.valid("json");
			const view = c.get("services").quota.createPack(
				{
					subjectId: body.subject_id,
					credits: body.credits,
					...(body.reason ? { reason: body.reason } : {}),
				},
				subject,
			);
			return c.json({ data: view }, 201);
		},
	);

	app.openapi(
		{
			method: "delete",
			path: "/api/admin/quota/packs/{packId}",
			tags: ["admin"],
			request: { params: z.object({ packId: z.string() }) },
			responses: {
				200: {
					description: "加油包已删除",
					content: { "application/json": { schema: z.object({ data: z.object({ deleted: z.boolean() }) }) } },
				},
				...errors,
			},
		},
		(c) => {
			const { subject } = requireAdminWrite(c, c.get("services").config);
			const deleted = c.get("services").quota.deletePack(c.req.param("packId") ?? "", subject);
			if (!deleted) throw new KitError("not_found", "加油包不存在");
			return c.json({ data: { deleted } }, 200);
		},
	);

	app.openapi(
		{
			method: "get",
			path: "/api/admin/quota/requests",
			tags: ["admin"],
			request: { query: z.object({ status: z.enum(["pending", "approved", "rejected"]).optional() }) },
			responses: {
				200: {
					description: "提额申请队列",
					content: { "application/json": { schema: z.object({ data: z.array(QuotaRequestViewSchema) }) } },
				},
				...errors,
			},
		},
		(c) => {
			requireAdmin(c, c.get("services").config);
			const status = c.req.valid("query").status;
			return c.json({ data: c.get("services").quota.requests(status) }, 200);
		},
	);

	app.openapi(
		{
			method: "post",
			path: "/api/admin/quota/requests/{id}/review",
			tags: ["admin"],
			request: {
				params: z.object({ id: z.string() }),
				body: { content: { "application/json": { schema: ReviewQuotaRequestSchema } } },
			},
			responses: {
				200: {
					description: "审批完成",
					content: { "application/json": { schema: z.object({ data: QuotaRequestViewSchema }) } },
				},
				...errors,
			},
		},
		(c) => {
			const { subject } = requireAdminWrite(c, c.get("services").config);
			const body = c.req.valid("json");
			const view = c.get("services").quota.review(
				c.req.param("id") ?? "",
				{
					action: body.action,
					...(body.mode ? { mode: body.mode } : {}),
					...(body.granted_credits ? { grantedCredits: body.granted_credits } : {}),
					...(body.note ? { note: body.note } : {}),
				},
				subject,
			);
			return c.json({ data: view }, 200);
		},
	);

	app.openapi(
		{
			method: "get",
			path: "/api/admin/quota/usage",
			tags: ["admin"],
			request: {
				query: z.object({
					month: z
						.string()
						.regex(/^\d{4}-\d{2}$/)
						.optional(),
				}),
			},
			responses: {
				200: {
					description: "当月每 subject 用量",
					content: { "application/json": { schema: z.object({ data: z.array(QuotaUsageRowSchema) }) } },
				},
				...errors,
			},
		},
		(c) => {
			requireAdmin(c, c.get("services").config);
			const month = c.req.valid("query").month;
			return c.json({ data: c.get("services").quota.usage(month) }, 200);
		},
	);
}
