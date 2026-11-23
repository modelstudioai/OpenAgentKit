import { expect, test } from "./fixtures.ts";
import { seedListedAgent } from "./helpers.ts";

test("Vue 消息锚点：两条用户消息后出现右缘锚点栏", async ({ page, request }) => {
	await seedListedAgent(request);
	await page.goto("/?agent=e2e-agent");
	await page.getByLabel("消息输入").fill("第一条消息");
	await page.getByRole("button", { name: "发送", exact: true }).click();
	await expect(page.getByText(/mock gateway 的流式回答/).first()).toBeVisible({ timeout: 15_000 });
	await page.getByLabel("消息输入").fill("第二条消息");
	await page.getByRole("button", { name: "发送", exact: true }).click();
	await expect(page.getByText(/mock gateway 的流式回答/).nth(1)).toBeVisible({ timeout: 15_000 });
	const rail = page.getByRole("navigation", { name: "会话锚点", exact: true });
	await expect(rail).toBeVisible();
	await page.screenshot({ path: "/Users/admin/github/OpenAgentPack-Kit/.scratch/anchor-vue.png" });
});
