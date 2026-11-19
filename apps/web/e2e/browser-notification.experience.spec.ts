import { expect, test } from "./fixtures.ts";
import { seedListedAgent } from "./helpers.ts";

type NotificationProbe = {
	permission: NotificationPermission;
	requests: number;
	shown: { title: string; body?: string; tag?: string }[];
};

test("浏览器通知：发送时申请权限，本轮完成后展示通知", async ({ page, request }) => {
	const slug = `notify-${Date.now().toString(36)}`;
	const agentName = "通知助手";
	await seedListedAgent(request, slug, agentName);
	await page.addInitScript(() => {
		const probe: NotificationProbe = { permission: "default", requests: 0, shown: [] };
		class FakeNotification {
			static get permission() {
				return probe.permission;
			}
			static async requestPermission() {
				probe.requests += 1;
				probe.permission = "granted";
				return "granted" as NotificationPermission;
			}
			onclick: (() => void) | null = null;
			constructor(title: string, options?: NotificationOptions) {
				probe.shown.push({
					title,
					...(options?.body ? { body: options.body } : {}),
					...(options?.tag ? { tag: options.tag } : {}),
				});
			}
			close() {}
		}
		Object.defineProperty(window, "Notification", { configurable: true, value: FakeNotification });
		(window as unknown as { __notificationProbe: NotificationProbe }).__notificationProbe = probe;
	});

	await page.goto(`/?agent=${slug}&lang=zh-CN`);
	await page.getByLabel("消息输入", { exact: true }).fill("写一份报告");
	await page.getByRole("button", { name: "发送", exact: true }).click();
	await expect(page).toHaveURL(/session=/);
	await expect(page.getByText("空闲", { exact: true })).toBeVisible({ timeout: 15_000 });

	const probe = () =>
		page.evaluate(() => (window as unknown as { __notificationProbe: NotificationProbe }).__notificationProbe);
	await expect.poll(async () => (await probe()).requests).toBe(1);
	await expect.poll(async () => (await probe()).shown.length).toBe(1);

	const [notification] = (await probe()).shown;
	expect(notification?.title).toContain(agentName);
	expect(notification?.body).toBeTruthy();
	expect(notification?.tag).toBe(new URL(page.url()).searchParams.get("session"));
});
