import { expect, test } from "./fixtures.ts";
import { previewFrame, sitePath } from "./paths.ts";

test("首页功能卡保留站点路径并打开组件总览", async ({ page }) => {
	await page.goto(sitePath("/"));
	await page.getByRole("link", { name: /^headless hooks \+ copy-in 组件/ }).click();
	await expect(page).toHaveURL(sitePath("/docs/components/"));
	await expect(page.getByRole("heading", { level: 1, name: "组件总览", exact: true })).toBeVisible();
});

// 搜索仍能从站点打开；预览内的快捷键不能劫持焦点、导航或共享主题。
test("站点搜索可用，预览内搜索快捷键保留草稿与页面", async ({ page }) => {
	await page.goto(sitePath("/docs/"));
	await page.getByRole("button", { name: /^搜索/ }).click();
	await page.getByRole("combobox", { name: "搜索文档、组件与接口", exact: true }).fill("Layout");
	await page
		.getByRole("option", { name: /Layout 整页布局/ })
		.first()
		.click();
	await expect(page).toHaveURL(/\/docs\/components\/layout\/$/);
	await expect(page.getByRole("heading", { level: 1, name: "Layout 整页布局", exact: true })).toBeVisible();
	await page.keyboard.press("Control+k");
	await expect(page.getByRole("combobox", { name: "搜索文档、组件与接口", exact: true })).toBeVisible();
	await page.keyboard.press("Escape");

	await page.goto(sitePath("/"));
	const frame = page.locator(".kit-showcase").frameLocator("iframe");
	const input = frame.getByLabel("消息输入", { exact: true });
	await input.fill("预览草稿");
	for (const shortcut of ["Control+k", "Meta+k"]) {
		await input.press(shortcut);
		await page.keyboard.insertText("保留");
		await expect(input).toHaveText(/保留$/);
		await expect(frame.getByRole("dialog")).toHaveCount(0);
		await expect(frame.locator("iframe")).toHaveCount(0);
		await expect(input).toBeFocused();
		await input.fill("预览草稿");
	}
	await expect(page.locator(".kit-showcase")).toBeVisible();
	expect(await frame.locator("html").evaluate(() => location.pathname.endsWith("/previews/chat/"))).toBe(true);
	await expect(page.locator("html")).toHaveClass(/dark/);
	expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("dark");
});

// 父页面按路由固定主题，iframe 的键盘操作不得改写共享主题。
test("首页与文档预览跟随路由主题，设备切换不重置草稿", async ({ page }) => {
	await page.goto(sitePath("/"));
	const hero = page.locator(".kit-showcase");
	const frame = hero.frameLocator("iframe");
	const input = frame.getByLabel("消息输入", { exact: true });
	await expect(page.locator("html")).toHaveClass(/dark/);
	await expect(frame.locator("html")).toHaveAttribute("data-kit-theme", "dark");
	await input.fill("首页预览草稿");
	await hero.getByRole("button", { name: "手机", exact: true }).click();
	await expect(input).toHaveText("首页预览草稿");
	await frame.getByRole("button", { name: "发送", exact: true }).focus();
	await page.keyboard.press("d");
	await expect(page.locator("html")).toHaveClass(/dark/);
	expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("dark");
	await page.goto(sitePath("/docs/components/chat/"));
	await expect(page.locator("html")).toHaveClass(/light/);
	const chat = page.frameLocator(previewFrame("chat"));
	await expect(chat.locator("html")).toHaveAttribute("data-kit-theme", "light");
	await chat.getByLabel("消息输入", { exact: true }).fill("文档预览草稿");
	await chat.getByRole("button", { name: "发送", exact: true }).focus();
	await page.keyboard.press("d");
	expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("light");
	await expect(page.locator("html")).toHaveClass(/light/);
});

// 附件未就绪时阻塞发送，上传完成后恢复；生成中必须能停止。
test("Sender 附件预览阻塞发送，生成中可停止", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(sitePath("/previews/sender-attachments/"));
	const input = page.getByRole("textbox", { name: "消息输入", exact: true });
	const attachment = page.getByRole("button", { name: "附件", exact: true });
	await expect(attachment).toBeVisible();
	await input.fill("草稿保持");
	await page
		.locator('input[type="file"]')
		.setInputFiles({ name: "preview.txt", mimeType: "text/plain", buffer: Buffer.from("local preview") });
	const send = page.getByRole("button", { name: "发送", exact: true });
	await expect(send).toBeDisabled();
	await expect(send).toBeEnabled();
	await send.click();
	await expect(page.getByText("onSubmit → 草稿保持（1 个附件）", { exact: true })).toBeVisible();
	await expect(input).toHaveText("");

	await page.goto(sitePath("/previews/sender/"));
	await page.getByLabel("生成中", { exact: true }).check();
	await page.getByRole("button", { name: "停止", exact: true }).click();
	await expect(page.getByText(/^onCancel/)).toBeVisible();
	await expect(page.getByLabel("生成中", { exact: true })).not.toBeChecked();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("紧凑页头预览可切换 Agent 并展示页头操作", async ({ page }) => {
	await page.goto(sitePath("/previews/agent-header/"));
	await expect(page.getByLabel("紧凑页头", { exact: true })).toBeChecked();
	await page.getByLabel("切换 Agent", { exact: true }).selectOption("writing-agent");
	await expect(page.getByText("已切换 Agent：写作助手", { exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "新会话", exact: true })).toBeVisible();
	await page.getByRole("button", { name: "菜单", exact: true }).click();
	await expect(page.getByText("已触发侧栏开关", { exact: true })).toBeVisible();
});
