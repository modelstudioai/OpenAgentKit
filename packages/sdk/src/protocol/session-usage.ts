import { z } from "zod";

const counter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const seconds = z.number().nonnegative().finite();

/** Provider 的会话累计快照；缺省表示未返回，不能视为零。 */
export const SessionUsageSchema = z.object({
	input_tokens: counter.optional(),
	output_tokens: counter.optional(),
	cache_read_input_tokens: counter.optional(),
	cache_creation_input_tokens: counter.optional(),
});
export type SessionUsage = z.infer<typeof SessionUsageSchema>;
export const SessionStatsSchema = z.object({
	active_seconds: seconds.optional(),
	duration_seconds: seconds.optional(),
});
export type SessionStats = z.infer<typeof SessionStatsSchema>;
export const SESSION_USAGE_METRICS = [
	"input_tokens",
	"output_tokens",
	"cache_read_input_tokens",
	"cache_creation_input_tokens",
	"active_seconds",
	"duration_seconds",
] as const;
export type SessionUsageMetric = (typeof SESSION_USAGE_METRICS)[number];
export const UsageMetricSummarySchema = z.object({
	value: z.number().nonnegative().nullable(),
	covered_sessions: z.number().int().nonnegative(),
});
export const MemberUsageSummarySchema = z.object({
	session_count: z.number().int().nonnegative(),
	deleted_session_count: z.number().int().nonnegative(),
	metrics: z.object({
		input_tokens: UsageMetricSummarySchema,
		output_tokens: UsageMetricSummarySchema,
		cache_read_input_tokens: UsageMetricSummarySchema,
		cache_creation_input_tokens: UsageMetricSummarySchema,
		active_seconds: UsageMetricSummarySchema,
		duration_seconds: UsageMetricSummarySchema,
	}),
	/** 始终包含成员全部 Agent，供筛选器使用，包含保留的已删除会话；条目已标记删除时 deleted=true，display_name 仍可解析。 */
	agents: z.array(
		z.object({
			slug: z.string(),
			display_name: z.string().nullable(),
			deleted: z.boolean().optional(),
		}),
	),
	refreshed_at: z.string().optional(),
	refresh_status: z.enum(["idle", "refreshing", "partial", "failed"]),
	completed_sessions: z.number().int().nonnegative(),
});
export type MemberUsageSummary = z.infer<typeof MemberUsageSummarySchema>;
/** 以模版为主键的用量行：归属该模版绑定智能体的全部体验会话（含其上架条目）。 */
export const TemplateUsageRowSchema = z.object({
	template_id: z.string(),
	name: z.string(),
	/** 模版绑定的智能体展示名。 */
	remote_agent_name: z.string(),
	/** 模版绑定的 Provider 智能体 ID；管理端用它按 agent_id 过滤模型/工具用量明细。 */
	remote_agent_id: z.string(),
	listing_status: z.enum(["listed", "unlisted"]),
	/** 模版已标记删除（软删）：管理列表不再展示，用量区保留并提示。 */
	deleted: z.boolean().optional(),
	session_count: z.number().int().nonnegative(),
	deleted_session_count: z.number().int().nonnegative(),
	metrics: MemberUsageSummarySchema.shape.metrics,
	refreshed_at: z.string().optional(),
});
export type TemplateUsageRow = z.infer<typeof TemplateUsageRowSchema>;
export const TemplateUsagePageSchema = z.object({ data: z.array(TemplateUsageRowSchema) });
export type TemplateUsagePage = z.infer<typeof TemplateUsagePageSchema>;
export const MemberSessionUsageSchema = z.object({
	session_id: z.string(),
	member_id: z.string(),
	agent_slug: z.string(),
	title: z.string().optional(),
	status: z.string().optional(),
	created_at: z.string(),
	deleted_at: z.string().optional(),
	usage: SessionUsageSchema.optional(),
	stats: SessionStatsSchema.optional(),
	captured_at: z.string().optional(),
	collection_status: z.enum(["pending", "complete", "partial", "failed", "not_found"]),
});
export type MemberSessionUsage = z.infer<typeof MemberSessionUsageSchema>;
export const MemberUsageQuerySchema = z.object({
	agent_slug: z.string().min(1).max(128).optional(),
	refresh: z.literal("1").optional(),
});
export type MemberUsageQuery = z.infer<typeof MemberUsageQuerySchema>;
export const MemberUsageResponseSchema = z.object({ data: MemberUsageSummarySchema });
export const MemberSessionsQuerySchema = z.object({
	agent_slug: z.string().min(1).max(128).optional(),
	cursor: z.string().max(2048).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type MemberSessionsQuery = z.infer<typeof MemberSessionsQuerySchema>;
export const MemberSessionsPageSchema = z.object({
	data: z.array(MemberSessionUsageSchema),
	next_cursor: z.string().optional(),
});
export type MemberSessionsPage = z.infer<typeof MemberSessionsPageSchema>;
/** 模版维度的会话用量明细：行附带成员公开资料，跨成员按该模版上架条目过滤。 */
export const TemplateSessionUsageSchema = MemberSessionUsageSchema.extend({
	member_display_name: z.string(),
	member_username: z.string(),
});
export type TemplateSessionUsage = z.infer<typeof TemplateSessionUsageSchema>;
export const TemplateSessionsPageSchema = z.object({
	data: z.array(TemplateSessionUsageSchema),
	next_cursor: z.string().optional(),
});
export type TemplateSessionsPage = z.infer<typeof TemplateSessionsPageSchema>;

/** 模版逐日趋势点：限额账本条目逐日账的当日增量合计（tokens 为输入+输出 Token 增量）。 */
export const TemplateUsageTrendPointSchema = z.object({
	day: z.string(),
	tokens: counter,
	active_seconds: seconds,
});
export type TemplateUsageTrendPoint = z.infer<typeof TemplateUsageTrendPointSchema>;
/** 模版用量逐日趋势：条目逐日账自模版限额账本启用后开始记录（增量归因采集确认日），不含更早历史；零值补全到今天（UTC 日键）。 */
export const TemplateUsageTrendSchema = z.object({
	days: z.number().int(),
	from_day: z.string(),
	to_day: z.string(),
	/** 逐日账最早记录日（前端标注数据起点）；区间内无记录时为 null。 */
	since_day: z.string().nullable(),
	data: z.array(TemplateUsageTrendPointSchema),
});
export type TemplateUsageTrend = z.infer<typeof TemplateUsageTrendSchema>;

/** ---- Provider 侧用量汇总（app-control usage.summary），形状对齐 @openagentpack/sdk 公开契约 ---- */

/** 指标值单元：未知指标保留 unit 且 value 为 null；已知零值为 0，不得当作未知。 */
export const UsageMetricSchema = z.object({
	value: z.number().nullable(),
	unit: z.string(),
});
export type UsageMetric = z.infer<typeof UsageMetricSchema>;

/** RFC 3339 时间窗口（带时区偏移）；响应统一 +08:00，区间左闭右开。 */
export const UsageTimeRangeSchema = z.object({
	start_time: z.string(),
	end_time: z.string(),
});
export type UsageTimeRange = z.infer<typeof UsageTimeRangeSchema>;

/** 汇总指标（total）：模型与工具两类口径分开，不重复相加。 */
export const UsageTotalSchema = z.object({
	input_tokens: UsageMetricSchema,
	output_tokens: UsageMetricSchema,
	total_tokens: UsageMetricSchema,
	cache_read_tokens: UsageMetricSchema,
	cache_creation_tokens: UsageMetricSchema,
	cache_hit_ratio: UsageMetricSchema,
	model_call_count: UsageMetricSchema,
	tool_call_count: UsageMetricSchema,
	builtin_tool_call_count: UsageMetricSchema,
	mcp_tool_call_count: UsageMetricSchema,
	custom_tool_call_count: UsageMetricSchema,
	turns: UsageMetricSchema,
	steps: UsageMetricSchema,
	interrupt_error_count: UsageMetricSchema,
	model_failed_count: UsageMetricSchema,
	tool_failed_count: UsageMetricSchema,
	runtime_ms: UsageMetricSchema,
});
export type UsageTotal = z.infer<typeof UsageTotalSchema>;

/** 模型明细指标。 */
export const UsageModelMetricsSchema = z.object({
	input_tokens: UsageMetricSchema,
	output_tokens: UsageMetricSchema,
	total_tokens: UsageMetricSchema,
	cache_read_tokens: UsageMetricSchema,
	cache_creation_tokens: UsageMetricSchema,
	cache_hit_ratio: UsageMetricSchema,
	call_count: UsageMetricSchema,
	failed_count: UsageMetricSchema,
});
export type UsageModelMetrics = z.infer<typeof UsageModelMetricsSchema>;

/** 单个模型的用量行；model_name 未知时为 null，顺序不保证。 */
export const UsageModelRowSchema = z.object({
	model_name: z.string().nullable(),
	usage: UsageModelMetricsSchema,
});
export type UsageModelRow = z.infer<typeof UsageModelRowSchema>;

/** 工具明细指标（不含 Token 与运行时长）。 */
export const UsageToolMetricsSchema = z.object({
	call_count: UsageMetricSchema,
	failed_count: UsageMetricSchema,
});
export type UsageToolMetrics = z.infer<typeof UsageToolMetricsSchema>;

/** 单个工具的用量行；按 source + tool_name 分组，同名不同来源分开。 */
export const UsageToolRowSchema = z.object({
	source: z.string().nullable(),
	tool_name: z.string().nullable(),
	usage: UsageToolMetricsSchema,
});
export type UsageToolRow = z.infer<typeof UsageToolRowSchema>;

/**
 * 一个查询维度的用量汇总：total / models / tools 是同一范围的三个视图，
 * 不得把 total 与明细行相加；无统计记录时 data_updated_at 为 null。
 */
export const UsageSummarySchema = z.object({
	/** session 维度复用会话自身窗口，上游可能不返回该字段。 */
	query_range: UsageTimeRangeSchema.optional(),
	data_updated_at: z.string().nullable(),
	usage: z.object({
		total: UsageTotalSchema,
		models: z.array(UsageModelRowSchema),
		tools: z.array(UsageToolRowSchema),
	}),
});
export type UsageSummary = z.infer<typeof UsageSummarySchema>;

/** Provider 侧用量分桶趋势（app-control usage.trend），形状对齐 @openagentpack/sdk 公开契约：
 * 仅 workspace/agent 维度；无数据的时间桶省略而非补零；next_page_token 15 分钟过期。 */
export const UsageGranularitySchema = z.enum(["hour", "day", "month"]);
export type UsageGranularity = z.infer<typeof UsageGranularitySchema>;
export const UsageTrendPointSchema = z.object({
	start_time: z.string(),
	end_time: z.string(),
	usage: z.object({
		total: UsageTotalSchema,
		models: z.array(UsageModelRowSchema),
		tools: z.array(UsageToolRowSchema),
	}),
});
export type UsageTrendPoint = z.infer<typeof UsageTrendPointSchema>;
export const UsageTrendSchema = z.object({
	/** 服务端按粒度对齐后的实际窗口（UTC+8）。 */
	query_range: UsageTimeRangeSchema,
	data_updated_at: z.string().nullable(),
	granularity: UsageGranularitySchema,
	points: z.array(UsageTrendPointSchema),
	has_more: z.boolean(),
	/** 下一页游标；末页或已过期时为 null。 */
	next_page_token: z.string().nullable(),
});
export type UsageTrend = z.infer<typeof UsageTrendSchema>;
