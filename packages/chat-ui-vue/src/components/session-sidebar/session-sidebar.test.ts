// @vitest-environment jsdom
import type { SessionSummary } from "@openagentkit/sdk/protocol";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { SessionSidebar } from "./index.ts";

const session: SessionSummary = {
	session_id: "s1",
	agent_slug: "writer",
	title: "季度复盘",
	created_at: "2026-11-20T00:00:00Z",
	status: "idle",
};

describe("SessionSidebar（Vue）", () => {
	it("渲染智能体分组与最近会话，并回传来源分区", async () => {
		const wrapper = mount(SessionSidebar, {
			props: {
				groups: [{ id: "writer", name: "写作者", sessions: [session], initialized: true, hasMore: false }],
				recent: { sessions: [session], initialized: true, hasMore: false },
				activeId: null,
				searchInput: "",
			},
		});
		expect(wrapper.text()).toContain("写作者");
		const row = wrapper.findAll("button").find((button) => button.text() === "季度复盘");
		await row?.trigger("click");
		expect(wrapper.emitted("select")?.[0]?.[1]).toBe("groups");
	});

	it("搜索过滤已加载会话", async () => {
		const wrapper = mount(SessionSidebar, {
			props: {
				groups: [{ id: "writer", name: "写作者", sessions: [session], initialized: true, hasMore: false }],
				recent: { sessions: [session], initialized: true, hasMore: false },
				activeId: null,
				searchInput: "不存在",
			},
		});
		expect(wrapper.findAll("button").some((button) => button.text() === "季度复盘")).toBe(false);
	});
});
