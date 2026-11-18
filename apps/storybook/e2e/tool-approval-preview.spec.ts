import { expect, test } from "./fixtures.ts";

test("最佳实践的工具审批演示：查看完整参数并分别提交允许和拒绝", async ({ page }) => {
	await page.goto("/docs/components/chrome/");
	await expect(page.getByRole("heading", { name: /^工具审批/, level: 3 })).toBeVisible();
	const iframe = page.locator('iframe[src="/previews/tool-approval/"]');
	await page.locator(".kit-preview", { has: iframe }).getByRole("button", { name: "手机", exact: true }).click();
	const preview = iframe.contentFrame();
	const approval = preview.getByRole("region", { name: "工具审批 write_file", exact: true });
	const reset = preview.getByRole("button", { name: "重置示例", exact: true });
	await approval.getByText("查看参数", { exact: true }).click();
	await expect(approval.locator("pre").filter({ hasText: "/mnt/session/report.md" })).toBeVisible();

	for (const action of ["允许", "拒绝"]) {
		await approval.getByRole("button", { name: action, exact: true }).click();
		const outcome = preview.getByText(`已提交「${action}」`, { exact: true });
		await expect(outcome).toBeVisible();
		await expect(approval.getByRole("button", { name: /^(允许|拒绝)$/ })).toHaveCount(0);
		await reset.click();
		await expect(outcome).toHaveCount(0);
	}
});
