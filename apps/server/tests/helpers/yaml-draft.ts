import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ResourceDraftView } from "@openagentkit/sdk/protocol";
import { setDefaultFetch } from "@openagentpack/sdk";
import { afterEach, expect, vi } from "vitest";
import { loadConfig } from "../../src/config.ts";
import { KitResourceDraftDocumentsEntity } from "../../src/entity/tables/kit-resource-draft-documents.entity.ts";
import { KitResourceDraftsEntity } from "../../src/entity/tables/kit-resource-drafts.entity.ts";
import { openDatabase } from "../../src/store/db.ts";
import { createSqliteDatabase } from "../../src/store/sqlite.ts";
import { createTestApp as createApp } from "./http.ts";
import { createKitServices } from "./services.ts";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
	setDefaultFetch(undefined);
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	await Promise.all(cleanups.splice(0).map((fn) => fn()));
});

export async function fixture(mode: "sdk" | "mock" = "mock", mainName = "main") {
	const root = await mkdtemp(join(tmpdir(), "kit-yaml-draft-"));
	const main = join(root, mainName);
	await mkdir(main);
	await writeFile(join(main, "keep.txt"), "main must remain");
	const config = loadConfig({
		KIT_GATEWAY: mode,
		KIT_DATA_DIR: root,
		KIT_PROJECT_DIR: main,
		ADMIN_TOKEN: "admin-a",
		KIT_ADMIN_TOKENS: "admin-b:admin,audit:auditor",
		KIT_RATE_LIMIT_BURST: "1000",
		BAILIAN_API_KEY: "fixture-provider-secret",
		BAILIAN_BASE_URL: "https://fixtures.invalid/api/v1/agentstudio",
	});
	let db = await openDatabase(root);
	let services = createKitServices(config, db);
	let app = createApp(services);
	function document(id: string) {
		return createSqliteDatabase(db).read(
			async (manager) => (await manager.findOneBy(KitResourceDraftDocumentsEntity, { draft_id: id })) ?? undefined,
		);
	}
	function record(id: string) {
		return createSqliteDatabase(db).read((manager) => manager.findOneBy(KitResourceDraftsEntity, { draft_id: id }));
	}
	// 直接构造旧声明与 SDK 检查点，用于验证重开和历史数据的处理。
	function seedState(id: string, state: string) {
		db.prepare("UPDATE kit_resource_draft_documents SET sdk_state_json = ? WHERE draft_id = ?").run(state, id);
	}
	function seedYaml(id: string, revision: string, yaml: string) {
		const result = db
			.prepare(
				"UPDATE kit_resource_draft_documents SET yaml = ?, revision = revision + 1 WHERE draft_id = ? AND revision = ?",
			)
			.run(yaml, id, revision);
		expect(result.changes).toBe(1);
	}
	function onStateWrite(visit: (state: string) => void) {
		db.function("inspect_sdk_state", (state) => {
			visit(String(state));
			return null;
		});
		db.exec(`CREATE TEMP TRIGGER inspect_state BEFORE UPDATE OF sdk_state_json ON kit_resource_draft_documents
			BEGIN SELECT inspect_sdk_state(NEW.sdk_state_json); END`);
	}
	cleanups.push(async () => {
		if (db.isOpen) db.close();
		await rm(root, { recursive: true, force: true });
	});
	async function request(path: string, method = "GET", body?: unknown, token = "admin-a") {
		return app.request(path, {
			method,
			headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		});
	}
	async function value<T = Record<string, unknown>>(path: string, method = "GET", body?: unknown) {
		const response = await request(path, method, body);
		const payload = (await response.json()) as { data: T };
		expect(response.status, JSON.stringify(payload)).toBeLessThan(300);
		return payload.data;
	}
	const base = (draft: ResourceDraftView) => `/api/admin/resource-drafts/${draft.draft_id}/resources`;
	async function create() {
		return value<ResourceDraftView>("/api/admin/resource-drafts", "POST");
	}
	async function revision(draft: ResourceDraftView) {
		return (await value<{ project_revision: string }>(base(draft))).project_revision;
	}
	async function agent(draft: ResourceDraftView, instructions = "/literal prompt\n") {
		return value<{ agent: { id: string }; new_revision: string }>(`${base(draft)}/agents`, "POST", {
			base_revision: await revision(draft),
			name: "batch agent",
			model: "auto",
			instructions,
		});
	}
	async function plan(draft: ResourceDraftView) {
		return value<{ plan_id: string; confirm_token: string }>(`${base(draft)}/plan`, "POST", { action: "publish" });
	}
	async function publish(draft: ResourceDraftView, confirmation: { plan_id: string; confirm_token: string }) {
		return value<{ operation_id: string }>(`${base(draft)}/publish`, "POST", confirmation);
	}
	async function wait(id: string) {
		await vi.waitFor(async () =>
			expect(["succeeded", "failed"]).toContain((await services.operations.get(id))?.status),
		);
		return (await services.operations.get(id))!;
	}
	return {
		root,
		main,
		base,
		request,
		value,
		create,
		revision,
		agent,
		plan,
		publish,
		wait,
		get app() {
			return app;
		},
		get services() {
			return services;
		},
		document,
		record,
		seedState,
		seedYaml,
		onStateWrite,
		get db() {
			return db;
		},
		async restart() {
			db.close();
			db = await openDatabase(root);
			services = createKitServices(config, db);
			app = createApp(services);
		},
	};
}
