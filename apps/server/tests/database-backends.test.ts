import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import type { MemberLoginResult, PlanResponse, ResourceDraftView, TemplateView } from "@openagentkit/sdk/protocol";
import { expect, it, vi } from "vitest";
import { createApp } from "../src/app.ts";
import type { KitServices } from "../src/app-env.ts";
import { loadConfig } from "../src/config.ts";
import { KitMembersEntity } from "../src/entity/tables/kit-members.entity.ts";
import { connectDatabase } from "../src/module/infrastructure.ts";
import { UsageAccountingService } from "../src/service/shared/usage/usage-accounting.ts";
import type { DatabaseConnection } from "../src/store/connect.ts";
import { StoreDatabase } from "../src/store/database.ts";
import { KIT_SERVICES } from "../src/utils/injection-tokens.ts";

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
	let app: INestApplication | undefined;
	let connection: DatabaseConnection | undefined;
	async function start() {
		app = await createApp(config);
		await app.listen(0, "127.0.0.1");
		return {
			origin: await app.getUrl(),
			database: app.get(StoreDatabase),
			services: app.get<KitServices>(KIT_SERVICES),
		};
	}
	async function stop() {
		const running = app;
		app = undefined;
		await running?.close();
	}
	try {
		const initial = await start();
		const { services } = initial;
		let { origin } = initial;
		expect(await services.quota.policy()).toMatchObject({ monthly_credits: 180, updated_by: "config" });
		const request = (path: string, token?: string, method = "GET", body?: unknown) =>
			fetch(origin + path, {
				method,
				headers: {
					"content-type": "application/json",
					"x-kit-protocol-version": "3.0.0",
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
		// 同一事务中的成员注销和品牌更新在回滚后都应恢复。
		const initialBrand = await services.branding.get();
		const cancelLogout = new Error("撤销本次注销");
		await expect(
			initial.database.transaction(async () => {
				await services.memberAuth.logout(member.access_token);
				await services.branding.update({ productName: suffix, updatedBy: admin });
				expect((await services.branding.get()).product_name).toBe(suffix);
				await expect(services.memberAuth.resolve(member.access_token)).rejects.toMatchObject({ code: "unauthorized" });
				throw cancelLogout;
			}),
		).rejects.toBe(cancelLogout);
		expect(await services.branding.get()).toEqual(initialBrand);
		expect((await services.memberAuth.resolve(member.access_token)).view.identity.subjectId).toBe(
			member.member.member_id,
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

		const presetName = `资料%_${suffix}`;
		vi.spyOn(services.gateway, "listRemoteAgents").mockResolvedValueOnce([
			{ agent_id: input.remote_agent_id, name: presetName, version: 1 },
		]);
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

		const listPresets = async (search: string, offset = 0) => {
			const query = new URLSearchParams({ search, limit: "1", offset: String(offset) });
			const response = await request(`/api/admin/preset-packs?${query}`, admin);
			expect(response.status).toBe(200);
			return response.json();
		};
		expect(await listPresets(presetName)).toMatchObject({
			total: 1,
			data: [{ preset_pack_id: preset.preset_pack_id }],
		});
		expect(await listPresets(presetName, 1)).toEqual({ total: 1, data: [] });
		for (const wildcard of ["%", "_"]) {
			expect(await listPresets(presetName.replace("料", wildcard))).toEqual({ total: 0, data: [] });
		}

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
				expect((await services.sessionIndex.get(sessionId))?.summary.status).toBe("idle");
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

		// 使用 Service 提供给 Gateway 的批次存储，验证两位数修订条件与跨 Service 的事务回滚。
		const openDocument = vi.spyOn(services.gateway, "resourceDraftDocument");
		const editing = await services.resourceDrafts.create(admin);
		await services.resourceDrafts.resourcesFor(editing.draft_id, admin, "GET", "/overview");
		const storage = openDocument.mock.calls.find(([id]) => id === editing.draft_id)?.[2];
		openDocument.mockRestore();
		if (!storage) throw new Error("新批次没有建立文档存储");
		const { yaml } = await storage.read();
		for (let revision = 1; revision <= 10; revision++) {
			expect(await storage.write(String(revision), `${yaml}\n# ${revision + 1}`)).toBe(String(revision + 1));
		}
		await expect(storage.write("10", "stale")).rejects.toMatchObject({ code: "conflict" });
		await expect(
			initial.database.transaction(async () => {
				expect(await storage.write("11", "uncommitted")).toBe("12");
				throw new Error("roll back draft transaction");
			}),
		).rejects.toThrow("roll back draft transaction");
		expect(await storage.read()).toMatchObject({ revision: 11, yaml: `${yaml}\n# 11` });

		await stop();
		expect(existsSync(join(dataDir, "kit.sqlite"))).toBe(config.database.driver === "sqlite");
		({ origin } = await start());
		expect((await request("/api/kit/auth/me", member.access_token)).status).toBe(200);
		expect(await data(await request("/api/kit/sessions", member.access_token), 200)).toMatchObject([
			{ session_id: sessionId },
		]);
		expect((await request("/api/kit/auth/logout", member.access_token, "POST")).status).toBe(204);
		expect((await request("/api/kit/auth/me", member.access_token)).status).toBe(401);
		await stop();
		const db = await connectDatabase(config);
		connection = db;

		// 实体查询需要读到同一事务中的写入，回滚后重新读取旧值。
		const memberId = member.member.member_id;
		const readMemberName = () =>
			db.read((manager) =>
				manager.findOne(KitMembersEntity, { where: { member_id: memberId }, select: { display_name: true } }),
			);
		const originalName = await readMemberName();
		expect(originalName).toBeInstanceOf(KitMembersEntity);
		expect(Object.keys(originalName ?? {})).toEqual(["display_name"]);
		expect(originalName?.display_name).toBe("数据库测试");
		const rollback = new Error("roll back entity read and write");
		await expect(
			db.transaction(async () => {
				const displayName = "O'Brien 的 C:\\Docs";
				// 在同一个真实 MySQL 连接上核对非默认 SQL 模式，并在归还连接前恢复。
				const originalMode =
					db.dialect === "mysql"
						? (await db.read((manager) => manager.query<{ mode: string }[]>("SELECT @@SESSION.sql_mode AS mode")))[0]!
								.mode
						: undefined;
				const setMode = (mode: string) => db.write((manager) => manager.query("SET SESSION sql_mode = ?", [mode]));
				if (originalMode !== undefined)
					await setMode([...new Set([...originalMode.split(",").filter(Boolean), "NO_BACKSLASH_ESCAPES"])].join(","));
				try {
					await db.write((manager) =>
						manager.update(KitMembersEntity, { member_id: memberId }, { display_name: displayName }),
					);
					expect((await readMemberName())?.display_name).toBe(displayName);
				} finally {
					if (originalMode !== undefined) await setMode(originalMode);
				}
				throw rollback;
			}),
		).rejects.toBe(rollback);
		expect(await readMemberName()).toEqual(originalName);

		// 缺失计量基线时，两张月账的未知标记随事务写入，撤销本次准入时一起恢复。
		const limits = new UsageAccountingService(db);
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
		// 同一累计值重采与跨月首轮准入：成员月账、条目月账和逐日聚合必须使用同一份增量。
		const baseline = await limits.session(sessionId);
		const counters = {
			input_tokens: baseline?.input_tokens ?? 0,
			output_tokens: baseline?.output_tokens ?? 0,
			active_seconds: baseline?.active_seconds ?? 0,
		};
		await limits.observe(sessionId, counters, now);
		async function account(readingAt: string, key: string) {
			const bucket = readingAt.slice(0, 7);
			await limits.begin({
				sessionId,
				memberId,
				key,
				hash: suffix,
				month: bucket,
				now: readingAt,
				previousStatus: "idle",
				available: { tokens: true, active_seconds: true },
			});
			await limits.accepted(sessionId, key, [key]);
			counters.input_tokens += 3;
			counters.output_tokens += 2;
			counters.active_seconds += 1.5;
			await limits.observe(sessionId, counters, readingAt);
			await limits.observe(sessionId, counters, readingAt);
			await limits.settle(sessionId, key);
			expect(await limits.totals(memberId, bucket)).toMatchObject({ tokens: 5, active_seconds: 1.5 });
			expect(await limits.agentTotals(agent.slug, bucket)).toMatchObject({ tokens: 5, active_seconds: 1.5 });
		}
		await account(now, "january");
		await account("2040-02-01T00:00:00.000Z", "february");
		const days = [
			{ day: "2040-01-01", tokens: 5, active_seconds: 1.5 },
			{ day: "2040-02-01", tokens: 5, active_seconds: 1.5 },
		];
		expect(await limits.dailyUsage(memberId, days[0]!.day)).toMatchObject(days);
		expect(await limits.templateDailyUsage(template.template_id, days[0]!.day)).toEqual(days);
		await expect(undo()).rejects.toMatchObject({ code: "conflict" });
	} finally {
		await stop();
		await connection?.close();
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
