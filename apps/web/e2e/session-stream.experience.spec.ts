import { expect, test } from "./fixtures.ts";
import { seedListedAgent } from "./helpers.ts";

test("独立历史和实时订阅支持首条发送、停止和重开会话", async ({ page, request }, testInfo) => {
	const slug = `split-stream-${testInfo.project.name}-${Date.now()}`;
	await seedListedAgent(request, slug, slug);
	await page.goto(`/?agent=${slug}`);
	const input = page.getByLabel("消息输入", { exact: true });
	const composer = page.locator("form").filter({ has: input });
	const send = composer.getByRole("button", { name: "发送", exact: true });
	const stop = composer.getByRole("button", { name: "停止", exact: true });
	const historyResponse = () =>
		page.waitForResponse((response) => /\/api\/kit\/sessions\/[^/]+\/events$/.test(new URL(response.url()).pathname));
	const firstHistory = historyResponse();
	const stream = page.waitForResponse((response) =>
		/\/api\/kit\/sessions\/[^/]+\/stream$/.test(new URL(response.url()).pathname),
	);
	const text = "approval：查看待审批操作";
	await input.fill(text);
	await send.click();
	expect((await firstHistory).ok()).toBe(true);
	expect((await stream).headers()["content-type"]).toContain("text/event-stream");
	await expect(page.getByRole("region", { name: "工具审批 read_file", exact: true })).toBeVisible();

	const interrupted = page.waitForResponse((response) => response.url().endsWith("/interrupt"));
	await stop.click();
	expect((await interrupted).ok()).toBe(true);
	await expect(stop).toHaveCount(0);

	const history = historyResponse();
	await page.reload();
	expect((await history).ok()).toBe(true);
	const messages = page.getByRole("region", { name: "消息列表", exact: true });
	await expect(messages.getByText(text, { exact: true })).toHaveCount(1);
});
