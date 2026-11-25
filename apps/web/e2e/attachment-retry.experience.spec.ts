import type { Page, TestInfo } from "@playwright/test";
import { expect, test } from "./fixtures.ts";
import { seedListedAgent } from "./helpers.ts";

/**
 * 附件挂载与 409 重试的边界。真实 provider 会在文件扫描完成前拒绝挂载并返回可重试 conflict，
 * 由 SDK composer 退避重试（最多 3 次）；这条竞态在 mock 下不会自然发生，按仓内既有做法用 route 桩造。
 * 前端闸门是「扫描中禁止发送」，所以重试兜的是扫描刚翻牌、provider 侧仍未就绪的那段窗口。
 */

function openApp(page: Page, info: TestInfo, baseURL: string) {
	return page.goto(`${String(info.project.metadata.webUrl)}/?api=${encodeURIComponent(baseURL)}&agent=e2e-agent`);
}

async function attach(page: Page, name: string) {
	await page.getByRole("button", { name: "添加附件" }).click();
	const [chooser] = await Promise.all([
		page.waitForEvent("filechooser"),
		page.getByRole("menuitem", { name: "上传文件", exact: true }).click(),
	]);
	await chooser.setFiles({ name, mimeType: "text/plain", buffer: Buffer.from(`附件内容 ${name}`) });
	await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 });
}

test.beforeEach(async ({ request }) => {
	await seedListedAgent(request);
});

test("扫描期间禁用发送，就绪后附件随消息真实挂载", async ({ page, baseURL }, info) => {
	// 前两次状态查询回答「扫描中」，制造约 3s 的真实扫描窗口（客户端每 1.5s 轮询一次）。
	let checks = 0;
	await page.route(
		(url) => /^\/api\/kit\/files\/file_/.test(url.pathname),
		(route) => {
			checks += 1;
			const fileId = decodeURIComponent(new URL(route.request().url()).pathname.split("/").pop() ?? "");
			// 直接由桩翻牌，不用 route.fallback()：客户端会吞掉状态请求异常并继续轮询，
			// 兜底一旦失败就表现为「永远扫描中」，看不出真实原因。
			const ready = checks > 2;
			return route.fulfill({
				json: { data: { file_id: fileId, status: ready ? "available" : "checking", available: ready } },
			});
		},
	);
	await openApp(page, info, baseURL as string);

	const name = "scan-window.txt";
	await attach(page, name);
	// 先写好正文：空草稿本身就禁用发送，顺序反了这条断言测的就不是扫描闸门。
	await page.getByLabel("消息输入").fill("等扫描完成再发");
	const send = page.getByRole("button", { name: "发送", exact: true });
	await expect(send).toBeDisabled();
	await expect(send).toBeEnabled({ timeout: 20_000 });
	await send.click();
	await expect(page.getByText(/mock gateway 的流式回答/).first()).toBeVisible({ timeout: 15_000 });
	await expect(
		page.getByRole("region", { name: "消息列表", exact: true }).getByText(name, { exact: true }).first(),
	).toBeVisible();
});

test("带附件建会话遇到可重试冲突时自动重试，且只创建一个会话", async ({ page, baseURL }, info) => {
	let attempts = 0;
	await page.route(
		(url) => url.pathname.endsWith("/api/kit/sessions"),
		(route) => {
			if (route.request().method() !== "POST") return route.fallback();
			attempts += 1;
			if (attempts > 1) return route.fallback();
			return route.fulfill({
				status: 409,
				json: { error: { code: "conflict", message: "附件尚未就绪，请稍后重试", retryable: true } },
			});
		},
	);
	await openApp(page, info, baseURL as string);

	const name = "retry-once.txt";
	await attach(page, name);
	await page.getByLabel("消息输入").fill("第一次建会话被拒");
	await page.getByRole("button", { name: "发送", exact: true }).click();

	await expect(page.getByText(/mock gateway 的流式回答/).first()).toBeVisible({ timeout: 20_000 });
	await expect(
		page.getByRole("region", { name: "消息列表", exact: true }).getByText(name, { exact: true }).first(),
	).toBeVisible();
	// 一次被拒 + 一次成功：既证明重试发生，也证明没有重复建会话。
	await expect.poll(() => attempts).toBe(2);
	await expect(page).toHaveURL(/session=/);
});

test("不可重试冲突不重试，服务端原因包进发送失败横幅且草稿保留", async ({ page, baseURL }, info) => {
	let attempts = 0;
	await page.route(
		(url) => url.pathname.endsWith("/api/kit/sessions"),
		(route) => {
			if (route.request().method() !== "POST") return route.fallback();
			attempts += 1;
			return route.fulfill({
				status: 409,
				json: { error: { code: "conflict", message: "该 Agent 暂不可用", retryable: false } },
			});
		},
	);
	await openApp(page, info, baseURL as string);

	await attach(page, "retry-none.txt");
	const draft = "这条发不出去";
	await page.getByLabel("消息输入").fill(draft);
	await page.getByRole("button", { name: "发送", exact: true }).click();

	// 不可重试必须立刻停手：静默反复建会话会放大故障并留下半个会话。
	await expect(page.getByRole("alert")).toContainText(`消息发送失败：该 Agent 暂不可用`);
	await expect.poll(() => attempts).toBe(1);
	await expect(page).not.toHaveURL(/session=/);
	// 失败不许吞输入：草稿与附件都留在原地，用户可以直接重试。
	await expect(page.getByLabel("消息输入")).toHaveText(draft, { useInnerText: true });
});
