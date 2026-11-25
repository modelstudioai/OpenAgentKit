import type {
	UsageMetric,
	UsageModelMetrics,
	UsageModelRow,
	UsageSummary,
	UsageTimeRange,
	UsageToolMetrics,
	UsageToolRow,
	UsageTotal,
	UsageTrend,
	UsageTrendPoint,
} from "@openagentkit/sdk/protocol";

/** 可加指标逐项相加；任一来源未知（null）则合并结果未知，不得按 0 补齐。 */
function addMetric(a: UsageMetric, b: UsageMetric): UsageMetric {
	return a.value === null || b.value === null
		? { value: null, unit: a.unit }
		: { value: a.value + b.value, unit: a.unit };
}

/** 比率不能跨维度相加：按合并后的 cache_read/input 重算（口径对齐 mock 网关公式），任一输入未知则未知。 */
function ratioMetric(cacheRead: UsageMetric, input: UsageMetric): UsageMetric {
	if (cacheRead.value === null || input.value === null) return { value: null, unit: "ratio" };
	return { value: input.value === 0 ? 0 : cacheRead.value / input.value, unit: "ratio" };
}

const TOTAL_ADDITIVE_KEYS = [
	"input_tokens",
	"output_tokens",
	"total_tokens",
	"cache_read_tokens",
	"cache_creation_tokens",
	"model_call_count",
	"tool_call_count",
	"builtin_tool_call_count",
	"mcp_tool_call_count",
	"custom_tool_call_count",
	"turns",
	"steps",
	"interrupt_error_count",
	"model_failed_count",
	"tool_failed_count",
	"runtime_ms",
] as const;

function addTotal(a: UsageTotal, b: UsageTotal): UsageTotal {
	const merged = { ...a };
	for (const key of TOTAL_ADDITIVE_KEYS) merged[key] = addMetric(a[key], b[key]);
	merged.cache_hit_ratio = ratioMetric(merged.cache_read_tokens, merged.input_tokens);
	return merged;
}

const MODEL_ADDITIVE_KEYS = [
	"input_tokens",
	"output_tokens",
	"total_tokens",
	"cache_read_tokens",
	"cache_creation_tokens",
	"call_count",
	"failed_count",
] as const;

function addModelUsage(a: UsageModelMetrics, b: UsageModelMetrics): UsageModelMetrics {
	const merged = { ...a };
	for (const key of MODEL_ADDITIVE_KEYS) merged[key] = addMetric(a[key], b[key]);
	merged.cache_hit_ratio = ratioMetric(merged.cache_read_tokens, merged.input_tokens);
	return merged;
}

function addToolUsage(a: UsageToolMetrics, b: UsageToolMetrics): UsageToolMetrics {
	return {
		call_count: addMetric(a.call_count, b.call_count),
		failed_count: addMetric(a.failed_count, b.failed_count),
	};
}

function mergeModelRows(left: UsageModelRow[], right: UsageModelRow[]): UsageModelRow[] {
	const rows = new Map<string, UsageModelRow>();
	for (const row of [...left, ...right]) {
		const key = JSON.stringify(row.model_name);
		const existing = rows.get(key);
		rows.set(key, existing ? { ...existing, usage: addModelUsage(existing.usage, row.usage) } : row);
	}
	return [...rows.values()];
}

function mergeToolRows(left: UsageToolRow[], right: UsageToolRow[]): UsageToolRow[] {
	const rows = new Map<string, UsageToolRow>();
	for (const row of [...left, ...right]) {
		const key = JSON.stringify([row.source, row.tool_name]);
		const existing = rows.get(key);
		rows.set(key, existing ? { ...existing, usage: addToolUsage(existing.usage, row.usage) } : row);
	}
	return [...rows.values()];
}

function mergeUsageViews(a: UsageSummary["usage"], b: UsageSummary["usage"]): UsageSummary["usage"] {
	return {
		total: addTotal(a.total, b.total),
		models: mergeModelRows(a.models, b.models),
		tools: mergeToolRows(a.tools, b.tools),
	};
}

function latestUpdatedAt(values: { data_updated_at: string | null }[]): string | null {
	const times = values.map((value) => value.data_updated_at).filter((time): time is string => time !== null);
	return times.length ? times.reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b)) : null;
}

/** 逐 agent 汇总合并为「全部模版」视角：时间窗取首个响应，data_updated_at 取最新，明细行分组求和。 */
export function mergeUsageSummaries(summaries: UsageSummary[]): UsageSummary | null {
	const [first, ...rest] = summaries;
	if (!first) return null;
	return {
		query_range: first.query_range,
		data_updated_at: latestUpdatedAt(summaries),
		usage: rest.reduce((acc, summary) => mergeUsageViews(acc, summary.usage), first.usage),
	};
}

function mergeTrendPoints(lists: UsageTrendPoint[][]): UsageTrendPoint[] {
	const byStart = new Map<string, UsageTrendPoint>();
	for (const list of lists) {
		for (const point of list) {
			const existing = byStart.get(point.start_time);
			byStart.set(
				point.start_time,
				existing ? { ...existing, usage: mergeUsageViews(existing.usage, point.usage) } : point,
			);
		}
	}
	return [...byStart.values()].sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time));
}

/** 逐 agent 趋势合并为「全部模版」视角：时间桶按 start_time 求和升序排列，分页字段恒为末页。 */
export function mergeTrends(trends: UsageTrend[]): UsageTrend | null {
	const [first] = trends;
	if (!first) return null;
	return {
		query_range: first.query_range,
		data_updated_at: latestUpdatedAt(trends),
		granularity: first.granularity,
		points: mergeTrendPoints(trends.map((trend) => trend.points)),
		has_more: false,
		next_page_token: null,
	};
}

function zeroMetric(unit: string): UsageMetric {
	return { value: 0, unit };
}

function zeroTotal(): UsageTotal {
	const zero = zeroMetric("count");
	return {
		input_tokens: zeroMetric("tokens"),
		output_tokens: zeroMetric("tokens"),
		total_tokens: zeroMetric("tokens"),
		cache_read_tokens: zeroMetric("tokens"),
		cache_creation_tokens: zeroMetric("tokens"),
		cache_hit_ratio: zeroMetric("ratio"),
		model_call_count: zero,
		tool_call_count: zero,
		builtin_tool_call_count: zero,
		mcp_tool_call_count: zero,
		custom_tool_call_count: zero,
		turns: zero,
		steps: zero,
		interrupt_error_count: zero,
		model_failed_count: zero,
		tool_failed_count: zero,
		runtime_ms: zeroMetric("ms"),
	};
}

/** 模版集合为空时的零值汇总：无数据（data_updated_at null），指标为零（已知零值为 0，不当作未知）。 */
export function emptyUsageSummary(time_range?: UsageTimeRange): UsageSummary {
	return {
		...(time_range ? { query_range: time_range } : {}),
		data_updated_at: null,
		usage: { total: zeroTotal(), models: [], tools: [] },
	};
}

/** 模版集合为空时的零值趋势：无数据点，窗口与粒度按请求回显。 */
export function emptyUsageTrend(time_range: UsageTimeRange, granularity: UsageTrend["granularity"]): UsageTrend {
	return {
		query_range: time_range,
		data_updated_at: null,
		granularity,
		points: [],
		has_more: false,
		next_page_token: null,
	};
}
