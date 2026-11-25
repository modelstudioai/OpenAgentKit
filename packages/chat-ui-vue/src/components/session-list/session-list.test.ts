// @vitest-environment jsdom
import type { SessionSummary } from "@openagentkit/sdk/protocol";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { filterSessions, SessionList } from "./index.ts";

const sessions: SessionSummary[] = [
	{ session_id: "s1", agent_slug: "writer", title: "季度复盘", created_at: "2026-11-20T00:00:00Z", status: "running" },
	{ session_id: "s2", agent_slug: "reviewer", title: "代码评审", created_at: "2026-11-20T00:00:00Z", status: "idle" },
];

describe("SessionList（Vue）", () => {
	it("按标题过滤", () => {
		expect(filterSessions(sessions, "复盘").map((session) => session.session_id)).toEqual(["s1"]);
		expect(filterSessions(sessions, "")).toHaveLength(2);
	});

	it("点击行回传会话摘要", async () => {
		const wrapper = mount(SessionList, { props: { sessions, activeId: "s1" } });
		await wrapper.findAll("button").at(1)?.trigger("click");
		expect(wrapper.emitted("select")?.[0]?.[0]).toMatchObject({ session_id: "s2" });
	});

	it("编辑态提交重命名", async () => {
		const wrapper = mount(SessionList, { props: { sessions, activeId: null, editingId: "s1" } });
		const input = wrapper.get("input");
		await input.setValue("新的标题");
		await input.trigger("keydown", { key: "Enter" });
		expect(wrapper.emitted("edited")?.[0]).toEqual(["s1", "新的标题"]);
	});
});
