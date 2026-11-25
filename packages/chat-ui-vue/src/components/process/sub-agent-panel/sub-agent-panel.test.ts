import type { ChatMultiAgent } from "@openagentkit/sdk/chat";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { SubAgentPanel } from "./index.ts";

type Thread = ChatMultiAgent["threads"][number];

function thread(overrides: Partial<Thread> = {}): Thread {
	return {
		id: "sthr_a",
		name: "research",
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

describe("SubAgentPanel（Vue）", () => {
	it("按展示名分组并显示派发次数、任务和耗时", () => {
		const wrapper = mount(SubAgentPanel, {
			props: {
				multiAgent: multiAgent([
					thread({ id: "1", task: "补充价格对比", createdAt: "2026-11-02T00:00:00Z", endedAt: "2026-11-02T00:00:48Z" }),
					thread({ id: "2", name: "slide-maker", task: "生成初稿" }),
					thread({ id: "3", task: "调研基准变化", createdAt: "2026-11-01T00:00:00Z" }),
				]),
			},
		});
		expect(wrapper.text()).toContain("子 Agent");
		expect(wrapper.text()).toContain("· 2");
		expect(wrapper.text()).toContain("research");
		expect(wrapper.text()).toContain("2 次");
		expect(wrapper.text()).toContain("48s");
	});

	it("无线程时不渲染", () => {
		const wrapper = mount(SubAgentPanel, { props: { multiAgent: multiAgent([]) } });
		expect(wrapper.html()).toBe("");
	});
});
