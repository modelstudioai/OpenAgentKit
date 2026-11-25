import { expect, test } from "./fixtures.ts";
import { seedListedAgent } from "./helpers.ts";

/**
 * 面板的产物清单有两个来源：SSE 事件投影，以及 Provider Files 的 session 目录。
 * 真实 MA 里沙箱产出的文件只进后者、不进事件流，所以「不切会话、不重载页面也能看到新生成的文件」
 * 只能靠主动补取。这里把 Files-only 的产物延迟出现，验证两端都会自己把它并入面板。
 */
test("只在 Files 目录出现的产物无需刷新即进入面板", async ({ page, request, baseURL }, info) => {
	await seedListedAgent(request);
	let calls = 0;
	await page.route(
		(url) => /\/api\/kit\/sessions\/[^/]+\/artifacts$/.test(url.pathname),
		(route) => {
			calls += 1;
			// 前两次（进会话 + 首轮收尾）都没有产物，第三次起才“出现”文件。
			if (calls <= 2) return route.fulfill({ json: { data: [] } });
			return route.fulfill({
				json: {
					data: [{ file_id: "file_late_pdf", filename: "迟到产物.pdf", content_type: "application/pdf", size: 1024 }],
				},
			});
		},
	);
	await page.goto(
		`${String(info.project.metadata.webUrl)}/?api=${encodeURIComponent(baseURL as string)}&agent=e2e-agent`,
	);
	// 面板分区没有 testid，用两端同名的 group/artifacts 容器锚定，避免命中消息流里的产物卡片。
	const artifacts = page.locator("xpath=//details[contains(@class, 'group/artifacts')]");
	const late = artifacts.getByText("迟到产物.pdf", { exact: true });

	await page.getByLabel("消息输入").fill("第一轮不产出文件");
	await page.getByRole("button", { name: "发送", exact: true }).click();
	await expect(page.getByText(/mock gateway 的流式回答/).first()).toBeVisible({ timeout: 15_000 });
	await expect(page.getByText("空闲", { exact: true })).toBeVisible({ timeout: 15_000 });
	await expect(late).toHaveCount(0);

	// 再走一轮：收尾补取到新的清单，新产物必须自己出现在面板里，页面不重载。
	await page.getByLabel("消息输入").fill("第二轮之后文件才可见");
	await page.getByRole("button", { name: "发送", exact: true }).click();
	await expect(late).toBeVisible({ timeout: 15_000 });
	// 行尾下载按钮同批出现，说明它是可用的产物行，不只是文本渲染出来了。
	await expect(artifacts.getByRole("button", { name: "下载 迟到产物.pdf", exact: true })).toBeVisible();
});

/**
 * 回合未结束也要实时更新：把会话停在「等待工具审批」——这是能稳定保持执行态的真实状态，
 * 不依赖拉长 mock 流或挂起 SSE。清单接口必须继续被补取，新产物在用户处理审批之前就出现在面板里。
 */
test("回合未结束（等待工具审批）时产物清单继续补取并进入面板", async ({ page, request, baseURL }, info) => {
	await seedListedAgent(request);
	let calls = 0;
	await page.route(
		(url) => /\/api\/kit\/sessions\/[^/]+\/artifacts$/.test(url.pathname),
		(route) => {
			calls += 1;
			if (calls <= 1) return route.fulfill({ json: { data: [] } });
			return route.fulfill({
				json: {
					data: [{ file_id: "file_late_pdf", filename: "迟到产物.pdf", content_type: "application/pdf", size: 1024 }],
				},
			});
		},
	);
	await page.goto(
		`${String(info.project.metadata.webUrl)}/?api=${encodeURIComponent(baseURL as string)}&agent=e2e-agent`,
	);

	await page.getByLabel("消息输入").fill("approval artifact");
	await page.getByRole("button", { name: "发送", exact: true }).click();
	// 停在待审批态：回合尚未结束，页面也不会出现「空闲」。
	await expect(page.getByRole("region", { name: "工具审批 read_file", exact: true })).toBeVisible({ timeout: 15_000 });
	await expect(page.getByText("空闲", { exact: true })).toHaveCount(0);

	const artifacts = page.locator("xpath=//details[contains(@class, 'group/artifacts')]");
	await expect(artifacts.getByText("迟到产物.pdf", { exact: true })).toBeVisible({ timeout: 12_000 });
	expect(calls).toBeGreaterThan(1);
});
