import { expect, test } from "./fixtures.ts";
import { seedListedAgent } from "./helpers.ts";

const json = { "content-type": "application/json", "x-kit-protocol-version": "2.0.0" };

/**
 * 会话搜索必须覆盖「还没加载进侧栏」的历史会话：目录每页只取 10 条且分组按需展开，
 * 只在已加载行里做本地过滤的话，超过这一窗口的会话永远搜不到。这里用真实数据把目标会话挤出窗口。
 * 建会话必须走 page.request：匿名模式下访客身份来自浏览器 cookie，独立的 request 夹具是另一个 subject。
 */
test("会话搜索命中未加载进侧栏的历史会话", async ({ page, request, baseURL }, info) => {
	await seedListedAgent(request);
	const webUrl = `${String(info.project.metadata.webUrl)}/?api=${encodeURIComponent(baseURL as string)}`;
	await page.goto(webUrl);

	const suffix = Date.now().toString(36);
	const target = `最早会话-${suffix}`;
	const create = async (title: string) => {
		const created = await page.request.post("/api/kit/sessions", {
			headers: json,
			data: { agent_slug: "e2e-agent", title },
		});
		expect(created.ok()).toBe(true);
	};
	await create(target);
	// 目录首页 10 条：再塞 12 条更晚创建的会话，把目标挤出已加载窗口。
	for (let index = 0; index < 12; index += 1) await create(`占位会话-${suffix}-${index}`);

	await page.goto(webUrl);
	await page.getByTestId("sidebar-search").fill(target);

	const results = page.getByTestId("session-search-results");
	await expect(results).toBeVisible();
	await expect(results).toContainText(target);
	await expect(results.getByText("全部会话", { exact: true })).toBeVisible();
	await expect(page.getByTestId("search-agent-e2e-agent")).toBeVisible();
});
