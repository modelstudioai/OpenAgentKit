import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";
import { seedListedAgent } from "./helpers.ts";

type HostCall = { capability: string; filename?: string; text?: string; multiple?: unknown; accept?: unknown };

/**
 * 在页面脚本执行前装好桌面壳桥。
 * 记录必须放在页面侧：addInitScript 只接收一个可序列化参数，Node 侧数组不会与页面共享，
 * 拿 Node 侧数组断言等于恒真空断言。
 */
function installBridge() {
	type Record = { capability: string; filename?: string; text?: string; multiple?: unknown; accept?: unknown };
	const calls: Record[] = [];
	const clipboardWrites: string[] = [];
	const target = window as unknown as {
		__OPENAGENTPACK_KIT_BRIDGE__: unknown;
		__E2E_HOST_CALLS__: Record[];
		__E2E_CLIPBOARD_WRITES__: string[];
	};
	target.__E2E_HOST_CALLS__ = calls;
	target.__E2E_CLIPBOARD_WRITES__ = clipboardWrites;
	target.__OPENAGENTPACK_KIT_BRIDGE__ = {
		pickFiles: async (options?: { multiple?: boolean; accept?: string }) => {
			calls.push({
				capability: "pickFiles",
				multiple: options?.multiple ?? null,
				accept: options?.accept ?? null,
			});
			return [new File(["桌面壳选取的内容"], `desktop-pick-${calls.length}.txt`, { type: "text/plain" })];
		},
		saveFile: async (input: { filename: string }) => {
			calls.push({ capability: "saveFile", filename: input.filename });
			return true;
		},
		copyText: async (text: string) => {
			calls.push({ capability: "copyText", text });
			return true;
		},
		preferredColorScheme: () => "dark",
	};
	// 浏览器兜底一旦被调用就说明注入没生效：只记录，交给断言判定。
	Object.defineProperty(navigator, "clipboard", {
		configurable: true,
		value: { writeText: async (text: string) => void clipboardWrites.push(text) },
	});
}

const hostCalls = (page: Page) =>
	page.evaluate(() => (window as unknown as { __E2E_HOST_CALLS__: HostCall[] }).__E2E_HOST_CALLS__);
const clipboardWrites = (page: Page) =>
	page.evaluate(() => (window as unknown as { __E2E_CLIPBOARD_WRITES__: string[] }).__E2E_CLIPBOARD_WRITES__);

const callsOf = async (page: Page, capability: string) =>
	(await hostCalls(page)).filter((call) => call.capability === capability);

/** 体验页与 API 分域：管理接口走 baseURL，页面用 project 指定的 webUrl 打开。 */
function webUrlOf(info: import("@playwright/test").TestInfo) {
	const api = String(info.project.use.baseURL);
	return `${String(info.project.metadata.webUrl)}/?api=${encodeURIComponent(api)}&agent=e2e-agent`;
}

test.beforeEach(async ({ request }) => {
	await seedListedAgent(request);
});

// 已有用例覆盖「宿主拒绝保存 → 浏览器实际下载」，这里补齐另一半：宿主接管后不得再触碰浏览器能力。
test("桌面壳接管：附件走注入 pickFiles 并透传 accept，不弹系统文件选择器", async ({ page }, info) => {
	await page.addInitScript(installBridge);
	let chooserOpened = false;
	page.on("filechooser", () => (chooserOpened = true));

	await page.goto(webUrlOf(info));
	await expect(page.getByLabel("消息输入")).toBeVisible();

	const attach = page.getByRole("button", { name: "添加附件" });
	await attach.click();
	await page.getByRole("menuitem", { name: "上传文件", exact: true }).click();
	const uploaded = page.waitForResponse(
		(response) => new URL(response.url()).pathname === "/api/kit/files" && response.request().method() === "POST",
	);
	await expect(page.getByText("desktop-pick-1.txt").first()).toBeVisible({ timeout: 10_000 });
	expect((await uploaded).ok()).toBe(true);

	// 图片入口的 accept 必须原样交给壳：壳据此过滤文件对话框，丢了就会让用户选到不合法的类型。
	await attach.click();
	await page.getByRole("menuitem", { name: "上传图片", exact: true }).click();
	await expect(page.getByText("desktop-pick-2.txt").first()).toBeVisible({ timeout: 10_000 });

	expect(await hostCalls(page)).toEqual([
		{ capability: "pickFiles", multiple: true, accept: null },
		{ capability: "pickFiles", multiple: true, accept: "image/*" },
	]);
	expect(chooserOpened).toBe(false);
});

test("桌面壳接管：主题、复制与产物保存均由宿主完成，不调用浏览器实现", async ({ page }, info) => {
	await page.addInitScript(installBridge);
	// 系统偏好与壳偏好相反，才能证明生效的是壳而不是 matchMedia。
	await page.emulateMedia({ colorScheme: "light" });
	let downloaded = 0;
	page.on("download", () => (downloaded += 1));

	await page.goto(webUrlOf(info));
	await expect(page.locator("html")).toHaveAttribute("data-kit-theme", "dark");

	// mock gateway 只在正文含 artifact 关键字时交付产物卡，这里要它才能验证宿主接管保存。
	const input = "桌面壳里的复制与保存 artifact";
	await page.getByLabel("消息输入").fill(input);
	await page.getByRole("button", { name: "发送", exact: true }).click();
	await expect(page.getByText(/mock gateway 的流式回答/).first()).toBeVisible({ timeout: 15_000 });
	await expect(page.getByText("空闲", { exact: true })).toBeVisible({ timeout: 15_000 });

	const actions = page
		.getByText(/mock gateway 的流式回答/)
		.first()
		.locator("xpath=ancestor::div[contains(@class, 'group/message')]")
		.getByRole("group", { name: "消息操作", exact: true });
	await actions.getByRole("button", { name: "复制", exact: true }).click();
	await expect(actions.getByRole("status")).toHaveText("已复制");
	const copied = await callsOf(page, "copyText");
	expect(copied).toHaveLength(1);
	// 宿主拿到的是完整原文：包含回显、换行与产物那句尾注，而不是被压平成单行的可见文本。
	const copiedText = String(copied[0]?.text ?? "");
	expect(copiedText).toContain(`收到：「${input}」`);
	expect(copiedText).toContain("\n这是 mock gateway 的流式回答");
	expect(copiedText).toContain("已生成交付文件");
	// 宿主已接管复制：浏览器剪贴板一次都不该被碰。
	expect(await clipboardWrites(page)).toEqual([]);

	// 产物保存交给壳：宿主返回 true 时不得再触发浏览器下载。
	const run = page.getByRole("group", { name: "执行过程", exact: true }).last();
	await run.locator("> summary").click();
	await page
		.getByRole("region", { name: "消息列表", exact: true })
		.getByRole("button", { name: "下载 mock-report.md", exact: true })
		.click();
	await expect.poll(async () => (await callsOf(page, "saveFile")).length).toBe(1);
	expect(await callsOf(page, "saveFile")).toEqual([{ capability: "saveFile", filename: "mock-report.md" }]);
	expect(downloaded).toBe(0);
});
