import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { openDatabase } from "../src/store/db.ts";
import { createFileStore } from "../src/store/files.ts";
import { createSessionIndex } from "../src/store/sessions.ts";
import { createSqliteDatabase } from "../src/store/sqlite.ts";
import { historicalSqlite } from "./helpers/historical-sqlite.ts";

it("升级真实旧会话/文件索引后保留员工数据，并持久隔离同 subject 的调试记录", async () => {
	const dataDir = mkdtempSync(join(tmpdir(), "kit-debug-migration-"));
	let db = historicalSqlite(dataDir, "006_legacy_file_ownership");
	try {
		db.exec(`
INSERT INTO kit_operations (operation_id,kind,status,error,created_at,updated_at)
 VALUES ('legacy-operation','publish','failed','historical failure','2026-10-20','2026-10-20');
INSERT INTO kit_sessions (session_id,subject_id,agent_slug,remote_agent_id,title,status,created_at,files_json)
 VALUES ('old-session','same-subject','assistant','remote-old','保留的会话','idle','2026-10-20','[{"file_id":"old-file"}]');
INSERT INTO kit_uploaded_files VALUES ('old-file','same-subject','2026-10-20');
`);
		db.close();
		db = openDatabase(dataDir);
		expect(
			db
				.prepare("SELECT error,publication_json,error_details_json FROM kit_operations WHERE operation_id=?")
				.get("legacy-operation"),
		).toMatchObject({ error: "historical failure", publication_json: null, error_details_json: null });
		const sessions = createSessionIndex(createSqliteDatabase(db));
		const files = createFileStore(createSqliteDatabase(db));
		expect((await sessions.getForSubject("old-session", "same-subject"))?.summary).toMatchObject({
			title: "保留的会话",
			agent_slug: "assistant",
		});
		expect((await sessions.getForSubject("old-session", "same-subject"))?.files).toEqual([{ file_id: "old-file" }]);
		expect(await files.isUploadedBy("old-file", "same-subject")).toBe(true);
		expect(await files.isUploadedBy("old-file", "same-subject", "admin_debug")).toBe(false);
		await sessions.create({
			sessionId: "debug-session",
			subjectId: "same-subject",
			purpose: "admin_debug",
			debug: {
				project_name: "project",
				agent_key: "assistant",
				remote_agent_id: "remote-debug",
				source_dirty: false,
			},
		});
		await files.recordUpload("debug-file", "same-subject", "admin_debug");
		db.close();
		db = openDatabase(dataDir);
		const reopened = createSessionIndex(createSqliteDatabase(db));
		expect((await reopened.listForSubject("same-subject")).map((row) => row.session_id)).toEqual(["old-session"]);
		expect(
			(await reopened.listDebugForSubject("same-subject", "project", "assistant")).map((row) => row.session_id),
		).toEqual(["debug-session"]);
		expect((await reopened.getDebugForSubject("debug-session", "same-subject"))?.summary.source_dirty).toBe(false);
		expect(await reopened.getForSubject("debug-session", "same-subject")).toBeNull();
		expect(await reopened.getDebugForSubject("old-session", "same-subject")).toBeNull();
		expect(await createFileStore(createSqliteDatabase(db)).isUploadedBy("debug-file", "same-subject")).toBe(false);
		expect(
			await createFileStore(createSqliteDatabase(db)).isUploadedBy("debug-file", "same-subject", "admin_debug"),
		).toBe(true);
	} finally {
		if (db.isOpen) db.close();
		rmSync(dataDir, { recursive: true, force: true });
	}
});

it("已有项目调试迁移后明确来源并保留原归属，允许无项目的模版调试持久化", async () => {
	const dataDir = mkdtempSync(join(tmpdir(), "kit-template-migration-"));
	let db = historicalSqlite(dataDir, "014_member_groups");
	try {
		db.exec(`
INSERT INTO kit_sessions VALUES ('project-debug','admin','admin_debug',NULL,'agent_remote','project','assistant','rev',0,'旧调试','idle','2026-10-20',NULL,'[]');
INSERT INTO kit_sessions VALUES ('employee','admin','experience','assistant','agent_remote',NULL,NULL,NULL,NULL,'员工会话','idle','2026-10-20',NULL,'[]');
`);
		db.close();
		db = openDatabase(dataDir);
		const index = createSessionIndex(createSqliteDatabase(db));
		expect((await index.getDebugForSubject("project-debug", "admin"))?.summary).toMatchObject({
			source: "project",
			project_name: "project",
			agent_key: "assistant",
			project_revision: "rev",
			source_dirty: false,
		});
		expect((await index.listForSubject("admin")).map((row) => row.session_id)).toEqual(["employee"]);
		await index.create({
			sessionId: "template-debug",
			subjectId: "admin",
			purpose: "admin_debug",
			debug: {
				source: "template",
				remote_agent_id: "agent_remote",
				remote_environment_id: "env_remote",
				vault_ids: ["vault_1"],
			},
		});
		db.close();
		db = openDatabase(dataDir);
		const reopened = createSessionIndex(createSqliteDatabase(db));
		expect(await reopened.getDebugForSubject("template-debug", "admin")).toMatchObject({
			summary: { source: "template", remote_environment_id: "env_remote" },
			runtime: { vault_ids: ["vault_1"] },
		});
		expect(await reopened.getDebugForSubject("template-debug", "other")).toBeNull();
		expect(await reopened.getForSubject("template-debug", "admin")).toBeNull();
	} finally {
		if (db.isOpen) db.close();
		rmSync(dataDir, { recursive: true, force: true });
	}
});

it("升级旧模版调试索引保留完整配置，允许默认环境但仍拒绝混淆用途和来源", async () => {
	const dataDir = mkdtempSync(join(tmpdir(), "kit-default-environment-migration-"));
	let db = historicalSqlite(dataDir, "015_template_debug_sessions");
	try {
		const previous = createSessionIndex(createSqliteDatabase(db));
		await previous.create({ sessionId: "employee", subjectId: "admin", agentSlug: "assistant" });
		await previous.create({
			sessionId: "project-debug",
			subjectId: "admin",
			purpose: "admin_debug",
			debug: { project_name: "project", agent_key: "assistant", remote_agent_id: "agent_remote" },
		});
		await previous.create({
			sessionId: "template-explicit",
			subjectId: "admin",
			purpose: "admin_debug",
			title: "环境覆盖",
			files: [{ file_id: "file_1", mount_path: "/mnt/file.txt" }],
			debug: {
				source: "template",
				remote_agent_id: "agent_remote",
				agent_version: 3,
				remote_environment_id: "env_remote",
				vault_ids: ["vault_1"],
			},
		});
		const originalRows = db.prepare("SELECT * FROM kit_sessions ORDER BY session_id").all();
		db.close();
		db = openDatabase(dataDir);
		expect(db.prepare("SELECT * FROM kit_sessions ORDER BY session_id").all()).toMatchObject(originalRows);
		const upgraded = createSessionIndex(createSqliteDatabase(db));
		await upgraded.create({
			sessionId: "template-default",
			subjectId: "admin",
			purpose: "admin_debug",
			debug: { source: "template", remote_agent_id: "agent_remote", agent_version: 3 },
		});
		expect((await upgraded.getDebugForSubject("template-default", "admin"))?.summary).not.toHaveProperty(
			"remote_environment_id",
		);
		expect(await upgraded.getForSubject("template-default", "admin")).toBeNull();
		expect(await upgraded.getDebugForSubject("template-default", "other")).toBeNull();
		expect((await upgraded.listForSubject("admin")).map((row) => row.session_id)).toEqual(["employee"]);
		for (const invalidUpdate of [
			"purpose='experience'",
			"debug_source='project'",
			"debug_source=NULL",
			"project_name='project'",
			"remote_agent_id=NULL",
		]) {
			expect(() => db.exec(`UPDATE kit_sessions SET ${invalidUpdate} WHERE session_id='template-default'`)).toThrow();
		}
		db.close();
		db = openDatabase(dataDir);
		expect(
			(await createSessionIndex(createSqliteDatabase(db)).getDebugForSubject("template-default", "admin"))?.runtime
				.agent_version,
		).toBe(3);
	} finally {
		if (db.isOpen) db.close();
		rmSync(dataDir, { recursive: true, force: true });
	}
});
