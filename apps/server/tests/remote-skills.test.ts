import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RemoteSkillReference } from "@openagentkit/sdk/protocol";
import { afterEach, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.ts";
import { openDatabase } from "../src/store/db.ts";
import { createTestApp as createApp } from "./helpers/http.ts";
import { createKitServices } from "./helpers/services.ts";
import { fixture } from "./helpers/yaml-draft.ts";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
	for (const close of cleanup.splice(0)) await close();
	vi.restoreAllMocks();
});

it("保存批次前复核精确 Skill 版本；空选择、重复或无效版本均不查询 Provider", async () => {
	const t = await fixture();
	const draft = await t.create();
	const spy = vi.spyOn(t.services.gateway, "getRemoteSkillVersion");
	const submit = async (name: string, skills: RemoteSkillReference[]) =>
		t.request(`${t.base(draft)}/agents`, "POST", {
			base_revision: await t.revision(draft),
			name,
			model: "auto",
			skills,
		});

	expect((await submit("empty-skills", [])).status).toBe(201);
	const reference: RemoteSkillReference = { type: "official", skill_id: "skill_mock_research", version: "1.0" };
	expect((await submit("duplicate", [reference, reference])).status).toBe(400);
	expect((await submit("latest", [{ ...reference, version: "latest" }])).status).toBe(400);
	expect(spy).not.toHaveBeenCalled();

	expect((await submit("valid", [reference])).status).toBe(201);
	expect(spy).toHaveBeenCalledWith(reference.skill_id, reference.version);
	expect(spy).toHaveBeenCalledTimes(1);
	for (const [name, skill, code] of [
		["mismatch", { ...reference, type: "custom" }, "invalid_request"],
		["unavailable", { type: "custom", skill_id: "skill_mock_checking", version: "1.0" }, "invalid_request"],
		["missing", { ...reference, version: "missing" }, "not_found"],
	] as const) {
		const response = await submit(name, [skill]);
		expect(await response.json()).toMatchObject({ error: { code } });
	}
});

it("管理员和auditor可读既有候选，未认证和非法来源不可访问，不增加远端资源或写入审计", async () => {
	const dataDir = await mkdtemp(join(tmpdir(), "kit-remote-skills-"));
	const config = loadConfig({
		KIT_GATEWAY: "mock",
		KIT_DATA_DIR: dataDir,
		ADMIN_TOKEN: "skill-admin",
		KIT_ADMIN_TOKENS: "skill-auditor:auditor",
		KIT_RATE_LIMIT_RPS: "0",
	});
	const db = openDatabase(dataDir);
	cleanup.push(async () => {
		db.close();
		await rm(dataDir, { recursive: true, force: true });
	});
	const services = createKitServices(config, db);
	const app = createApp(services);
	const before = await services.gateway.listRemoteSkills("official");
	expect(before).toContainEqual(expect.objectContaining({ skill_id: "skill_mock_research", available: true }));
	const audit = await services.audit.list();
	for (const token of ["skill-admin", "skill-auditor"]) {
		const response = await app.request("/api/admin/remote/skills?source=official", {
			headers: { authorization: `Bearer ${token}` },
		});
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(await response.json()).toEqual({ data: before });
	}
	expect((await app.request("/api/admin/remote/skills?source=official")).status).toBe(401);
	const spy = vi.spyOn(services.gateway, "listRemoteSkills");
	expect(
		(await app.request("/api/admin/remote/skills?source=unknown", { headers: { authorization: "Bearer skill-admin" } }))
			.status,
	).toBe(400);
	expect(spy).not.toHaveBeenCalled();
	expect(await services.gateway.listRemoteSkills("official")).toEqual(before);
	expect(await services.audit.list()).toEqual(audit);
});
