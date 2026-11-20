import type {
	UsageMetric,
	UsageModelMetrics,
	UsageSummary,
	UsageTotal,
	UsageTrend,
	UsageTrendPoint,
} from "@openagentkit/sdk/protocol";
import { describe, expect, it } from "vitest";
import { emptyUsageSummary, emptyUsageTrend, mergeTrends, mergeUsageSummaries } from "./usage-aggregate.ts";

function m(value: number | null, unit = "count"): UsageMetric {
	return { value, unit };
}

function modelMetrics(overrides: Partial<UsageModelMetrics> = {}): UsageModelMetrics {
	return {
		input_tokens: m(0, "tokens"),
		output_tokens: m(0, "tokens"),
		total_tokens: m(0, "tokens"),
		cache_read_tokens: m(0, "tokens"),
		cache_creation_tokens: m(0, "tokens"),
		cache_hit_ratio: m(0, "ratio"),
		call_count: m(0),
		failed_count: m(0),
		...overrides,
	};
}

function total(overrides: Partial<UsageTotal> = {}): UsageTotal {
	return {
		input_tokens: m(0, "tokens"),
		output_tokens: m(0, "tokens"),
		total_tokens: m(0, "tokens"),
		cache_read_tokens: m(0, "tokens"),
		cache_creation_tokens: m(0, "tokens"),
		cache_hit_ratio: m(0, "ratio"),
		model_call_count: m(0),
		tool_call_count: m(0),
		builtin_tool_call_count: m(0),
		mcp_tool_call_count: m(0),
		custom_tool_call_count: m(0),
		turns: m(0),
		steps: m(0),
		interrupt_error_count: m(0),
		model_failed_count: m(0),
		tool_failed_count: m(0),
		runtime_ms: m(0, "ms"),
		...overrides,
	};
}

function point(start: string, usage: Partial<UsageTotal> = {}): UsageTrendPoint {
	return {
		start_time: start,
		end_time: start,
		usage: { total: total(usage), models: [], tools: [] },
	};
}

function trend(overrides: Partial<UsageTrend> = {}): UsageTrend {
	return {
		query_range: { start_time: "2026-11-11T00:00:00+08:00", end_time: "2026-11-18T00:00:00+08:00" },
		data_updated_at: null,
		granularity: "day",
		points: [],
		has_more: false,
		next_page_token: null,
		...overrides,
	};
}

function summary(overrides: Partial<UsageSummary> = {}): UsageSummary {
	return {
		query_range: { start_time: "2026-11-11T00:00:00+08:00", end_time: "2026-11-18T00:00:00+08:00" },
		data_updated_at: null,
		usage: { total: total(), models: [], tools: [] },
		...overrides,
	};
}

describe("mergeTrends", () => {
	it("重叠时间桶求和、缺口并集升序排列；比率按合并后的 cache_read/input 重算", () => {
		const merged = mergeTrends([
			trend({
				points: [
					point("2026-11-17T00:00:00+08:00", {
						input_tokens: m(100, "tokens"),
						total_tokens: m(150, "tokens"),
						cache_read_tokens: m(40, "tokens"),
						cache_hit_ratio: m(0.4, "ratio"),
					}),
				],
			}),
			trend({
				points: [
					point("2026-11-18T00:00:00+08:00", { input_tokens: m(20, "tokens") }),
					point("2026-11-17T00:00:00+08:00", { input_tokens: m(50, "tokens"), cache_read_tokens: m(10, "tokens") }),
				],
			}),
		]);
		expect(merged?.points.map((entry) => entry.start_time)).toEqual([
			"2026-11-17T00:00:00+08:00",
			"2026-11-18T00:00:00+08:00",
		]);
		expect(merged?.points[0]?.usage.total.input_tokens).toEqual(m(150, "tokens"));
		expect(merged?.points[0]?.usage.total.cache_hit_ratio.value).toBeCloseTo(50 / 150);
		expect(merged?.points[1]?.usage.total.input_tokens).toEqual(m(20, "tokens"));
		expect(merged?.points[1]?.usage.total.cache_hit_ratio).toEqual(m(0, "ratio"));
	});

	it("任一来源指标未知则合并结果未知；分页字段恒为末页", () => {
		const merged = mergeTrends([
			trend({ points: [point("2026-11-17T00:00:00+08:00", { runtime_ms: m(1000, "ms") })] }),
			trend({ points: [point("2026-11-17T00:00:00+08:00", { runtime_ms: m(null, "ms") })] }),
		]);
		expect(merged?.points[0]?.usage.total.runtime_ms).toEqual(m(null, "ms"));
		expect(merged?.has_more).toBe(false);
		expect(merged?.next_page_token).toBeNull();
	});

	it("模型行按 model_name 分组求和、null 名称独立分组；工具行按 source+tool_name 分组", () => {
		const modelRow = (name: string | null, input: number, calls: number) => ({
			model_name: name,
			usage: modelMetrics({ input_tokens: m(input, "tokens"), call_count: m(calls) }),
		});
		const toolRow = (source: string | null, name: string, calls: number) => ({
			source,
			tool_name: name,
			usage: { call_count: m(calls), failed_count: m(0) },
		});
		const merged = mergeTrends([
			trend({
				points: [
					{
						...point("2026-11-17T00:00:00+08:00"),
						usage: {
							total: total(),
							models: [modelRow("qwen-max", 100, 2), modelRow(null, 10, 1)],
							tools: [toolRow("builtin", "web_search", 2), toolRow("mcp", "memory_search", 1)],
						},
					},
				],
			}),
			trend({
				points: [
					{
						...point("2026-11-17T00:00:00+08:00"),
						usage: {
							total: total(),
							models: [modelRow("qwen-max", 50, 1), modelRow("qwen-plus", 5, 1)],
							tools: [toolRow("builtin", "web_search", 3), toolRow("mcp", "web_search", 1)],
						},
					},
				],
			}),
		]);
		const models = merged?.points[0]?.usage.models ?? [];
		expect(models).toHaveLength(3);
		expect(models.find((row) => row.model_name === "qwen-max")?.usage.input_tokens).toEqual(m(150, "tokens"));
		expect(models.find((row) => row.model_name === "qwen-max")?.usage.call_count).toEqual(m(3));
		expect(models.find((row) => row.model_name === null)?.usage.input_tokens).toEqual(m(10, "tokens"));
		expect(models.find((row) => row.model_name === "qwen-plus")?.usage.input_tokens).toEqual(m(5, "tokens"));
		const tools = merged?.points[0]?.usage.tools ?? [];
		expect(tools).toHaveLength(3);
		expect(tools.find((row) => row.source === "builtin" && row.tool_name === "web_search")?.usage.call_count).toEqual(
			m(5),
		);
		expect(tools.filter((row) => row.tool_name === "web_search")).toHaveLength(2);
	});

	it("窗口与粒度取首个响应，data_updated_at 取最新；空数组返回 null", () => {
		const merged = mergeTrends([
			trend({ data_updated_at: "2026-11-18T09:00:00+08:00" }),
			trend({
				query_range: { start_time: "X", end_time: "Y" },
				granularity: "hour",
				data_updated_at: "2026-11-18T10:00:00+08:00",
			}),
		]);
		expect(merged?.query_range).toEqual({
			start_time: "2026-11-11T00:00:00+08:00",
			end_time: "2026-11-18T00:00:00+08:00",
		});
		expect(merged?.granularity).toBe("day");
		expect(merged?.data_updated_at).toBe("2026-11-18T10:00:00+08:00");
		expect(mergeTrends([])).toBeNull();
	});
});

describe("mergeUsageSummaries", () => {
	it("total 与明细行跨智能体求和；单来源透传不改动数值", () => {
		const first = summary({
			data_updated_at: "2026-11-18T09:00:00+08:00",
			usage: {
				total: total({ input_tokens: m(100, "tokens"), model_call_count: m(2) }),
				models: [{ model_name: "qwen-max", usage: modelMetrics({ input_tokens: m(100, "tokens") }) }],
				tools: [],
			},
		});
		const second = summary({
			data_updated_at: "2026-11-18T10:00:00+08:00",
			usage: {
				total: total({ input_tokens: m(50, "tokens"), model_call_count: m(1) }),
				models: [{ model_name: "qwen-max", usage: modelMetrics({ input_tokens: m(50, "tokens") }) }],
				tools: [],
			},
		});
		const merged = mergeUsageSummaries([first, second]);
		expect(merged?.usage.total.input_tokens).toEqual(m(150, "tokens"));
		expect(merged?.usage.total.model_call_count).toEqual(m(3));
		expect(merged?.usage.models).toHaveLength(1);
		expect(merged?.usage.models[0]?.usage.input_tokens).toEqual(m(150, "tokens"));
		expect(merged?.data_updated_at).toBe("2026-11-18T10:00:00+08:00");
		const passthrough = mergeUsageSummaries([first]);
		expect(passthrough?.usage.total.input_tokens).toEqual(m(100, "tokens"));
	});

	it("空数组返回 null", () => {
		expect(mergeUsageSummaries([])).toBeNull();
	});
});

describe("空模版集合的零值回退", () => {
	it("emptyUsageSummary 返回已知零值与空明细；时间窗可选回显", () => {
		const range = { start_time: "2026-11-11T00:00:00+08:00", end_time: "2026-11-18T00:00:00+08:00" };
		const empty = emptyUsageSummary(range);
		expect(empty.query_range).toEqual(range);
		expect(empty.data_updated_at).toBeNull();
		expect(empty.usage.total.input_tokens).toEqual(m(0, "tokens"));
		expect(empty.usage.total.cache_hit_ratio).toEqual(m(0, "ratio"));
		expect(empty.usage.models).toEqual([]);
		expect(empty.usage.tools).toEqual([]);
		expect(emptyUsageSummary().query_range).toBeUndefined();
	});

	it("emptyUsageTrend 返回空点并回显窗口与粒度", () => {
		const range = { start_time: "2026-11-11T00:00:00+08:00", end_time: "2026-11-18T00:00:00+08:00" };
		const empty = emptyUsageTrend(range, "hour");
		expect(empty).toEqual({
			query_range: range,
			data_updated_at: null,
			granularity: "hour",
			points: [],
			has_more: false,
			next_page_token: null,
		});
	});
});
