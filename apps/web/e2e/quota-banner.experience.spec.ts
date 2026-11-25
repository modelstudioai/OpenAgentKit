import type { MemberUsageLimitView } from "@openagentkit/sdk/protocol";
import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./fixtures.ts";
import { ADMIN_TOKEN, seedListedAgent } from "./helpers.ts";

const headers = { authorization: `Bearer ${ADMIN_TOKEN}` };
const password = "Quota-Banner!2026";

async function readLimit(request: APIRequestContext, memberId: string): Promise<MemberUsageLimitView> {
	const result = await request.get(`/api/admin/members/${memberId}/usage-limit`, { headers });
	expect(result.ok()).toBe(true);
	return ((await result.json()) as { data: MemberUsageLimitView }).data;
}

async function setMonthlyTokens(request: APIRequestContext, memberId: string, monthlyTokens: number | null) {
	const saved = await request.put(`/api/admin/members/${memberId}/usage-limit`, {
		headers,
		data: { monthly_tokens: monthlyTokens, monthly_active_seconds: null },
	});
	expect(saved.ok()).toBe(true);
}

/**
 * 配额横幅的唯一真凭据是服务端限额闸门：这里不用 route 造假，而是先跑满一轮拿到真实 used，
 * 再把月度上限压到同一个数值，第二条消息必然被 403 拒绝。React 与 Vue 共用同一份成员数据依次跑，
 * 达限禁用、草稿保留、"重新检查额度只信服务端新结果" 三段行为只修一边就会在这里分叉。
 */
test("配额横幅：服务端真实达限禁用发送，重新检查恢复且草稿不丢", async ({ page, request }, info) => {
	const webUrl = String(info.project.metadata.webUrl);
	const apiBaseUrl = String(info.project.metadata.apiBaseUrl);
	const suffix = Date.now().toString(36);
	const username = `quota-banner-${suffix}`;
	const slug = `quota-banner-agent-${suffix}`;
	const created = await request.post("/api/admin/members", {
		headers,
		data: {
			username,
			display_name: "配额横幅回归成员",
			auth_type: "local",
			password_mode: "custom",
			password,
		},
	});
	expect(created.ok()).toBe(true);
	const { member } = (await created.json()).data as { member: { member_id: string } };
	// 展示名同样受服务端唯一约束：两个 project 共用一份库，必须各用各的名字。
	await seedListedAgent(request, slug, `配额横幅 Agent ${suffix}`);

	await page.goto(`${webUrl}/?${new URLSearchParams({ api: apiBaseUrl, agent: slug })}`);
	await page.getByLabel("用户名", { exact: true }).fill(username);
	await page.getByLabel("密码", { exact: true }).fill(password);
	await page.getByRole("button", { name: "登录", exact: true }).click();

	const composer = page.getByLabel("消息输入");
	const send = page.getByRole("button", { name: "发送", exact: true });
	await expect(composer).toBeVisible();
	// 第一轮真实消耗：mock gateway 每轮固定 Token 数，但断言只用服务端回读值，不写死常量。
	await composer.fill("第一轮消耗额度");
	await send.click();
	await expect(page.getByText(/mock gateway 的流式回答/).first()).toBeVisible();
	await expect(page.getByText("空闲", { exact: true })).toBeVisible();
	const used = (await readLimit(request, member.member_id)).tokens.used;
	expect(used).toBeGreaterThan(0);
	await setMonthlyTokens(request, member.member_id, used);

	const draft = "达限后保留的草稿";
	const denied = page.waitForResponse(
		(response) => /\/messages$/.test(new URL(response.url()).pathname) && response.status() === 403,
	);
	await composer.fill(draft);
	await send.click();
	expect((await (await denied).json()).error).toMatchObject({
		code: "quota_exceeded",
		details: { metric: "tokens" },
	});

	const banner = page.getByTestId("quota-banner");
	await expect(banner).toBeVisible();
	await expect(banner).toContainText("本月 Token 已达限额");
	await expect(banner).toContainText(`${used}/${used}`);
	await expect(banner.getByRole("button", { name: "去申请", exact: true })).toHaveCount(0);
	await expect(send).toBeDisabled();
	await expect(composer).toHaveText(draft, { useInnerText: true });

	// 额度未变时重新检查：只信服务端新结果，横幅与禁用都必须保持，不能靠前端乐观解除。
	await banner.getByRole("button", { name: "重新检查额度", exact: true }).click();
	await expect(banner).toContainText("额度仍不足");
	await expect(send).toBeDisabled();
	await expect(composer).toHaveText(draft, { useInnerText: true });

	// 放宽额度后重新检查：横幅消失、输入解禁、草稿仍在，发送被服务端接受。
	await setMonthlyTokens(request, member.member_id, used + 1_000);
	await banner.getByRole("button", { name: "重新检查额度", exact: true }).click();
	await expect(banner).toHaveCount(0);
	await expect(send).toBeEnabled();
	await expect(composer).toHaveText(draft, { useInnerText: true });
	const accepted = page.waitForResponse(
		(response) => /\/messages$/.test(new URL(response.url()).pathname) && response.request().method() === "POST",
	);
	await send.click();
	expect((await accepted).ok()).toBe(true);
	await expect(page.getByText("空闲", { exact: true })).toBeVisible();
});
