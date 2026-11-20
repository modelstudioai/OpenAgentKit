import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	MembersPage,
	MemberUsageSummary,
	TemplateSessionUsage,
	TemplateUsageRow,
	TemplateUsageTrend,
	UsageMetric,
	UsageModelRow,
	UsageSummary,
	UsageToolRow,
	UsageTotal,
	UsageTrend,
} from "@openagentkit/sdk/protocol";
import {
	ApiError,
	type UsageSummaryRequest,
	type UsageSummaryResponse,
	type UsageTrendRequest,
	type UsageTrendResponse,
} from "@openagentpack/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import type { GatewaySessionInfo } from "../src/gateway/types.ts";
import { createKitServices } from "../src/services/index.ts";
import { createMemberUsageService } from "../src/services/member-usage.ts";
import { openDatabase } from "../src/store/db.ts";
import { createMemberStore } from "../src/store/members.ts";
import { createSessionUsageStore } from "../src/store/session-usage.ts";
import { createSqliteDatabase } from "../src/store/sqlite.ts";
import { createTemplateStore } from "../src/store/templates.ts";

const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const close of cleanup.splice(0).reverse()) close();
});
const admin = { authorization: "Bearer admin-token" };
const auditor = { authorization: "Bearer audit-token" };
function setup(env: Record<string, string | undefined> = {}) {
	const dataDir = mkdtempSync(join(tmpdir(), "kit-member-usage-"));
	cleanup.push(() => rmSync(dataDir, { recursive: true, force: true }));
	const db = openDatabase(dataDir);
	cleanup.push(() => db.close());
	const config = loadConfig({
		KIT_GATEWAY: "mock",
		KIT_DATA_DIR: dataDir,
		ADMIN_TOKEN: "admin-token",
		KIT_ADMIN_TOKENS: "audit-token:auditor",
		...env,
	});
	const services = createKitServices(config, db);
	const members = createMemberStore(createSqliteDatabase(db));
	const usageStore = createSessionUsageStore(createSqliteDatabase(db));
	async function member(id: string) {
		return await members.create(
			{
				member_id: id,
				username: id,
				display_name: id,
				auth_type: "local",
				status: "active",
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			},
			"unused-hash",
		);
	}
	async function session(id: string, memberId: string, agentSlug = "agent-a") {
		// 归属键是目录条目 ID：slug 有活动条目时随创建绑定（与创建路由一致），无条目为 null。
		const entry = agentSlug ? await services.catalog.getBySlug(agentSlug) : null;
		await services.sessionIndex.create({
			sessionId: id,
			subjectId: memberId,
			agentSlug,
			...(entry && !entry.deleted ? { catalogEntryId: entry.id } : {}),
		});
	}
	return { db, services, app: createApp(services), usageStore, members, member, session, dataDir };
}
function detail(id: string, input = 10): GatewaySessionInfo {
	return {
		session_id: id,
		status: "idle",
		usage: { input_tokens: input, output_tokens: 2, cache_read_input_tokens: 0, cache_creation_input_tokens: 1 },
		stats: { active_seconds: 0.5, duration_seconds: 2 },
	};
}
function metricOf(value: number | null, unit = "count"): UsageMetric {
	return { value, unit };
}
function stubTotal(input: number, calls: number): UsageTotal {
	return {
		input_tokens: metricOf(input, "tokens"),
		output_tokens: metricOf(0, "tokens"),
		total_tokens: metricOf(input, "tokens"),
		cache_read_tokens: metricOf(0, "tokens"),
		cache_creation_tokens: metricOf(0, "tokens"),
		cache_hit_ratio: metricOf(0, "ratio"),
		model_call_count: metricOf(calls),
		tool_call_count: metricOf(calls),
		builtin_tool_call_count: metricOf(calls),
		mcp_tool_call_count: metricOf(0),
		custom_tool_call_count: metricOf(0),
		turns: metricOf(calls),
		steps: metricOf(calls),
		interrupt_error_count: metricOf(0),
		model_failed_count: metricOf(0),
		tool_failed_count: metricOf(0),
		runtime_ms: metricOf(0, "ms"),
	};
}

describe("成员累计会话用量", () => {
	it("遍历超过100条会话，累计快照替换不重复计费；成员与用途隔离，筛选和分页同一口径", async () => {
		const { services, member, session } = setup();
		await member("member_a");
		await member("member_b");
		for (let i = 0; i < 125; i++)
			await session(`s-${String(i).padStart(3, "0")}`, "member_a", i % 2 ? "agent-b" : "agent-a");
		await session("other-member", "member_b");
		await session("anonymous", "device-id");
		await services.sessionIndex.create({
			sessionId: "debug",
			subjectId: "member_a",
			purpose: "admin_debug",
			debug: { project_name: "main", agent_key: "agent", remote_agent_id: "remote" },
		});
		const fetchDetail = vi.spyOn(services.gateway, "getSession").mockImplementation(async (id) => detail(id));
		await services.memberUsage.refresh("member_a", true);
		const first = await services.memberUsage.summary("member_a");
		expect(first).toMatchObject({
			session_count: 125,
			completed_sessions: 125,
			refresh_status: "idle",
			metrics: {
				input_tokens: { value: 1250, covered_sessions: 125 },
				cache_read_input_tokens: { value: 0, covered_sessions: 125 },
			},
		});
		expect(fetchDetail).toHaveBeenCalledTimes(125);
		fetchDetail.mockImplementation(async (id) => detail(id, 12));
		await services.memberUsage.refresh("member_a", true);
		expect((await services.memberUsage.summary("member_a")).metrics.input_tokens.value).toBe(1500);
		const filtered = await services.memberUsage.summary("member_a", { agent_slug: "agent-b" });
		expect(filtered.session_count).toBe(62);
		expect(filtered.metrics.input_tokens.value).toBe(744);
		expect(filtered.agents).toEqual([
			{ slug: "agent-a", display_name: null },
			{ slug: "agent-b", display_name: null },
		]);
		const ids = new Set<string>();
		let cursor: string | undefined;
		do {
			const page = await services.memberUsage.list("member_a", { agent_slug: "agent-b", limit: 17, cursor });
			for (const row of page.data) {
				expect(ids.has(row.session_id)).toBe(false);
				ids.add(row.session_id);
			}
			cursor = page.next_cursor;
		} while (cursor);
		expect(ids.size).toBe(62);
		expect(fetchDetail.mock.calls.flat()).not.toContain("debug");
		await expect(services.memberUsage.summary("device-id")).rejects.toThrow("成员不存在");
	});

	it("同成员刷新合并、全局四并发、60秒内查询不重复访问Provider", async () => {
		const { services, member, session } = setup();
		for (const id of ["member_a", "member_b"]) {
			await member(id);
			for (let i = 0; i < 8; i++) await session(`${id}-${i}`, id);
		}
		let active = 0;
		let peak = 0;
		const fetchDetail = vi.spyOn(services.gateway, "getSession").mockImplementation(async (id) => {
			active++;
			peak = Math.max(peak, active);
			await new Promise((resolve) => setTimeout(resolve, 3));
			active--;
			return detail(id);
		});
		await Promise.all([
			services.memberUsage.refresh("member_a", true),
			services.memberUsage.refresh("member_a", true),
			services.memberUsage.refresh("member_b", true),
		]);
		expect(peak).toBe(4);
		expect(fetchDetail).toHaveBeenCalledTimes(16);
		await services.memberUsage.summary("member_a");
		await services.memberUsage.refresh("member_a");
		expect(fetchDetail).toHaveBeenCalledTimes(16);
	});

	it("请求超时释放采集槽位，迟到结果不能写入；TTL内新增会话仍触发采集", async () => {
		const { services, member, session, usageStore, members } = setup();
		await member("member_a");
		for (let i = 0; i < 8; i++) await session(`s${i}`, "member_a");
		let late: ((value: GatewaySessionInfo) => void) | undefined;
		const fetchDetail = vi.spyOn(services.gateway, "getSession").mockImplementation(async (id) => {
			if (id === "s0")
				return new Promise<GatewaySessionInfo>((resolve) => {
					late = resolve;
				});
			return detail(id);
		});
		const usage = createMemberUsageService({
			store: usageStore,
			members,
			gateway: services.gateway,
			sessionIndex: services.sessionIndex,
			detailTimeoutMs: 5,
		});
		await usage.refresh("member_a", true);
		expect(await usage.summary("member_a")).toMatchObject({
			refresh_status: "partial",
			completed_sessions: 8,
			metrics: { input_tokens: { value: 70, covered_sessions: 7 } },
		});
		late?.(detail("s0", 100));
		await Promise.resolve();
		expect((await usage.summary("member_a")).metrics.input_tokens.value).toBe(70);
		fetchDetail.mockImplementation(async (id) => detail(id));
		await session("s8", "member_a");
		expect((await usage.summary("member_a")).refresh_status).toBe("refreshing");
		await usage.refresh("member_a");
		expect(await usage.summary("member_a")).toMatchObject({
			session_count: 9,
			refresh_status: "idle",
			metrics: { input_tokens: { value: 90, covered_sessions: 9 } },
		});
	});

	it("缺失、零、远端不存在和查询失败分别显示；失败保留上次快照，恢复后更新", async () => {
		const { services, member, session } = setup();
		await member("member_a");
		await member("member_empty");
		for (const id of ["known-zero", "partial", "missing", "failed"]) await session(id, "member_a");
		const fetchDetail = vi.spyOn(services.gateway, "getSession").mockImplementation(async (id) => {
			if (id === "missing") return null;
			if (id === "failed") throw new Error("secret-provider-error");
			if (id === "partial") return { session_id: id, status: "idle", usage: { input_tokens: 5 } };
			return { session_id: id, status: "idle", usage: { input_tokens: 0, output_tokens: 0 } };
		});
		await services.memberUsage.refresh("member_a", true);
		const summary = await services.memberUsage.summary("member_a");
		expect(summary).toMatchObject({
			refresh_status: "partial",
			session_count: 4,
			metrics: {
				input_tokens: { value: 5, covered_sessions: 2 },
				output_tokens: { value: 0, covered_sessions: 1 },
				active_seconds: { value: null, covered_sessions: 0 },
			},
		});
		expect(JSON.stringify(summary)).not.toContain("secret");
		const rows = (await services.memberUsage.list("member_a", { limit: 20 })).data;
		expect(rows.find((row) => row.session_id === "missing")?.collection_status).toBe("not_found");
		expect(rows.find((row) => row.session_id === "failed")?.collection_status).toBe("failed");
		fetchDetail.mockRejectedValue(new Error("offline"));
		await services.memberUsage.refresh("member_a", true);
		expect((await services.memberUsage.summary("member_a")).metrics.input_tokens.value).toBe(5);
		fetchDetail.mockImplementation(async (id) => detail(id));
		await services.memberUsage.refresh("member_a", true);
		expect(await services.memberUsage.summary("member_a")).toMatchObject({
			refresh_status: "idle",
			metrics: { input_tokens: { value: 40, covered_sessions: 4 } },
		});
		await services.memberUsage.refresh("member_empty");
		expect(await services.memberUsage.summary("member_empty")).toMatchObject({
			session_count: 0,
			metrics: { input_tokens: { value: 0, covered_sessions: 0 } },
		});
	});

	it("删除快照持久化后抵抗迟到刷新，删除成功仍计入总量；解封重试也不接受旧响应", async () => {
		const { services, member, session, usageStore, dataDir } = setup();
		await member("member_a");
		await session("deleted", "member_a");
		await session("retry", "member_a");
		await usageStore.syncMember("member_a");
		const oldDeletedRevision = (await usageStore.beginCapture("deleted")) as number;
		const oldRetryRevision = (await usageStore.beginCapture("retry")) as number;
		await services.memberUsage.captureFinal("deleted", detail("deleted", 30));
		await services.memberUsage.markDeleted("deleted");
		await services.memberUsage.captureFinal("retry", detail("retry", 40));
		await services.memberUsage.releaseFinal("retry");
		expect(await usageStore.save("deleted", { input_tokens: 1 }, "running", oldDeletedRevision)).toBe(false);
		expect(await usageStore.save("retry", { input_tokens: 1 }, "running", oldRetryRevision)).toBe(false);
		expect(await services.sessionIndex.get("deleted")).toBeNull();
		expect(await usageStore.summary("member_a")).toMatchObject({
			session_count: 2,
			deleted_session_count: 1,
			metrics: { input_tokens: { value: 70, covered_sessions: 2 } },
		});
		const reopened = openDatabase(dataDir);
		cleanup.push(() => reopened.close());
		const recovered = createSessionUsageStore(createSqliteDatabase(reopened));
		expect((await recovered.summary("member_a")).metrics.input_tokens.value).toBe(70);
		expect(
			(await recovered.list("member_a", { limit: 20 })).data.find((row) => row.session_id === "deleted")?.deleted_at,
		).toBeTruthy();
	});

	it("读取同步不让本地过期running覆盖采集后的idle或已封存状态", async () => {
		const { services, member, session } = setup();
		await member("member_a");
		await session("s", "member_a");
		await services.sessionIndex.setStatus("s", "running");
		vi.spyOn(services.gateway, "getSession").mockImplementation(async (id) => detail(id));
		await services.memberUsage.refresh("member_a", true);
		await services.memberUsage.summary("member_a");
		expect((await services.memberUsage.list("member_a", { limit: 20 })).data[0]?.status).toBe("idle");
		await services.memberUsage.captureFinal("s", { ...detail("s"), status: "terminated" });
		await services.memberUsage.summary("member_a");
		expect((await services.memberUsage.list("member_a", { limit: 20 })).data[0]?.status).toBe("terminated");
		expect(await services.memberUsage.hasFinalSnapshot("s")).toBe(true);
	});

	it("缺少主要用量或SQLite提交失败不能封存，已有值与会话索引保留", async () => {
		const { services, member, session, usageStore, db } = setup();
		await member("member_a");
		await session("s", "member_a");
		await expect(services.memberUsage.captureFinal("s", { session_id: "s", status: "idle" })).rejects.toThrow(
			"有效的最终会话用量",
		);
		await usageStore.syncMember("member_a");
		db.exec(
			"CREATE TRIGGER reject_snapshot BEFORE UPDATE ON kit_session_usage BEGIN SELECT RAISE(ABORT, 'test write failure'); END;",
		);
		await expect(services.memberUsage.captureFinal("s", detail("s"))).rejects.toThrow("test write failure");
		expect(await services.memberUsage.hasFinalSnapshot("s")).toBe(false);
		expect(await services.sessionIndex.get("s")).not.toBeNull();
		await expect(services.memberUsage.markDeleted("s")).rejects.toThrow("先成功保存");
	});

	it("管理端列表和详情合同，auditor可读，非管理员拒绝，游标绑定成员与Agent", async () => {
		const { services, member, session, app } = setup();
		await member("member_a");
		await member("member_b");
		await session("s1", "member_a");
		await session("s2", "member_a");
		vi.spyOn(services.gateway, "getSession").mockImplementation(async (id) => detail(id));
		await services.memberUsage.refresh("member_a", true);
		await services.memberUsage.refresh("member_b", true);
		const list = await app.request("/api/admin/members", { headers: admin });
		expect(list.status).toBe(200);
		expect(
			((await list.json()) as MembersPage).data.find((row) => row.member_id === "member_a")?.usage_summary
				?.session_count,
		).toBe(2);
		const usage = await app.request("/api/admin/members/member_a/usage", { headers: auditor });
		expect(usage.status).toBe(200);
		expect(usage.headers.get("cache-control")).toBe("no-store");
		expect(((await usage.json()) as { data: MemberUsageSummary }).data.metrics.input_tokens.value).toBe(20);
		expect((await app.request("/api/admin/members/member_a/usage")).status).toBe(401);
		expect(
			(await app.request("/api/admin/members/member_a/usage", { headers: { authorization: "Bearer member-invalid" } }))
				.status,
		).toBe(403);
		expect((await app.request("/api/admin/members/missing/usage", { headers: admin })).status).toBe(404);
		const page = await app.request("/api/admin/members/member_a/sessions?limit=1", { headers: auditor });
		const body = (await page.json()) as { next_cursor: string; data: unknown[] };
		expect(body.data).toHaveLength(1);
		expect(body.next_cursor).toBeTruthy();
		for (const path of [
			`member_b/sessions?cursor=${body.next_cursor}`,
			`member_a/sessions?agent_slug=other&cursor=${body.next_cursor}`,
			"member_a/sessions?cursor=bad",
		]) {
			expect((await app.request(`/api/admin/members/${path}`, { headers: admin })).status).toBe(400);
		}
	});

	it("模版用量以模版为主键：只统计从其上架条目发起的会话，旧条目会话不计入，0 会话模版也返回", async () => {
		const { services, member, session, db, app } = setup();
		await member("member_a");
		await member("member_b");
		// 模拟同智能体两个条目：只有模版上架条目计入，手动创建的旧条目会话不算。
		await services.catalog.create({
			slug: "template-tpl",
			display_name: "模版上架条目",
			remote_agent_id: "agent_x",
		});
		await services.catalog.setStatus("template-tpl", "listed");
		await services.catalog.create({ slug: "legacy-dup", display_name: "旧条目", remote_agent_id: "agent_x" });
		const templateStore = createTemplateStore(createSqliteDatabase(db));
		const created = await templateStore.create({
			name: "客服模版",
			remote_agent_id: "agent_x",
			remote_agent_name: "xktest",
			remote_environment_id: "env_x",
			remote_environment_name: "default",
			description: "",
			opening_remarks: "",
			suggested_prompts: [],
			files: [],
			memory_stores: [],
			vault_ids: [],
			category: "general",
		});
		await templateStore.saveListing(
			created.template_id,
			async () => (await services.catalog.getBySlug("template-tpl"))!,
		);
		await templateStore.create({
			name: "空闲模版",
			remote_agent_id: "agent_idle",
			remote_agent_name: "idle",
			remote_environment_id: "env_idle",
			remote_environment_name: "default",
			description: "",
			opening_remarks: "",
			suggested_prompts: [],
			files: [],
			memory_stores: [],
			vault_ids: [],
			category: "general",
		});
		await session("s1", "member_a", "legacy-dup");
		await session("s2", "member_b", "legacy-dup");
		await session("s3", "member_a", "template-tpl");
		await session("s5", "member_a", "template-tpl");
		await session("s4", "member_a", "ghost-slug");
		await services.memberUsage.captureFinal("s1", detail("s1", 10));
		await services.memberUsage.captureFinal("s2", detail("s2", 20));
		await services.memberUsage.captureFinal("s3", detail("s3", 5));
		await services.memberUsage.captureFinal("s5", detail("s5", 7));
		await services.memberUsage.markDeleted("s5");

		const rows = await services.memberUsage.summaryByTemplate();
		expect(rows.map((row) => row.name)).toEqual(["客服模版", "空闲模版"]);
		expect(rows[0]).toMatchObject({
			template_id: created.template_id,
			name: "客服模版",
			remote_agent_id: "agent_x",
			remote_agent_name: "xktest",
			listing_status: "listed",
			session_count: 2,
			deleted_session_count: 1,
			metrics: { input_tokens: { value: 12, covered_sessions: 2 } },
		});
		expect(rows[1]).toMatchObject({
			name: "空闲模版",
			remote_agent_id: "agent_idle",
			listing_status: "unlisted",
			session_count: 0,
			metrics: { input_tokens: { value: 0, covered_sessions: 0 } },
		});

		// 模版软删标记独立于已删会话计数（SQL 同名列曾互相覆盖）：软删模版带 deleted，
		// 活模版即使有已删会话也不带标记。
		db.prepare("UPDATE kit_templates SET deleted_at = ? WHERE name = ?").run(new Date().toISOString(), "空闲模版");
		const after = await services.memberUsage.summaryByTemplate();
		expect(after[1]).toMatchObject({ name: "空闲模版", deleted: true, deleted_session_count: 0 });
		expect(after[0]!.deleted).toBeUndefined();

		// search 按模版名/智能体名（大小写不敏感）/模版 ID 过滤；LIKE 通配符按字面匹配。
		expect((await services.memberUsage.summaryByTemplate({ search: "客服" })).map((row) => row.name)).toEqual([
			"客服模版",
		]);
		expect((await services.memberUsage.summaryByTemplate({ search: "XKTEST" })).map((row) => row.name)).toEqual([
			"客服模版",
		]);
		expect((await services.memberUsage.summaryByTemplate({ search: "空闲" })).map((row) => row.name)).toEqual([
			"空闲模版",
		]);
		expect(await services.memberUsage.summaryByTemplate({ search: "不存在的模版" })).toEqual([]);
		expect(await services.memberUsage.summaryByTemplate({ search: "%" })).toEqual([]);

		const response = await app.request("/api/admin/usage/templates", { headers: auditor });
		expect(response.status).toBe(200);
		expect(
			((await response.json()) as { data: TemplateUsageRow[] }).data.some(
				(row) => row.name === "客服模版" && row.session_count === 2,
			),
		).toBe(true);
		const searched = await app.request(`/api/admin/usage/templates?search=${encodeURIComponent("客服")}`, {
			headers: auditor,
		});
		expect(searched.status).toBe(200);
		expect(((await searched.json()) as { data: TemplateUsageRow[] }).data.map((row) => row.name)).toEqual(["客服模版"]);
		expect((await app.request("/api/admin/usage/templates")).status).toBe(401);
	});

	it("模版会话明细跨成员返回上架条目的用量行并附带成员资料；游标与合同", async () => {
		const { services, member, session, db, app } = setup();
		await member("member_a");
		await member("member_b");
		await services.catalog.create({
			slug: "template-tpl",
			display_name: "模版上架条目",
			remote_agent_id: "agent_x",
		});
		const templateStore = createTemplateStore(createSqliteDatabase(db));
		const created = await templateStore.create({
			name: "客服模版",
			remote_agent_id: "agent_x",
			remote_agent_name: "xktest",
			remote_environment_id: "env_x",
			remote_environment_name: "default",
			description: "",
			opening_remarks: "",
			suggested_prompts: [],
			files: [],
			memory_stores: [],
			vault_ids: [],
			category: "general",
		});
		await templateStore.saveListing(
			created.template_id,
			async () => (await services.catalog.getBySlug("template-tpl"))!,
		);
		await session("s1", "member_a", "legacy-dup");
		await session("s2", "member_b", "template-tpl");
		await session("s3", "member_a", "template-tpl");
		await services.memberUsage.captureFinal("s1", detail("s1", 10));
		await services.memberUsage.captureFinal("s2", detail("s2", 20));
		await services.memberUsage.captureFinal("s3", detail("s3", 5));

		const page = await services.memberUsage.listByTemplate(created.template_id, { limit: 20 });
		expect(page.data.map((row) => [row.session_id, row.member_display_name, row.member_username])).toEqual([
			["s3", "member_a", "member_a"],
			["s2", "member_b", "member_b"],
		]);
		expect(page.next_cursor).toBeUndefined();
		expect(page.data.some((row) => row.session_id === "s1")).toBe(false);

		const first = await app.request(`/api/admin/usage/templates/${created.template_id}/sessions?limit=1`, {
			headers: auditor,
		});
		expect(first.status).toBe(200);
		const body = (await first.json()) as { data: TemplateSessionUsage[]; next_cursor?: string };
		expect(body.data).toHaveLength(1);
		expect(body.next_cursor).toBeTruthy();
		const second = await app.request(
			`/api/admin/usage/templates/${created.template_id}/sessions?limit=1&cursor=${body.next_cursor}`,
			{ headers: admin },
		);
		expect(second.status).toBe(200);
		expect(((await second.json()) as { data: unknown[] }).data).toHaveLength(1);
		expect(
			(await app.request(`/api/admin/usage/templates/${created.template_id}/sessions?cursor=bad`, { headers: admin }))
				.status,
		).toBe(400);
		expect((await app.request(`/api/admin/usage/templates/${created.template_id}/sessions`)).status).toBe(401);
		expect((await app.request("/api/admin/usage/templates/template_missing/sessions", { headers: admin })).status).toBe(
			404,
		);
	});

	it("模版限额路由：auditor 可读不可写，未设置返回不限量，模版不存在 404", async () => {
		const { services, db, app } = setup();
		await services.catalog.create({ slug: "tpl-l", display_name: "限额条目", remote_agent_id: "agent_z" });
		const templates = createTemplateStore(createSqliteDatabase(db));
		const created = await templates.create({
			name: "限额模版",
			remote_agent_id: "agent_z",
			remote_agent_name: "zagent",
			remote_environment_id: "env_z",
			remote_environment_name: "default",
			description: "",
			opening_remarks: "",
			suggested_prompts: [],
			files: [],
			memory_stores: [],
			vault_ids: [],
			category: "general",
		});
		await templates.saveListing(created.template_id, async () => (await services.catalog.getBySlug("tpl-l"))!);
		const path = `/api/admin/usage/templates/${created.template_id}/usage-limit`;
		const initial = await app.request(path, { headers: auditor });
		expect(initial.status).toBe(200);
		expect(((await initial.json()) as { data: { override: null } }).data.override).toBeNull();
		const put = await app.request(path, {
			method: "PUT",
			headers: { ...auditor, "content-type": "application/json" },
			body: JSON.stringify({ monthly_tokens: 10, monthly_active_seconds: null }),
		});
		expect(put.status).toBe(403);
		const putAdmin = await app.request(path, {
			method: "PUT",
			headers: { ...admin, "content-type": "application/json" },
			body: JSON.stringify({ monthly_tokens: 10, monthly_active_seconds: null }),
		});
		expect(putAdmin.status).toBe(200);
		expect(
			((await putAdmin.json()) as { data: { override: { monthly_tokens: number } } }).data.override.monthly_tokens,
		).toBe(10);
		expect((await app.request(path, { method: "DELETE", headers: admin })).status).toBe(200);
		expect(
			(await app.request("/api/admin/usage/templates/template_missing/usage-limit", { headers: admin })).status,
		).toBe(404);
	});

	it("模版用量逐日趋势路由：auditor 可读、days 校验、模版 404，只计模版上架条目", async () => {
		const { services, db, app, member } = setup();
		await member("member_a");
		await services.catalog.create({ slug: "trend-tpl", display_name: "趋势条目", remote_agent_id: "agent_t" });
		const templates = createTemplateStore(createSqliteDatabase(db));
		const created = await templates.create({
			name: "趋势模版",
			remote_agent_id: "agent_t",
			remote_agent_name: "tagent",
			remote_environment_id: "env_t",
			remote_environment_name: "default",
			description: "",
			opening_remarks: "",
			suggested_prompts: [],
			files: [],
			memory_stores: [],
			vault_ids: [],
			category: "general",
		});
		await templates.saveListing(created.template_id, async () => (await services.catalog.getBySlug("trend-tpl"))!);
		const usageDay = new Date().toISOString().slice(0, 10);
		const trendEntryId = (await services.catalog.getBySlug("trend-tpl"))!.id;
		db.prepare(
			"INSERT INTO kit_usage_limit_agent_days (catalog_entry_id, day, tokens, active_seconds) VALUES (?, ?, ?, ?)",
		).run(trendEntryId, usageDay, 120, 1.5);
		db.prepare(
			"INSERT INTO kit_usage_limit_agent_days (catalog_entry_id, day, tokens, active_seconds) VALUES (?, ?, ?, ?)",
		).run("cat-rogue", usageDay, 999, 9); // 未绑定模版上架的条目

		const response = await app.request(`/api/admin/usage/templates/daily-trend?template_id=${created.template_id}`, {
			headers: auditor,
		});
		expect(response.status).toBe(200);
		const body = (await response.json()) as { data: TemplateUsageTrend };
		expect(body.data.days).toBe(7);
		expect(body.data.data).toHaveLength(7);
		expect(body.data.data.at(-1)?.day).toBe(body.data.to_day); // 零值补全到今天（UTC 日键）
		expect(body.data.data.filter((point) => point.tokens > 0)).toEqual([
			{ day: usageDay, tokens: 120, active_seconds: 1.5 },
		]);
		// 「全部」视角（缺省 template_id）聚合全部模版条目，非模版条目不计入。
		const all = await app.request("/api/admin/usage/templates/daily-trend?days=14", { headers: auditor });
		expect(all.status).toBe(200);
		const allBody = (await all.json()) as { data: TemplateUsageTrend };
		expect(allBody.data.days).toBe(14);
		expect(allBody.data.data.reduce((sum, point) => sum + point.tokens, 0)).toBe(120);

		expect((await app.request("/api/admin/usage/templates/daily-trend?days=5", { headers: admin })).status).toBe(400);
		expect(
			(await app.request("/api/admin/usage/templates/daily-trend?template_id=missing", { headers: admin })).status,
		).toBe(404);
		expect((await app.request("/api/admin/usage/templates/daily-trend")).status).toBe(401);
	});

	// 条目软删保留用量候选：展示名按会话绑定的条目解析并携带 deleted；slug 复用不串旧会话的归属。
	it("成员用量候选：条目软删后带 deleted 标记，slug 复用不串旧会话归属", async () => {
		const { db, services, member, session } = setup();
		await member("member_a");
		const now0 = new Date().toISOString();
		db.prepare(
			"INSERT INTO catalog_agents (id, slug, display_name, remote_agent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
		).run("cat-del", "old-agent", "旧条目", "agent-a", now0, now0);
		await session("s-old", "member_a", "old-agent");
		vi.spyOn(services.gateway, "getSession").mockImplementation(async (id) => detail(id));
		await services.memberUsage.refresh("member_a", true);
		expect((await services.memberUsage.summary("member_a")).agents).toEqual([
			{ slug: "old-agent", display_name: "旧条目" },
		]);
		db.prepare("UPDATE catalog_agents SET deleted_at = ? WHERE id = ?").run(new Date().toISOString(), "cat-del");
		expect((await services.memberUsage.summary("member_a")).agents).toEqual([
			{ slug: "old-agent", display_name: "旧条目", deleted: true },
		]);
		// 同 slug 新条目不复用为旧会话的身份：旧会话仍解析到已删旧条目。
		const now1 = new Date().toISOString();
		db.prepare(
			"INSERT INTO catalog_agents (id, slug, display_name, remote_agent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
		).run("cat-new", "old-agent", "新条目", "agent-a", now1, now1);
		expect((await services.memberUsage.summary("member_a")).agents).toEqual([
			{ slug: "old-agent", display_name: "旧条目", deleted: true },
		]);
		// 新会话绑定新条目；展示名按最新会话的条目解析，切到新条目且不带已删标记。
		await session("s-new", "member_a", "old-agent");
		await services.memberUsage.refresh("member_a", true);
		expect((await services.memberUsage.summary("member_a")).agents).toEqual([
			{ slug: "old-agent", display_name: "新条目" },
		]);
	});

	it("模型/工具用量汇总：auditor 可读、维度映射与时间格式校验", async () => {
		const { db, services, app, member, session } = setup();
		let captured: UsageSummaryRequest | undefined;
		const original = services.gateway.getUsageSummary.bind(services.gateway);
		services.gateway.getUsageSummary = async (request) => {
			captured = request;
			return original(request);
		};

		expect((await app.request("/api/admin/usage/summary")).status).toBe(401);

		// mock 遥测以本地账本为源，且只算模版上架条目的会话：登记模版条目会话与一条手动条目会话。
		// 两者都属于 member_a、各采集一次快照（输入 10）；只有模版条目的会话应进入明细。
		await member("member_a");
		const now0 = new Date().toISOString();
		db.prepare(
			"INSERT INTO catalog_agents (id, slug, display_name, remote_agent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
		).run("cat-t1", "template_t1", "模版条目", "agent-a", now0, now0);
		db.prepare(
			"INSERT INTO kit_templates (template_id, name, remote_agent_id, remote_agent_name, config_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		).run("t1", "模版一", "agent-a", "agent-a", "{}", now0);
		db.prepare("INSERT INTO kit_template_listings (template_id, catalog_id) VALUES (?, ?)").run("t1", "cat-t1");
		await session("s-template", "member_a", "template_t1");
		await session("s-manual", "member_a", "agent-manual");
		vi.spyOn(services.gateway, "getSession").mockImplementation(async (id) => detail(id));
		await services.memberUsage.refresh("member_a", true);
		// 成员筛选候选带 catalog 展示名；未登记 catalog 条目的 agent 回落 null。
		expect((await services.memberUsage.summary("member_a")).agents).toEqual([
			{ slug: "agent-manual", display_name: null },
			{ slug: "template_t1", display_name: "模版条目" },
		]);

		const now = Date.now();
		const ok = await app.request(`/api/admin/usage/summary?start_time=${now - 3_600_000}&end_time=${now}`, {
			headers: auditor,
		});
		expect(ok.status).toBe(200);
		const summary = (await ok.json()) as { data: UsageSummary };
		// 全量只含模版条目的那 1 个会话（输入 10），手动条目的 10 个 input 不计入。
		expect(summary.data.usage.models[0]?.usage.input_tokens.value).toBe(10);
		expect(summary.data.usage.models[0]?.usage.call_count.value).toBe(1);
		expect(summary.data.usage.total.model_call_count.value).toBe(1);
		// 未传 agent_id/session_id：模版口径扇出——逐模版绑定智能体以 agent 维度查询，时间统一成 UTC+8 RFC 3339 字符串。
		expect(captured?.dimension).toBe("agent");
		expect(captured?.agent_id).toBe("agent-a");
		expect(captured?.time_range?.start_time).toMatch(/\+08:00$/);
		expect(captured?.time_range?.end_time).toMatch(/\+08:00$/);
		const range = captured?.time_range;
		expect(Boolean(range && range.start_time < range.end_time)).toBe(true);

		// agent 归集：模版上架条目的会话命中，手动条目与无关智能体都不命中。
		const scoped = await app.request("/api/admin/usage/summary?agent_id=agent-a", { headers: auditor });
		expect(((await scoped.json()) as { data: UsageSummary }).data.usage.models).toHaveLength(1);
		expect(captured).toMatchObject({ dimension: "agent", agent_id: "agent-a" });
		const manual = await app.request("/api/admin/usage/summary?agent_id=agent-manual", { headers: auditor });
		expect(((await manual.json()) as { data: UsageSummary }).data.usage.models).toHaveLength(0);
		const missed = await app.request("/api/admin/usage/summary?agent_id=agent-missing", { headers: auditor });
		expect(((await missed.json()) as { data: UsageSummary }).data.usage.models).toHaveLength(0);

		// session 维度：只传 dimension/session_id，不带 time_range 与 granularity。
		const sessionScoped = await app.request("/api/admin/usage/summary?session_id=sesn_abc", { headers: auditor });
		expect(sessionScoped.status).toBe(200);
		expect(captured).toEqual({ dimension: "session", session_id: "sesn_abc" });

		// 已删除会话（本地软删标记）不再打 Provider：返回零值空汇总，Provider 调用不变化。
		db.prepare("UPDATE kit_session_usage SET deleted_at = ?, status = 'deleted' WHERE session_id = ?").run(
			new Date().toISOString(),
			"s-template",
		);
		const deleted = await app.request("/api/admin/usage/summary?session_id=s-template", { headers: auditor });
		expect(deleted.status).toBe(200);
		expect(captured).toEqual({ dimension: "session", session_id: "sesn_abc" });
		const deletedSummary = ((await deleted.json()) as { data: UsageSummary }).data;
		expect(deletedSummary.usage.models).toHaveLength(0);
		expect(deletedSummary.usage.tools).toHaveLength(0);

		const reversed = await app.request(`/api/admin/usage/summary?start_time=${now}&end_time=${now - 3_600_000}`, {
			headers: admin,
		});
		expect(reversed.status).toBe(400);
		expect((await app.request("/api/admin/usage/summary?start_time=abc", { headers: admin })).status).toBe(400);

		// 工具明细与模型明细同在响应里（mock 演示轮数 → builtin 工具行）。
		const tools = await app.request("/api/admin/usage/summary", { headers: auditor });
		expect(tools.status).toBe(200);
		const toolSummary = (await tools.json()) as { data: UsageSummary };
		expect(toolSummary.data.usage.tools.length).toBeGreaterThan(0);
		expect(toolSummary.data.usage.tools[0]?.source).toBe("builtin");
	});

	it("用量汇总不依赖工作空间配置：sdk 模式只配基础凭据即可查询", async () => {
		const sdkOnly = setup({
			KIT_GATEWAY: "sdk",
			BAILIAN_API_KEY: "sk-telemetry",
			BAILIAN_BASE_URL: "https://provider.example.test/api/v1/agentstudio",
		});
		sdkOnly.db
			.prepare(
				"INSERT INTO kit_templates (template_id, name, remote_agent_id, remote_agent_name, config_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
			)
			.run("t-sdk", "sdk模版", "agent-a", "agent-a", "{}", new Date().toISOString());
		const captured: UsageSummaryRequest[] = [];
		// 这里只验证路由组装，响应体用最小占位对象（不关心具体指标）。
		const stub = { request_id: "req_stub", data: {} } as unknown as UsageSummaryResponse;
		vi.spyOn(sdkOnly.services.gateway, "getUsageSummary").mockImplementation(async (request) => {
			captured.push(request);
			return stub;
		});
		const ok = await sdkOnly.app.request("/api/admin/usage/summary", { headers: auditor });
		expect(ok.status).toBe(200);
		// 无 agent_id 时按模版口径扇出：该模版绑定 agent-a，以 agent 维度查询。
		expect(captured[0]).toMatchObject({ dimension: "agent", agent_id: "agent-a" });
		expect(captured[0]?.time_range?.start_time).toMatch(/\+08:00$/);

		const agent = await sdkOnly.app.request("/api/admin/usage/summary?agent_id=agent-a", { headers: auditor });
		expect(agent.status).toBe(200);
		expect(captured[1]).toMatchObject({ dimension: "agent", agent_id: "agent-a" });
	});

	it("用量趋势：auditor 可读、维度映射、分页聚合与过期令牌整轮重查", async () => {
		const { db, services, app } = setup();
		// 全部口径按模版绑定智能体扇出：本测试用单模版固定扇出目标为 agent-a。
		db.prepare(
			"INSERT INTO kit_templates (template_id, name, remote_agent_id, remote_agent_name, config_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		).run("t-trend", "趋势模版", "agent-a", "agent-a", "{}", new Date().toISOString());
		/** 最小占位的 Provider trend 页（路由组装测试不关心具体指标）。 */
		function trendPage(days: string[], overrides: Partial<UsageTrend> = {}): UsageTrendResponse {
			return {
				request_id: "req_stub",
				data: {
					query_range: { start_time: "2026-11-11T00:00:00+08:00", end_time: "2026-11-18T00:00:00+08:00" },
					data_updated_at: null,
					granularity: "day",
					points: days.map((day) => ({
						start_time: day,
						end_time: day,
						usage: { total: {}, models: [], tools: [] },
					})),
					has_more: false,
					next_page_token: null,
					...overrides,
				},
			} as unknown as UsageTrendResponse;
		}
		let captured: UsageTrendRequest[] = [];
		let pages: UsageTrendResponse[] = [];
		let failOnCall: number | null = null;
		vi.spyOn(services.gateway, "getUsageTrend").mockImplementation(async (request) => {
			captured.push(request);
			if (captured.length === failOnCall) throw new ApiError(410, "page token expired", "usage.trend");
			const page = pages[captured.length - 1];
			if (!page) throw new Error(`测试脚本缺少第 ${captured.length} 页响应`);
			return page;
		});

		expect((await app.request("/api/admin/usage/trend")).status).toBe(401);

		// 维度映射：缺省为模版口径扇出（此处单模版 → agent-a）+ 缺省 day 粒度 + page_size 100；agent_id → agent 维度；granularity 原样透传。
		pages = [
			trendPage(["2026-11-17T00:00:00+08:00"]),
			trendPage(["2026-11-17T00:00:00+08:00"]),
			trendPage(["2026-11-17T10:00:00+08:00"]),
		];
		const ok = await app.request("/api/admin/usage/trend", { headers: auditor });
		expect(ok.status).toBe(200);
		const body = (await ok.json()) as { data: UsageTrend };
		expect(body.data.points.map((point) => point.start_time)).toEqual(["2026-11-17T00:00:00+08:00"]);
		expect(body.data.granularity).toBe("day");
		expect(body.data.has_more).toBe(false);
		expect(body.data.next_page_token).toBeNull();
		expect(captured[0]).toMatchObject({ dimension: "agent", agent_id: "agent-a", granularity: "day", page_size: 100 });
		expect(captured[0]?.time_range?.start_time).toMatch(/\+08:00$/);
		const agent = await app.request("/api/admin/usage/trend?agent_id=agent-a", { headers: auditor });
		expect(agent.status).toBe(200);
		expect(captured[1]).toMatchObject({ dimension: "agent", agent_id: "agent-a", granularity: "day" });
		const hourly = await app.request("/api/admin/usage/trend?granularity=hour", { headers: auditor });
		expect(hourly.status).toBe(200);
		expect(captured[2]).toMatchObject({ dimension: "agent", agent_id: "agent-a", granularity: "hour" });
		expect((await app.request("/api/admin/usage/trend?granularity=week", { headers: auditor })).status).toBe(400);
		const now = Date.now();
		const reversed = await app.request(`/api/admin/usage/trend?start_time=${now}&end_time=${now - 3_600_000}`, {
			headers: admin,
		});
		expect(reversed.status).toBe(400);

		// 分页聚合：page_token 透传续页，points 顺序合并，响应不再暴露分页字段。
		captured = [];
		pages = [
			trendPage(["2026-11-16T00:00:00+08:00"], { has_more: true, next_page_token: "token-2" }),
			trendPage(["2026-11-17T00:00:00+08:00"]),
		];
		const merged = await app.request("/api/admin/usage/trend", { headers: auditor });
		expect(merged.status).toBe(200);
		const mergedBody = (await merged.json()) as { data: UsageTrend };
		expect(mergedBody.data.points.map((point) => point.start_time)).toEqual([
			"2026-11-16T00:00:00+08:00",
			"2026-11-17T00:00:00+08:00",
		]);
		expect(captured[1]?.page_token).toBe("token-2");

		// page_token 过期（Provider 410）：清空聚合，从第一页整轮重查一次（重查请求不带 page_token）。
		captured = [];
		failOnCall = 2;
		pages = [
			trendPage(["2026-11-16T00:00:00+08:00"], { has_more: true, next_page_token: "expired" }),
			trendPage(["2026-11-17T00:00:00+08:00"]),
			trendPage(["2026-11-17T00:00:00+08:00"]),
		];
		const retried = await app.request("/api/admin/usage/trend", { headers: auditor });
		expect(retried.status).toBe(200);
		const retriedBody = (await retried.json()) as { data: UsageTrend };
		expect(retriedBody.data.points.map((point) => point.start_time)).toEqual(["2026-11-17T00:00:00+08:00"]);
		expect(captured.map((request) => request.page_token ?? null)).toEqual([null, "expired", null]);

		// has_more 而无游标：拒绝 502 provider_error，不静默截断。
		captured = [];
		failOnCall = null;
		pages = [trendPage([], { has_more: true, next_page_token: null })];
		const broken = await app.request("/api/admin/usage/trend", { headers: auditor });
		expect(broken.status).toBe(502);
		expect(((await broken.json()) as { error: { code: string } }).error.code).toBe("provider_error");
	});

	it("全部用量 = 各模版绑定智能体求和：扇出 agent 维度、非模版智能体不查询、时间桶与明细合并", async () => {
		const { db, services, app } = setup();
		function stubModel(name: string, input: number, calls: number): UsageModelRow {
			return {
				model_name: name,
				usage: {
					input_tokens: metricOf(input, "tokens"),
					output_tokens: metricOf(0, "tokens"),
					total_tokens: metricOf(input, "tokens"),
					cache_read_tokens: metricOf(0, "tokens"),
					cache_creation_tokens: metricOf(0, "tokens"),
					cache_hit_ratio: metricOf(0, "ratio"),
					call_count: metricOf(calls),
					failed_count: metricOf(0),
				},
			};
		}
		function stubTool(source: string, name: string, calls: number): UsageToolRow {
			return { source, tool_name: name, usage: { call_count: metricOf(calls), failed_count: metricOf(0) } };
		}
		const summaryByAgent: Record<string, UsageSummary> = {
			"agent-a": {
				query_range: { start_time: "2026-11-11T00:00:00+08:00", end_time: "2026-11-18T00:00:00+08:00" },
				data_updated_at: "2026-11-18T09:00:00+08:00",
				usage: {
					total: stubTotal(100, 2),
					models: [stubModel("qwen-max", 100, 2)],
					tools: [stubTool("builtin", "web_search", 2)],
				},
			},
			"agent-b": {
				query_range: { start_time: "2026-11-11T00:00:00+08:00", end_time: "2026-11-18T00:00:00+08:00" },
				data_updated_at: "2026-11-18T10:00:00+08:00",
				usage: {
					total: stubTotal(50, 1),
					models: [stubModel("qwen-max", 50, 1)],
					tools: [stubTool("builtin", "web_search", 1), stubTool("mcp", "memory_search", 2)],
				},
			},
		};
		const summaryRequests: UsageSummaryRequest[] = [];
		vi.spyOn(services.gateway, "getUsageSummary").mockImplementation(async (request) => {
			summaryRequests.push(request);
			if (request.dimension !== "agent" || !request.agent_id || !summaryByAgent[request.agent_id])
				throw new Error("全部口径只能按模版绑定智能体以 agent 维度查询");
			return { request_id: "req_stub", data: summaryByAgent[request.agent_id] } as UsageSummaryResponse;
		});

		// 无模版绑定时返回零值汇总，不发出任何请求。
		const bare = await app.request("/api/admin/usage/summary", { headers: auditor });
		expect(bare.status).toBe(200);
		const bareBody = (await bare.json()) as { data: UsageSummary };
		expect(bareBody.data.usage.models).toEqual([]);
		expect(bareBody.data.usage.total.input_tokens).toEqual(metricOf(0, "tokens"));
		expect(summaryRequests).toHaveLength(0);

		// 两个模版分别绑定 agent-a/agent-b；未绑定模版的 agent-rogue 不应被查询。
		const now = new Date().toISOString();
		const insertTemplate = db.prepare(
			"INSERT INTO kit_templates (template_id, name, remote_agent_id, remote_agent_name, config_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		);
		insertTemplate.run("t1", "模版一", "agent-a", "agent-a", "{}", now);
		insertTemplate.run("t2", "模版二", "agent-b", "agent-b", "{}", now);

		const all = await app.request("/api/admin/usage/summary", { headers: auditor });
		expect(all.status).toBe(200);
		const body = (await all.json()) as { data: UsageSummary };
		expect(summaryRequests.map((request) => request.agent_id).sort()).toEqual(["agent-a", "agent-b"]);
		expect(body.data.usage.total.input_tokens).toEqual(metricOf(150, "tokens"));
		expect(body.data.usage.total.model_call_count).toEqual(metricOf(3));
		expect(body.data.usage.models).toHaveLength(1);
		expect(body.data.usage.models[0]?.model_name).toBe("qwen-max");
		expect(body.data.usage.models[0]?.usage.input_tokens).toEqual(metricOf(150, "tokens"));
		expect(body.data.usage.tools).toHaveLength(2);
		expect(body.data.usage.tools.find((row) => row.tool_name === "web_search")?.usage.call_count).toEqual(metricOf(3));
		expect(body.data.usage.tools.find((row) => row.tool_name === "memory_search")?.usage.call_count).toEqual(
			metricOf(2),
		);

		// 趋势同口径：时间桶求和、缺口并集升序。
		const trendByAgent: Record<string, UsageTrend> = {
			"agent-a": {
				query_range: { start_time: "2026-11-11T00:00:00+08:00", end_time: "2026-11-18T00:00:00+08:00" },
				data_updated_at: null,
				granularity: "day",
				points: [
					{
						start_time: "2026-11-17T00:00:00+08:00",
						end_time: "2026-11-18T00:00:00+08:00",
						usage: { total: stubTotal(100, 1), models: [], tools: [] },
					},
				],
				has_more: false,
				next_page_token: null,
			},
			"agent-b": {
				query_range: { start_time: "2026-11-11T00:00:00+08:00", end_time: "2026-11-18T00:00:00+08:00" },
				data_updated_at: null,
				granularity: "day",
				points: [
					{
						start_time: "2026-11-17T00:00:00+08:00",
						end_time: "2026-11-18T00:00:00+08:00",
						usage: { total: stubTotal(50, 1), models: [], tools: [] },
					},
					{
						start_time: "2026-11-18T00:00:00+08:00",
						end_time: "2026-11-19T00:00:00+08:00",
						usage: { total: stubTotal(20, 1), models: [], tools: [] },
					},
				],
				has_more: false,
				next_page_token: null,
			},
		};
		const trendRequests: UsageTrendRequest[] = [];
		vi.spyOn(services.gateway, "getUsageTrend").mockImplementation(async (request) => {
			trendRequests.push(request);
			if (request.dimension !== "agent" || !request.agent_id || !trendByAgent[request.agent_id])
				throw new Error("全部口径只能按模版绑定智能体以 agent 维度查询");
			return { request_id: "req_stub", data: trendByAgent[request.agent_id] } as UsageTrendResponse;
		});
		const trend = await app.request("/api/admin/usage/trend", { headers: auditor });
		expect(trend.status).toBe(200);
		const trendBody = (await trend.json()) as { data: UsageTrend };
		expect(trendRequests.map((request) => request.agent_id).sort()).toEqual(["agent-a", "agent-b"]);
		expect(trendBody.data.points.map((entry) => entry.start_time)).toEqual([
			"2026-11-17T00:00:00+08:00",
			"2026-11-18T00:00:00+08:00",
		]);
		expect(trendBody.data.points[0]?.usage.total.input_tokens).toEqual(metricOf(150, "tokens"));
		expect(trendBody.data.points[1]?.usage.total.input_tokens).toEqual(metricOf(20, "tokens"));
	});

	// 「全部」口径部分成功：单个模版绑定智能体查询失败返回已成功部分的合并并标注 coverage，不打挂请求。
	it("全部用量部分成功：失败智能体标注 coverage，汇总与趋势均返回已成功合并", async () => {
		const { db, services, app } = setup();
		const now = new Date().toISOString();
		const insertTemplate = db.prepare(
			"INSERT INTO kit_templates (template_id, name, remote_agent_id, remote_agent_name, config_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		);
		insertTemplate.run("t1", "模版一", "agent-a", "agent-a", "{}", now);
		insertTemplate.run("t2", "模版二", "agent-b", "agent-b", "{}", now);

		vi.spyOn(services.gateway, "getUsageSummary").mockImplementation(async (request) => {
			if (request.agent_id === "agent-a")
				return {
					request_id: "req_stub",
					data: {
						query_range: { start_time: "2026-11-11T00:00:00+08:00", end_time: "2026-11-18T00:00:00+08:00" },
						data_updated_at: null,
						usage: { total: stubTotal(100, 2), models: [], tools: [] },
					},
				} as UsageSummaryResponse;
			throw new Error("agent-b 查询失败");
		});
		const all = await app.request("/api/admin/usage/summary", { headers: auditor });
		expect(all.status).toBe(200);
		const body = (await all.json()) as { data: UsageSummary };
		expect(body.data.usage.total.input_tokens).toEqual(metricOf(100, "tokens"));
		expect(body.data.coverage).toEqual({ complete: false, missing_agent_ids: ["agent-b"] });

		vi.spyOn(services.gateway, "getUsageTrend").mockImplementation(async (request) => {
			if (request.agent_id === "agent-a")
				return {
					request_id: "req_stub",
					data: {
						query_range: { start_time: "2026-11-11T00:00:00+08:00", end_time: "2026-11-18T00:00:00+08:00" },
						data_updated_at: null,
						granularity: "day",
						points: [
							{
								start_time: "2026-11-17T00:00:00+08:00",
								end_time: "2026-11-18T00:00:00+08:00",
								usage: { total: stubTotal(100, 1), models: [], tools: [] },
							},
						],
						has_more: false,
						next_page_token: null,
					},
				} as UsageTrendResponse;
			throw new Error("agent-b 趋势查询失败");
		});
		const trend = await app.request("/api/admin/usage/trend", { headers: auditor });
		expect(trend.status).toBe(200);
		const trendBody = (await trend.json()) as { data: UsageTrend };
		expect(trendBody.data.points[0]?.usage.total.input_tokens).toEqual(metricOf(100, "tokens"));
		expect(trendBody.data.coverage).toEqual({ complete: false, missing_agent_ids: ["agent-b"] });

		// 全部智能体都失败：返回零值汇总且 coverage 列出全部缺失来源。
		vi.spyOn(services.gateway, "getUsageSummary").mockRejectedValue(new Error("全部失败"));
		const none = await app.request("/api/admin/usage/summary", { headers: auditor });
		expect(none.status).toBe(200);
		const noneBody = (await none.json()) as { data: UsageSummary };
		expect(noneBody.data.usage.total.input_tokens).toEqual(metricOf(0, "tokens"));
		expect(noneBody.data.coverage).toEqual({ complete: false, missing_agent_ids: ["agent-a", "agent-b"] });
	});
});
