import { expect, test } from "./fixtures.ts";
import { openSessionList, seedListedAgent } from "./helpers.ts";

test.beforeEach(async ({ request, page }) => {
	await page.addInitScript(() => localStorage.setItem("kit.locale", "zh-CN"));
	await seedListedAgent(request);
});

test("会话生命周期：建会话请求在途时离开聊天会取消发送", async ({ page }) => {
	const release = Promise.withResolvers<void>();
	await page.route("**/api/kit/sessions", async (route) => {
		if (route.request().method() !== "POST") return route.fallback();
		await release.promise;
		await route.continue();
	});
	await page.goto("/?agent=e2e-agent");
	await page.getByLabel("消息输入").fill("离开聊天前的消息");
	try {
		const [creating] = await Promise.all([
			page.waitForRequest(
				(request) => new URL(request.url()).pathname === "/api/kit/sessions" && request.method() === "POST",
			),
			page.getByRole("button", { name: "发送", exact: true }).click(),
		]);
		await openSessionList(page);
		const [cancelled] = await Promise.all([
			page.waitForEvent("requestfailed", { predicate: (request) => request === creating, timeout: 5000 }),
			page.getByTestId("sidebar-nav-plaza").click(),
		]);
		expect(cancelled.failure()?.errorText).toBe("net::ERR_ABORTED");
	} finally {
		release.resolve();
	}
	await expect(page.getByRole("heading", { name: "Agent 广场", exact: true })).toBeVisible();
	await expect(page).not.toHaveURL(/agent=|session=/);
});

test("会话生命周期：首次发送被拒后保留草稿，并在原会话重试", async ({ page }) => {
	const draft = "首次发送需要重试的草稿";
	await page.route(
		"**/api/kit/sessions/*/messages",
		(route) => route.fulfill({ status: 409, json: { error: { code: "conflict", message: "首次发送被拒" } } }),
		{ times: 1 },
	);
	await page.goto("/?agent=e2e-agent");
	const input = page.getByLabel("消息输入");
	const send = page.getByRole("button", { name: "发送", exact: true });
	await input.fill(draft);
	await send.click();
	await expect(page).toHaveURL(/session=/);
	await expect(page.getByRole("alert")).toContainText("首次发送被拒");
	await expect(input).toHaveText(draft);
	const session = new URL(page.url()).searchParams.get("session");
	const [accepted] = await Promise.all([
		page.waitForResponse((response) => new URL(response.url()).pathname === `/api/kit/sessions/${session}/messages`),
		send.click(),
	]);
	expect(accepted.ok()).toBe(true);
	expect(accepted.request().postDataJSON()).toMatchObject({ text: draft });
	await expect(input).toBeEmpty();
	expect(new URL(page.url()).searchParams.get("session")).toBe(session);
});

test("会话生命周期：离开聊天后，侧栏收敛后台回合的生成状态", async ({ page }) => {
	const draft = "multi-agent 后台回合状态";
	await page.goto("/?agent=e2e-agent");
	await page.getByLabel("消息输入").fill(draft);
	const [runningIndex] = await Promise.all([
		page.waitForResponse((response) => {
			const url = new URL(response.url());
			return url.pathname === "/api/kit/sessions" && url.searchParams.get("limit") === "200";
		}),
		page.getByRole("button", { name: "发送", exact: true }).click(),
	]);
	await expect(page).toHaveURL(/session=/);
	const session = new URL(page.url()).searchParams.get("session");
	expect((await runningIndex.json()).data).toEqual(
		expect.arrayContaining([expect.objectContaining({ session_id: session, status: "running" })]),
	);
	await openSessionList(page);
	await page.getByTestId("sidebar-nav-plaza").click();
	await expect(page.getByRole("heading", { name: "Agent 广场", exact: true })).toBeVisible();
	await openSessionList(page);
	const recent = page.getByRole("navigation", { name: "最近会话", exact: true });
	const running = recent.getByRole("img", { name: "生成中", exact: true });
	await expect(running).toBeVisible();
	await expect(running).toHaveCount(0);
	await expect(recent.getByRole("button", { name: draft, exact: true })).toBeVisible();
});
