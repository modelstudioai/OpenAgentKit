import { afterEach, describe, expect, it, vi } from "vitest";
import { requestCompletionNotificationPermission, showCompletionNotification } from "./browser-notifications.ts";

class FakeNotification {
	static permission: NotificationPermission = "default";
	static requestPermission = vi.fn(async (): Promise<NotificationPermission> => {
		FakeNotification.permission = "granted";
		return "granted";
	});
	static instances: FakeNotification[] = [];

	onclick: ((event: Event) => void) | null = null;
	close = vi.fn();
	constructor(
		readonly title: string,
		readonly options?: NotificationOptions,
	) {
		FakeNotification.instances.push(this);
	}
}

function stubBrowser(permission: NotificationPermission = "default") {
	FakeNotification.permission = permission;
	const focus = vi.fn();
	vi.stubGlobal("window", {
		Notification: FakeNotification as unknown as typeof Notification,
		focus,
	});
	return focus;
}

describe("浏览器完成通知", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		FakeNotification.permission = "default";
		FakeNotification.requestPermission.mockClear();
		FakeNotification.instances = [];
	});

	it("没有 Notification API 时申请与展示都静默降级", async () => {
		vi.stubGlobal("window", {});
		await expect(requestCompletionNotificationPermission()).resolves.toBe(false);
		expect(showCompletionNotification({ title: "已完成", body: "查看结果", tag: "session-1" })).toBe(false);
	});

	it("在用户手势内申请权限，并发发送只触发一次申请", async () => {
		stubBrowser();
		await expect(
			Promise.all([requestCompletionNotificationPermission(), requestCompletionNotificationPermission()]),
		).resolves.toEqual([true, true]);
		expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
	});

	it("已授权时构造通知，点击后聚焦页面并关闭通知", async () => {
		const focus = stubBrowser("granted");
		expect(
			showCompletionNotification({
				title: "E2E 助手已完成回复",
				body: "点击返回对话查看结果。",
				tag: "session-1",
				icon: "/brand/logo.svg",
			}),
		).toBe(true);
		expect(FakeNotification.instances).toHaveLength(1);
		expect(FakeNotification.instances[0]).toMatchObject({
			title: "E2E 助手已完成回复",
			options: {
				body: "点击返回对话查看结果。",
				tag: "session-1",
				icon: "/brand/logo.svg",
			},
		});
		await expect(requestCompletionNotificationPermission()).resolves.toBe(true);
		expect(FakeNotification.requestPermission).not.toHaveBeenCalled();

		FakeNotification.instances[0]?.onclick?.({} as Event);
		expect(focus).toHaveBeenCalledTimes(1);
		expect(FakeNotification.instances[0]?.close).toHaveBeenCalledTimes(1);
	});

	it("权限被拒绝或申请失败时不展示通知", async () => {
		stubBrowser("denied");
		await expect(requestCompletionNotificationPermission()).resolves.toBe(false);
		expect(showCompletionNotification({ title: "已完成", body: "查看结果", tag: "session-1" })).toBe(false);
		expect(FakeNotification.instances).toHaveLength(0);

		FakeNotification.permission = "default";
		FakeNotification.requestPermission.mockRejectedValueOnce(new Error("blocked"));
		await expect(requestCompletionNotificationPermission()).resolves.toBe(false);
	});
});
