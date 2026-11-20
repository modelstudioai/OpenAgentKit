import { setDefaultFetch, type UsageTrendRequest } from "@openagentpack/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockGateway } from "../src/gateway/mock.ts";
import { createSdkGateway } from "../src/gateway/sdk.ts";
import { sessionUsageFromAttributes } from "../src/gateway/session-usage.ts";

const gateway = () =>
	createSdkGateway({ apiKey: "sk-usage-unit-test", baseUrl: "https://provider.example.test/api/v1/agentstudio" });

afterEach(() => {
	setDefaultFetch(fetch);
	vi.useRealTimers();
});

describe("会话累计用量 HTTP 合同（合成 Provider 响应，不是 Cloud 录制）", () => {
	it.each([
		{
			usage: { input_tokens: 120, output_tokens: 80, cache_read_input_tokens: 40, cache_creation_input_tokens: 0 },
			stats: { active_seconds: 1.5, duration_seconds: 12.25 },
		},
		{
			usage: { inputTokens: 120, outputTokens: 80, cacheReadInputTokens: 40, cacheCreationInputTokens: 0 },
			stats: { activeSeconds: 1.5, durationSeconds: 12.25 },
		},
	])("公开 getSession.attributes 提取累计数值、保持秒单位与零，丢弃未知字段 %#", async (metrics) => {
		setDefaultFetch(async () =>
			Response.json({
				id: "session",
				status: "idle",
				...metrics,
				stop_reason: { type: "requires_action", pending_batch_id: "private-batch" },
				environment_variables: { secret: "sk-usage-unit-test" },
			}),
		);
		expect(await gateway().getSession("session")).toEqual({
			session_id: "session",
			status: "idle",
			usage: { input_tokens: 120, output_tokens: 80, cache_read_input_tokens: 40, cache_creation_input_tokens: 0 },
			stats: { active_seconds: 1.5, duration_seconds: 12.25 },
			stop_reason: { type: "requires_action" },
		});
	});

	it("缺失用量不补零；部分指标保留已知值，snake_case 的零优先于别名", async () => {
		setDefaultFetch(async () => Response.json({ id: "session", status: "idle" }));
		expect(await gateway().getSession("session")).toEqual({ session_id: "session", status: "idle" });
		setDefaultFetch(async () =>
			Response.json({ id: "session", status: "idle", usage: { input_tokens: 0, inputTokens: 100 } }),
		);
		expect((await gateway().getSession("session"))?.usage).toEqual({ input_tokens: 0 });
	});

	it.each(["12", -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("畸形计数 %s 明确失败而不生成可删除快照", (value) => {
		expect(() => sessionUsageFromAttributes({ usage: { input_tokens: value, output_tokens: 10 } })).toThrow(
			"会话用量数据无效，请稍后重试",
		);
	});

	it("只有真实 404 作为会话不存在，鉴权/限流/服务异常不吞错且不泄露响应正文", async () => {
		setDefaultFetch(async () => Response.json({ message: "sk-usage-unit-test" }, { status: 404 }));
		expect(await gateway().getSession("session")).toBeNull();
		for (const status of [401, 403, 429, 500]) {
			setDefaultFetch(async () => Response.json({ message: "sk-usage-unit-test" }, { status }));
			await expect(gateway().getSession("session")).rejects.toMatchObject({
				code: "provider_error",
				message: "获取会话详情失败，请稍后重试",
			});
		}
	});
});

describe("MockGateway 累计用量与停止合同", () => {
	it("从零开始，多轮累计、重复读取稳定，待审批与中断后状态分开", async () => {
		vi.useFakeTimers();
		const mock = createMockGateway();
		const { session_id: id } = await mock.createSession({ agentId: "agent" });
		expect((await mock.getSession(id))?.usage?.input_tokens).toBe(0);
		await mock.sendMessage(id, { text: "first" });
		await vi.runAllTimersAsync();
		const first = await mock.getSession(id);
		expect(first).toMatchObject({
			status: "idle",
			usage: { input_tokens: 120, output_tokens: 80 },
			stats: { active_seconds: 2, duration_seconds: 3 },
		});
		expect(await mock.getSession(id)).toEqual(first);
		await mock.sendMessage(id, { text: "approval" });
		expect(await mock.getSession(id)).toMatchObject({
			status: "idle",
			stop_reason: { type: "requires_action" },
			usage: { input_tokens: 240, output_tokens: 160 },
		});
		await mock.interrupt(id);
		expect(await mock.getSession(id)).toMatchObject({ status: "idle", stop_reason: { type: "interrupted" } });
	});

	it("中断已完成后，不再有等待中的工具/文件生成写入历史", async () => {
		vi.useFakeTimers();
		const mock = createMockGateway();
		const { session_id: id } = await mock.createSession({ agentId: "agent" });
		await mock.sendMessage(id, { text: "artifact" });
		await vi.advanceTimersByTimeAsync(165);
		await mock.interrupt(id);
		const stopped = await mock.listEvents(id);
		await vi.runAllTimersAsync();
		expect(await mock.listEvents(id)).toEqual(stopped);
	});
});

describe("MockGateway 用量趋势合同", () => {
	const day = (start: string, end: string): UsageTrendRequest["time_range"] => ({ start_time: start, end_time: end });

	it("内存来源按 UTC+8 天分桶：缺省粒度 day，窗口内单点携带演示指标，无匹配智能体与窗口外省略", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-11-17T10:30:00+08:00"));
		const mock = createMockGateway();
		const { session_id: id } = await mock.createSession({ agentId: "agent_mock_assistant" });
		await mock.sendMessage(id, { text: "first" });
		await vi.runAllTimersAsync();
		const trend = await mock.getUsageTrend({
			dimension: "workspace",
			time_range: day("2026-11-17T00:00:00+08:00", "2026-11-18T00:00:00+08:00"),
		});
		expect(trend.data.granularity).toBe("day");
		expect(trend.data.query_range).toEqual(day("2026-11-17T00:00:00+08:00", "2026-11-18T00:00:00+08:00"));
		expect(trend.data.has_more).toBe(false);
		expect(trend.data.next_page_token).toBeNull();
		expect(trend.data.points).toHaveLength(1);
		expect(trend.data.points[0]).toMatchObject({
			start_time: "2026-11-17T00:00:00+08:00",
			end_time: "2026-11-18T00:00:00+08:00",
			usage: {
				total: {
					input_tokens: { value: 120, unit: "tokens" },
					total_tokens: { value: 200, unit: "tokens" },
					model_call_count: { value: 1, unit: "count" },
				},
			},
		});
		const otherAgent = await mock.getUsageTrend({
			dimension: "agent",
			agent_id: "agent_designer",
			time_range: day("2026-11-17T00:00:00+08:00", "2026-11-18T00:00:00+08:00"),
		});
		expect(otherAgent.data.points).toEqual([]);
		expect(otherAgent.data.data_updated_at).toBeNull();
		const outside = await mock.getUsageTrend({
			dimension: "workspace",
			time_range: day("2026-11-01T00:00:00+08:00", "2026-11-02T00:00:00+08:00"),
		});
		expect(outside.data.points).toEqual([]);
	});

	it("账本来源按 UTC 小时行重分桶到 UTC+8 天桶，agent 维度按 remote_agent_id 过滤", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-11-17T12:00:00+08:00"));
		const mock = createMockGateway({
			telemetry: {
				byAgent: async () => new Map(),
				bySession: async () => null,
				byAgentHour: async () => [
					{
						agent_key: "agent-a",
						hour: "2026-11-16T17",
						sessions: 1,
						input_tokens: 10,
						output_tokens: 5,
						cache_read_tokens: 0,
						cache_creation_tokens: 0,
					},
				],
			},
		});
		const trend = await mock.getUsageTrend({
			dimension: "workspace",
			time_range: day("2026-11-17T00:00:00+08:00", "2026-11-18T00:00:00+08:00"),
		});
		expect(trend.data.points).toHaveLength(1);
		expect(trend.data.points[0]).toMatchObject({
			start_time: "2026-11-17T00:00:00+08:00",
			usage: {
				total: {
					input_tokens: { value: 10, unit: "tokens" },
					model_call_count: { value: 1, unit: "count" },
				},
			},
		});
		const filtered = await mock.getUsageTrend({
			dimension: "agent",
			agent_id: "agent-b",
			time_range: day("2026-11-17T00:00:00+08:00", "2026-11-18T00:00:00+08:00"),
		});
		expect(filtered.data.points).toEqual([]);
	});
});
