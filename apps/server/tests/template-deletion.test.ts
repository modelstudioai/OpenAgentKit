import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type ApplyRequest,
	type PlanResponse,
	TemplateInputSchema,
	type TemplateView,
} from "@openagentkit/sdk/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { createKitServices } from "../src/services/index.ts";
import { openDatabase } from "../src/store/db.ts";

const cleanup: (() => void)[] = [];
afterEach(() => {
	vi.restoreAllMocks();
	for (const close of cleanup.splice(0).reverse()) close();
});
const selected = {
	remote_agent_id: "agent_mock_assistant",
	remote_environment_id: "env_mock_analysis",
	category: "general" as const,
};
const admin = { authorization: "Bearer template-admin", "content-type": "application/json" };

function setup() {
	const dataDir = mkdtempSync(join(tmpdir(), "kit-template-delete-"));
	cleanup.push(() => rmSync(dataDir, { recursive: true, force: true }));
	const db = openDatabase(dataDir);
	cleanup.push(() => db.close());
	const config = loadConfig({
		KIT_GATEWAY: "mock",
		KIT_AUTH_MODE: "anonymous",
		KIT_DATA_DIR: dataDir,
		ADMIN_TOKEN: "template-admin",
		KIT_ADMIN_TOKENS: "other-admin:admin,auditor:auditor",
		KIT_RATE_LIMIT_RPS: "0",
	});
	const services = createKitServices(config, db);
	const app = createApp(services);
	function request(path: string, method: "POST" | "DELETE", body?: unknown, token = "template-admin") {
		return app.request(path, {
			method,
			headers: {
				authorization: `Bearer ${token}`,
				...(body !== undefined ? { "content-type": "application/json" } : {}),
			},
			...(body !== undefined ? { body: JSON.stringify(body) } : {}),
		});
	}
	async function save(name = "待删除模版", patch: Record<string, unknown> = {}) {
		return services.templates.create(
			{ name, ...selected, files: [], memory_stores: [], vault_ids: [], suggested_prompts: [], ...patch },
			"fixture",
		);
	}
	async function publish(template: TemplateView) {
		const display = { display_name: template.name };
		const plan = await services.templates.planListing(template.template_id, display, "fixture");
		return services.templates.listing(template.template_id, { ...display, ...confirmation(plan) }, "fixture");
	}
	async function plan(template: TemplateView): Promise<PlanResponse> {
		const response = await request(`/api/admin/templates/${template.template_id}/delete/plan`, "POST");
		expect(response.status, await response.clone().text()).toBe(200);
		return ((await response.json()) as { data: PlanResponse }).data;
	}
	function remove(template: TemplateView, input?: unknown, token?: string) {
		return request(`/api/admin/templates/${template.template_id}`, "DELETE", input, token);
	}
	function localRows(templateId: string) {
		return {
			templates: db.prepare("SELECT * FROM kit_templates WHERE template_id=?").all(templateId),
			versions: db.prepare("SELECT * FROM kit_template_versions WHERE template_id=? ORDER BY version").all(templateId),
			listings: db.prepare("SELECT * FROM kit_template_listings WHERE template_id=?").all(templateId),
		};
	}
	return { app, services, db, save, publish, plan, remove, request, localRows };
}

function confirmation(plan: PlanResponse): ApplyRequest {
	return { plan_id: plan.plan_id, confirm_token: plan.confirm_token };
}

describe("模版删除", () => {
	// 计划仅本地只读；软删只标记 deleted_at，配置、版本与关联行全部保留，管理面不可见。
	it("未关联模版可离线预览删除，确认后行保留且管理面不可见", async () => {
		const { app, services, save, plan, remove, localRows } = setup();
		const first = await save();
		const template = await services.templates.update(
			first.template_id,
			{
				...TemplateInputSchema.strip().parse(first),
				base_version: first.version,
				description: "保留在第二版的内容",
			},
			"fixture",
		);
		const before = localRows(template.template_id);
		expect(before.versions).toHaveLength(2);
		const remote = vi.spyOn(services.gateway, "listRemoteAgents").mockRejectedValue(new Error("Provider offline"));
		const prepared = await plan(template);
		expect(
			prepared.diff.some((item) => item.summary?.includes("标记删除") && item.summary?.includes("历史版本保留")),
		).toBe(true);
		expect(prepared.diff.some((item) => item.action === "noop" && item.summary?.includes("已有会话"))).toBe(true);
		expect(localRows(template.template_id)).toEqual(before);
		expect((await services.audit.list()).filter((row) => row.action === "templates.delete")).toEqual([]);
		const response = await remove(template, confirmation(prepared));
		expect(response.status, await response.clone().text()).toBe(200);
		expect(await response.json()).toEqual({ data: { deleted: true } });
		const after = localRows(template.template_id);
		expect(after.templates).toHaveLength(1);
		expect(after.templates[0]).toMatchObject({ template_id: template.template_id });
		expect((after.templates[0] as { deleted_at: string | null }).deleted_at).not.toBeNull();
		expect(after.versions).toHaveLength(2);
		expect((await app.request(`/api/admin/templates/${template.template_id}`, { headers: admin })).status).toBe(404);
		expect((await services.templates.list({ limit: 10 })).data).toEqual([]);
		expect(remote).not.toHaveBeenCalled();
		expect((await services.audit.list()).find((row) => row.action === "templates.delete")).toMatchObject({
			subject: expect.stringMatching(/^admin:admin:[0-9a-f]{8}$/),
			target: template.template_id,
			detail: JSON.stringify({ name: template.name }),
		});
	});

	// 关联条目随模版一起移除，员工已有Session仍可读；Provider删除与本地会话索引不受影响。
	it("删除已上架模版使公开目录消失，保留既有员工会话和远端资源", async () => {
		const { app, services, save, publish, plan, remove, localRows } = setup();
		const template = await save();
		const entry = await publish(template);
		const employee = { "content-type": "application/json", cookie: "kit_subject=template-delete-employee" };
		const started = await app.request("/api/kit/sessions", {
			method: "POST",
			headers: employee,
			body: JSON.stringify({ agent_slug: entry.slug }),
		});
		expect(started.status).toBe(201);
		const { data: session } = (await started.json()) as { data: { session_id: string } };
		const index = await services.sessionIndex.get(session.session_id);
		const deleteSession = vi.spyOn(services.gateway, "deleteSession");
		const prepared = await plan(template);
		expect(prepared.diff).toContainEqual(
			expect.objectContaining({ resource: `catalog:${entry.slug}`, action: "delete" }),
		);
		expect((await app.request(`/api/kit/agents/${entry.slug}`, { headers: employee })).status).toBe(200);
		expect((await remove(template, confirmation(prepared))).status).toBe(200);
		const after = localRows(template.template_id);
		expect(after.templates).toHaveLength(1);
		expect((after.templates[0] as { deleted_at: string | null }).deleted_at).not.toBeNull();
		expect(after.listings).toHaveLength(1);
		expect(await services.catalog.get(entry.id)).toMatchObject({ deleted: true });
		expect((await app.request(`/api/kit/agents/${entry.slug}`, { headers: employee })).status).toBe(404);
		expect(
			(
				await app.request("/api/kit/sessions", {
					method: "POST",
					headers: employee,
					body: JSON.stringify({ agent_slug: entry.slug }),
				})
			).status,
		).toBe(404);
		expect((await app.request(`/api/kit/sessions/${session.session_id}`, { headers: employee })).status).toBe(200);
		expect(await services.sessionIndex.get(session.session_id)).toEqual(index);
		expect(deleteSession).not.toHaveBeenCalled();
		expect(await services.gateway.getSession(session.session_id)).not.toBeNull();
	});

	// 确认严格绑定目标、主体和用途；失败不能消费另一主体/目标的有效计划，也不能复用已执行令牌。
	it("拒绝缺令牌、伪造、错主体或目标及重放，合法确认仅删目标模版", async () => {
		const { services, save, plan, remove } = setup();
		const template = await save();
		const other = await save("另一个模版", {
			remote_agent_id: "agent_mock_designer",
			remote_environment_id: "env_mock_default",
		});
		expect((await remove(template)).status).toBe(428);
		expect((await remove(template, {})).status).toBe(428);
		expect((await remove(template, { plan_id: "forged", confirm_token: "forged" })).status).toBe(428);
		const prepared = await plan(template);
		expect((await remove(template, confirmation(prepared), "other-admin")).status).toBe(428);
		expect((await remove(other, confirmation(prepared))).status).toBe(428);
		expect((await services.templates.list({ limit: 10 })).data).toHaveLength(2);
		expect((await remove(template, confirmation(prepared))).status).toBe(200);
		// 模版已软删：按不存在处理（404），不泄露令牌是否有效
		expect((await remove(template, confirmation(prepared))).status).toBe(404);
		expect(await services.templates.get(other.template_id)).toEqual(other);
	});

	// 计划之后任何模版版本或关联目录变化都需重新确认，不能删除用户未审阅的状态。
	it("编辑、上下架及目录运营信息变化使删除计划过期，未上架条目也可重新确认删除", async () => {
		const { services, save, publish, plan, remove } = setup();
		const first = await save();
		const oldVersionPlan = await plan(first);
		const template = await services.templates.update(
			first.template_id,
			{
				...TemplateInputSchema.strip().parse(first),
				base_version: first.version,
				description: "新版本",
			},
			"fixture",
		);
		expect((await remove(template, confirmation(oldVersionPlan))).status).toBe(409);
		const beforeListing = await plan(template);
		const entry = await publish(template);
		expect((await remove(template, confirmation(beforeListing))).status).toBe(409);
		const beforeUnlisting = await plan(template);
		await services.catalog.setStatus(entry.slug, "unlisted");
		expect((await remove(template, confirmation(beforeUnlisting))).status).toBe(409);
		const beforeEdit = await plan(template);
		await services.catalog.update(entry.id, { ordering: 42 });
		expect((await remove(template, confirmation(beforeEdit))).status).toBe(409);
		expect((await services.templates.get(template.template_id)).version).toBe(2);
		expect(await services.catalog.get(entry.id)).toMatchObject({ status: "unlisted", ordering: 42 });
		expect((await remove(template, confirmation(await plan(template)))).status).toBe(200);
		expect(await services.catalog.get(entry.id)).toMatchObject({ deleted: true });
	});

	// 在标记 deleted_at 时注入数据库失败，证明同事务的目录标记也会一起回滚。
	it("删除后半段失败会回滚全部软删标记", async () => {
		const { services, db, save, publish, plan, remove, localRows } = setup();
		const template = await save();
		const entry = await publish(template);
		const before = localRows(template.template_id);
		const prepared = await plan(template);
		db.exec(`CREATE TRIGGER fail_template_delete BEFORE UPDATE OF deleted_at ON kit_templates
			WHEN NEW.deleted_at IS NOT NULL
			BEGIN SELECT RAISE(ABORT, 'template delete failed'); END;`);
		expect((await remove(template, confirmation(prepared))).status).toBe(500);
		expect(localRows(template.template_id)).toEqual(before);
		expect(await services.catalog.get(entry.id)).toEqual(entry);
		expect((await services.audit.list()).filter((row) => row.action === "templates.delete")).toEqual([]);
	});

	// 编辑的 Provider 校验是异步窗口，删除可能在窗口内提交；写入事务必须复核 deleted_at，不能覆盖已删模版。
	it("编辑期间完成的删除在写入时被复核，在途更新按不存在拒绝", async () => {
		const { services, db, save, plan, remove } = setup();
		const template = await save("竞态删除模版");
		const listAgents = services.gateway.listRemoteAgents.bind(services.gateway);
		vi.spyOn(services.gateway, "listRemoteAgents").mockImplementation(async () => {
			const prepared = await plan(template);
			expect((await remove(template, confirmation(prepared))).status).toBe(200);
			return listAgents();
		});
		await expect(
			services.templates.update(
				template.template_id,
				{
					...TemplateInputSchema.strip().parse(template),
					base_version: template.version,
					description: "竞态窗口内的更新",
				},
				"fixture",
			),
		).rejects.toMatchObject({ code: "not_found", status: 404 });
		const after = db
			.prepare("SELECT version, deleted_at FROM kit_templates WHERE template_id=?")
			.get(template.template_id) as { version: number; deleted_at: string | null };
		expect(after.version).toBe(template.version);
		expect(after.deleted_at).not.toBeNull();
		expect((await services.audit.list()).filter((row) => row.action === "templates.update")).toEqual([]);
	});
});
