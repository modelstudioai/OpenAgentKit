// @vitest-environment jsdom
import type { SessionSummary } from "@openagentkit/sdk/protocol";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { SessionSidebar, type SessionSidebarPage } from "./index.ts";

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

	it("未注入检索页时搜索只过滤已加载行，不出检索容器", async () => {
		const wrapper = mount(SessionSidebar, {
			props: {
				groups: [{ id: "writer", name: "写作者", sessions: [session], initialized: true, hasMore: false }],
				recent: { sessions: [session], initialized: true, hasMore: false },
				activeId: null,
				searchInput: "不存在",
			},
		});
		expect(wrapper.findAll("button").some((button) => button.text() === "季度复盘")).toBe(false);
		expect(wrapper.find('[data-testid="session-search-results"]').exists()).toBe(false);
	});

	it("注入检索页后以结果替换目录正文，并按 agent 分组", async () => {
		const wrapper = mount(SessionSidebar, {
			props: {
				groups: [{ id: "writer", name: "写作者", sessions: [session], initialized: true, hasMore: false }],
				recent: { sessions: [session], initialized: true, hasMore: false },
				activeId: null,
				searchInput: "季度",
				search: searchPage(),
			},
		});
		const results = wrapper.find('[data-testid="session-search-results"]');
		expect(results.exists()).toBe(true);
		expect(results.text()).toContain("全部会话");
		expect(results.text()).toContain("季度复盘");
		expect(wrapper.find('[data-testid="search-agent-writer"]').exists()).toBe(true);
		// 目录正文让位：检索态不叠加「最近」分区，避免同一批会话出现两份。
		expect(results.text()).not.toContain("还没有会话记录");
	});

	it("检索结果行点击按 groups 分区回传，分组头可折叠", async () => {
		const wrapper = mount(SessionSidebar, {
			props: {
				groups: [],
				recent: { sessions: [] },
				activeId: null,
				searchInput: "季度",
				search: searchPage(),
			},
		});
		const row = wrapper.findAll("button").find((button) => button.text() === "季度复盘");
		await row?.trigger("click");
		expect(wrapper.emitted("select")?.[0]?.[1]).toBe("groups");

		// 收起是把 body 置为 grid-rows-[0px] + inert，行仍在 DOM 里，所以断言展开态而不是存在性。
		const toggle = wrapper.get('button[aria-expanded="true"]:has([data-testid="search-agent-writer"])');
		await toggle.trigger("click");
		expect(toggle.attributes("aria-expanded")).toBe("false");
	});

	it("检索的加载更多、加载态、空态与错误态各自可达", async () => {
		const withProps = (search: SessionSidebarPage) => ({
			groups: [],
			recent: { sessions: [] },
			activeId: null,
			searchInput: "季度",
			search,
		});
		const more = mount(SessionSidebar, { props: withProps(searchPage({ hasMore: true })) });
		expect(more.find('[data-testid="session-search-results-load-more"]').exists()).toBe(true);
		await more.get('[data-testid="session-search-results-load-more"]').trigger("click");
		expect(more.emitted("load-more")).toBeUndefined();

		const loading = mount(SessionSidebar, { props: withProps(searchPage({ loading: true })) });
		expect(loading.text()).toContain("正在加载会话…");

		const empty = mount(SessionSidebar, { props: withProps(searchPage({ sessions: [] })) });
		expect(empty.text()).toContain("没有匹配的会话");

		const failed = mount(SessionSidebar, { props: withProps(searchPage({ error: "搜索会话失败，请重试。" })) });
		expect(failed.text()).toContain("搜索会话失败，请重试。");
		expect(failed.text()).not.toContain("没有匹配的会话");
	});
});

function searchPage(overrides: Partial<SessionSidebarPage> = {}): SessionSidebarPage {
	return {
		sessions: [session],
		loading: false,
		loadingMore: false,
		hasMore: false,
		error: null,
		onLoadMore: () => undefined,
		onRetry: () => undefined,
		...overrides,
	};
}
