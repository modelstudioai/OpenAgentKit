import { expect, test } from "./fixtures.ts";
import { sitePath } from "./paths.ts";

test("组件旧文档地址跳转到当前页面", async ({ page, baseURL }) => {
	const routes = [
		["/docs/components/express/sender/", "/docs/components/chat/sender/"],
		["/docs/components/message/", "/docs/components/general/message/"],
		["/docs/components/plaza/", "/docs/components/#广场与用量"],
	] as const;

	for (const [from, to] of routes) {
		await page.goto(sitePath(from));
		await expect(page).toHaveURL(new URL(sitePath(to), baseURL).href);
	}
	await expect(page.locator('h2[id="广场与用量"]')).toBeVisible();
});
