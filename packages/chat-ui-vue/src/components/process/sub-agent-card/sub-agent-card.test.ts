import type { ChatMultiAgent } from "@openagentkit/sdk/chat";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { SubAgentCard } from "./index.ts";

type Thread = ChatMultiAgent["threads"][number];

function multiAgent(threads: Thread[]): ChatMultiAgent {
	return {
		selectedThreadId: null,
		threads,
		loading: false,
		error: null,
		selectThread: () => undefined,
		refreshThreads: async () => undefined,
		loadThreadEvents: async () => undefined,
	};
}

function thread(overrides: Partial<Thread> = {}): Thread {
	return {
		id: "sthr_a",
		name: "研究员",
		status: "idle",
		messages: [],
		loading: false,
		error: null,
		nextPageToken: null,
		historyAvailable: true,
		loaded: true,
		...overrides,
	};
}

describe("SubAgentCard（Vue）", () => {
	it("运行中展开并显示任务与状态", () => {
		const wrapper = mount(SubAgentCard, {
			props: { threadId: "sthr_a", multiAgent: multiAgent([thread({ status: "running", task: "调研协作要点" })]) },
		});
		expect(wrapper.get("details").attributes()).toHaveProperty("open");
		expect(wrapper.text()).toContain("子 Agent");
		expect(wrapper.text()).toContain("正在执行");
		expect(wrapper.text()).toContain("主 Agent 指令");
	});

	it("完成后显示耗时并允许展开查看时间线", () => {
		const wrapper = mount(SubAgentCard, {
			props: {
				threadId: "sthr_a",
				multiAgent: multiAgent([
					thread({
						createdAt: "2026-11-01T00:00:00Z",
						endedAt: "2026-11-01T00:00:40Z",
						messages: [{ id: "m1", role: "assistant", status: "done", parts: [{ type: "text", text: "**结论**" }] }],
					}),
				]),
			},
		});
		expect(wrapper.text()).toContain("已完成 · 40s");
		expect(wrapper.find("details").attributes("open")).toBeUndefined();
		expect(wrapper.get("strong").text()).toBe("结论");
	});
});
