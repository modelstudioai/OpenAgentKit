import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MemberLoginResult, PlanResponse, ResourceDraftView, TemplateView } from "@openagentkit/sdk/protocol";
import { expect, it, vi } from "vitest";
import { createApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { createKitServices, openKitServices } from "../src/services/index.ts";
import { connectDatabase } from "../src/store/connect.ts";
import { createResourceDraftStore } from "../src/store/resource-drafts.ts";
import { createUsageLimitStore } from "../src/store/usage-limits.ts";

async function exerciseBackend(backend?: { driver: "mysql" | "postgres"; url?: string }) {
	const dataDir = await mkdtemp(join(tmpdir(), "kit-db-backend-"));
	const suffix = randomUUID().slice(0, 12);
	const admin = `admin-${suffix}`;
	const password = "Backend!Test2026";
	const config = loadConfig({
		KIT_GATEWAY: "mock",
		KIT_DATA_DIR: dataDir,
		KIT_QUOTA_DEFAULT_MONTHLY: "180",
		ADMIN_TOKEN: admin,
		...(backend && { KIT_DB_DRIVER: backend.driver, KIT_DATABASE_URL: backend.url }),
	});
	let services: Awaited<ReturnType<typeof openKitServices>> | undefined;
	try {
		services = await openKitServices(config);
		expect(await services.quota.policy()).toMatchObject({ monthly_credits: 180, updated_by: "config" });
		let app = createApp(services);
		const request = (path: string, token?: string, method = "GET", body?: unknown) =>
			app.request(path, {
				method,
				headers: {
					"content-type": "application/json",
					"x-kit-protocol-version": "2.0.0",
					...(token ? { authorization: `Bearer ${token}` } : {}),
				},
				...(body === undefined ? {} : { body: JSON.stringify(body) }),
			});
		async function data<T>(response: Response, status: number): Promise<T> {
			expect(response.status, await response.clone().text()).toBe(status);
			return ((await response.json()) as { data: T }).data;
		}

		const username = `member_${suffix}`;
		await data(
			await request("/api/admin/members", admin, "POST", {
				username,
				display_name: "数据库测试",
				auth_type: "local",
				password_mode: "custom",
				password,
			}),
			201,
		);
		const member = await data<MemberLoginResult>(
			await request("/api/kit/auth/login", undefined, "POST", { username, password }),
			200,
		);
		const group = await services.groups.create({ name: `group-${suffix}` }, admin);
		expect(
			await services.groups.updateGroupMembers(
				group.group_id,
				{ add_member_ids: [member.member.member_id], remove_member_ids: [] },
				admin,
			),
		).toMatchObject({ member_count: 1 });
		const input = {
			name: `模版 %_${suffix}`,
			category: "general",
			remote_agent_id: "agent_mock_assistant",
			remote_environment_id: "env_mock_analysis",
		};
		const template = await data<TemplateView>(await request("/api/admin/templates", admin, "POST", input), 201);
		const path = `/api/admin/templates/${template.template_id}`;
		const listingInput = { display_name: input.name };
		const plan = await data<PlanResponse>(await request(`${path}/listing/plan`, admin, "POST", listingInput), 200);
		const agent = await data<{ slug: string }>(
			await request(`${path}/listing`, admin, "POST", {
				...listingInput,
				plan_id: plan.plan_id,
				confirm_token: plan.confirm_token,
			}),
			200,
		);
		const edits = await Promise.all([
			request(path, admin, "PUT", { ...input, base_version: 1, description: "版本更新 A" }),
			request(path, admin, "PUT", { ...input, base_version: 1, description: "版本更新 B" }),
		]);
		expect(edits.map((response) => response.status).sort()).toEqual([200, 409]);
		const updated = await data<TemplateView>(edits.find((response) => response.ok)!, 200);
		expect(updated.version).toBe(2);
		expect((await services.catalog.getBySlug(agent.slug))?.description).toBe(updated.description);
		const list = await request(`/api/admin/templates?category=general&search=${encodeURIComponent(input.name)}`, admin);
		expect(list.status, await list.clone().text()).toBe(200);
		expect(await list.json()).toMatchObject({ data: [{ template_id: template.template_id, version: 2 }] });

		const preset = await data<{ preset_pack_id: string }>(
			await request("/api/admin/preset-packs", admin, "POST", {
				remote_agent_id: input.remote_agent_id,
				resources: [],
			}),
			201,
		);
		const presets = await request("/api/admin/preset-packs?search=MOCK_ASSISTANT", admin);
		expect(presets.status, await presets.clone().text()).toBe(200);
		expect(await presets.json()).toMatchObject({
			total: expect.any(Number),
			data: expect.arrayContaining([expect.objectContaining({ preset_pack_id: preset.preset_pack_id })]),
		});

		const { session_id: sessionId } = await data<{ session_id: string }>(
			await request("/api/kit/sessions", member.access_token, "POST", { agent_slug: agent.slug }),
			201,
		);
		const charge = {
			subjectId: member.member.member_id,
			agentSlug: agent.slug,
			sessionId,
			clientMessageId: "same-turn",
		};
		await Promise.all([services.quota.chargeTurn(charge), services.quota.chargeTurn(charge)]);
		expect((await services.quota.stateFor(charge.subjectId)).used).toBe(1);
		const sent = await services.sessions.send(sessionId, { text: "验证用量写入", clientMessageId: "usage-turn" });
		expect(sent.event_ids.length).toBeGreaterThan(0);
		await vi.waitFor(
			async () => {
				expect((await services?.sessionIndex.get(sessionId))?.summary.status).toBe("idle");
			},
			{ timeout: 4_000 },
		);
		await services.memberUsage.refresh(charge.subjectId, true);
		expect((await services.memberUsage.summary(charge.subjectId)).session_count).toBe(1);
		expect(await services.memberUsage.summaryByTemplate({ search: template.template_id })).toMatchObject([
			{ template_id: template.template_id, listing_status: "listed", session_count: 1 },
		]);
		const logo = { contentType: "image/png", bytes: Uint8Array.of(0, 127, 255), hash: suffix, updatedBy: admin };
		await services.branding.saveLogo(logo);
		expect(Array.from((await services.branding.getLogo())?.bytes ?? [])).toEqual([0, 127, 255]);

		const draft = await data<ResourceDraftView>(await request("/api/admin/resource-drafts", admin, "POST"), 200);
		const draftPath = `/api/admin/resource-drafts/${draft.draft_id}/resources`;
		const { project_revision: revision } = await data<{ project_revision: string }>(
			await request(draftPath, admin),
			200,
		);
		await data(
			await request(`${draftPath}/agents`, admin, "POST", {
				base_revision: revision,
				name: "数据库验证助手",
				model: "auto",
			}),
			201,
		);
		const publishPlan = await data<PlanResponse>(
			await request(`${draftPath}/plan`, admin, "POST", { action: "publish" }),
			200,
		);
		const { operation_id: operation } = await data<{ operation_id: string }>(
			await request(`${draftPath}/publish`, admin, "POST", {
				plan_id: publishPlan.plan_id,
				confirm_token: publishPlan.confirm_token,
			}),
			202,
		);
		const events = await request(`/api/admin/operations/${operation}/events`, admin);
		expect(events.status).toBe(200);
		const stream = await events.text();
		expect(stream).toContain('"status":"succeeded"');
		expect(stream).toContain('"reason":"operation_closed"');

		await services.close();
		services = undefined;
		expect(existsSync(join(dataDir, "kit.sqlite"))).toBe(config.database.driver === "sqlite");
		const db = await connectDatabase(config);
		services = createKitServices(config, db);
		app = createApp(services);
		expect((await request("/api/kit/auth/me", member.access_token)).status).toBe(200);
		expect(await data(await request("/api/kit/sessions", member.access_token), 200)).toMatchObject([
			{ session_id: sessionId },
		]);
		expect((await request("/api/kit/auth/logout", member.access_token, "POST")).status).toBe(204);
		expect((await request("/api/kit/auth/me", member.access_token)).status).toBe(401);

		// 两位数修订号仍按完整版本校验，相邻旧版本不能覆盖新内容。
		const drafts = createResourceDraftStore(db);
		const nextDraft = await drafts.create(`draft_${suffix}`, admin);
		await drafts.initializeDocument(nextDraft.draft_id, "initial");
		for (let base = 1; base <= 10; base++) {
			expect(await drafts.writeDocument(nextDraft.draft_id, String(base), `version ${base + 1}`)).toBe(
				String(base + 1),
			);
		}
		await expect(drafts.writeDocument(nextDraft.draft_id, "10", "stale")).rejects.toMatchObject({ code: "conflict" });
		await expect(
			db.transaction(async () => {
				expect(await drafts.writeDocument(nextDraft.draft_id, "11", "uncommitted")).toBe("12");
				throw new Error("roll back draft transaction");
			}),
		).rejects.toThrow("roll back draft transaction");
		expect(await drafts.document(nextDraft.draft_id)).toMatchObject({ revision: 11, yaml: "version 11" });

		// 缺失计量基线时，两张月账的未知标记随事务写入，撤销本次准入时一起恢复。
		const limits = createUsageLimitStore(db);
		const now = "2040-01-01T00:00:00.000Z";
		const month = now.slice(0, 7);
		await limits.prepare(charge.subjectId, now);
		const undo = await limits.begin({
			sessionId,
			memberId: charge.subjectId,
			key: "unknown",
			hash: suffix,
			month,
			now,
			previousStatus: "idle",
			available: { tokens: false, active_seconds: false },
		});
		const expectUnknownFlags = async (expected: number) => {
			expect(await limits.totals(charge.subjectId, month)).toMatchObject({
				tokens_unknown: expected,
				active_seconds_unknown: expected,
			});
			expect(await limits.agentTotals(agent.slug, month)).toMatchObject({
				tokens_unknown: expected,
				active_seconds_unknown: expected,
			});
		};
		await expectUnknownFlags(1);
		await undo();
		await expectUnknownFlags(0);
	} finally {
		await services?.close();
		await rm(dataDir, { recursive: true, force: true });
	}
}

it("默认 SQLite 通过同一服务入口初始化并持久化业务数据", () => exerciseBackend(), 15_000);
for (const [driver, url] of [
	["mysql", process.env.KIT_TEST_MYSQL_URL],
	["postgres", process.env.KIT_TEST_POSTGRES_URL],
] as const) {
	it.skipIf(!url)(
		`显式选择 ${driver} 后通过真实数据库完成同一业务流程`,
		() => exerciseBackend({ driver, url }),
		25_000,
	);
}
