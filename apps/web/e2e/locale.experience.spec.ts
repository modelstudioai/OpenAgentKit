import { expect, test } from "./fixtures.ts";
import { openSessionList, seedListedAgent } from "./helpers.ts";

/**
 * i18n 冒烟（方案 §9.3）：?lang=en 直达渲染英文外壳，切换器写回 localStorage 并跨刷新保持。
 * 只断言稳定控件（语言组、搜索框、导航按钮、<html lang>），不依赖种子 Agent。
 */
test("?lang=en 直达渲染英文界面", async ({ page }) => {
	await page.goto("/?view=plaza&lang=en");
	await expect(page.locator("html")).toHaveAttribute("lang", "en");
	await expect(page.getByRole("searchbox", { name: "Search agents" })).toBeVisible();
	await openSessionList(page);
	await page.getByRole("button", { name: /^(Account|账号)/ }).click();
	await expect(page.getByRole("group", { name: "Interface language" })).toBeVisible();
	await expect(page.getByRole("button", { name: "New chat", exact: true })).toBeVisible();
});

test("语言切换写回本地存储并跨刷新保持", async ({ page }) => {
	await page.goto("/?view=plaza&lang=en");
	await expect(page.locator("html")).toHaveAttribute("lang", "en");
	await openSessionList(page);
	await page.getByRole("button", { name: /^(Account|账号)/ }).click();
	await page.getByRole("group", { name: "Interface language" }).getByRole("button", { name: "中文" }).click();
	await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
	// 用户显式选择优先于 URL：带 ?lang=en 重载仍保持中文。
	await page.goto("/?view=plaza&lang=en");
	await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
	await expect(page.getByRole("searchbox", { name: "搜索 Agent" })).toBeVisible();
});

test("插值文本按纯文本渲染，不出现 HTML 实体", async ({ page, request }) => {
	const slug = `locale-escape-${Date.now().toString(36)}`;
	const displayName = `R&D <Ops> ${slug}`;
	await seedListedAgent(request, slug, displayName);
	await page.goto(`/?agent=${slug}&lang=en`);
	await expect(page.getByText(`Chat with ${displayName}`, { exact: true })).toBeVisible();
});
