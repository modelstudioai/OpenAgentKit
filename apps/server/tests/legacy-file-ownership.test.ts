import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { createMockGateway } from "../src/gateway/mock.ts";
import { createFileService } from "../src/services/files.ts";
import { openDatabase } from "../src/store/db.ts";
import { createFileStore } from "../src/store/files.ts";
import { createSessionIndex } from "../src/store/sessions.ts";
import { createSqliteDatabase } from "../src/store/sqlite.ts";
import { historicalSqlite } from "./helpers/historical-sqlite.ts";

const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const close of cleanup.splice(0).reverse()) close();
});

/** 构造 004 / 005 时的持久库；旧挂载数据通过 Session 索引写入，不使用新上传归属接口。 */
function legacyDatabase(version: "004" | "005") {
	const dataDir = mkdtempSync(join(tmpdir(), "kit-legacy-files-"));
	cleanup.push(() => rmSync(dataDir, { recursive: true, force: true }));
	let db = historicalSqlite(dataDir, version === "004" ? "004_members" : "005_member_auth");
	cleanup.push(() => {
		if (db.isOpen) db.close();
	});
	return {
		get db() {
			return db;
		},
		reopen() {
			db.close();
			db = openDatabase(dataDir);
			return db;
		},
	};
}

function mount(db: DatabaseSync, sessionId: string, subjectId: string, fileId: string) {
	db.prepare(`INSERT INTO kit_sessions (session_id, subject_id, agent_slug, files_json, created_at)
		VALUES (?, ?, 'assistant', ?, ?)`).run(
		sessionId,
		subjectId,
		JSON.stringify([{ file_id: fileId, filename: "old.txt" }]),
		"2026-10-20",
	);
}

const owner = "anon_legacy_owner";
const other = "anon_other";

describe("历史附件归属升级", () => {
	it.each(["004", "005"] as const)("从 %s 升级后，原身份可下载和重新挂载旧文件，其他身份仍被拒", async (version) => {
		const legacy = legacyDatabase(version);
		const gateway = createMockGateway();
		const file = await gateway.uploadFile({ filename: "old.txt", bytes: new TextEncoder().encode("old contents") });
		mount(legacy.db, "session_before_upgrade", owner, file.file_id);
		mount(legacy.db, "session_same_owner", owner, file.file_id);
		// 负向检查前先证明 Provider 文件和原有 Session 归属确实存在。
		expect(new TextDecoder().decode((await gateway.downloadFile(file.file_id)).body)).toBe("old contents");
		expect(
			legacy.db
				.prepare("SELECT 1 FROM kit_sessions WHERE session_id = ? AND subject_id = ?")
				.get("session_before_upgrade", owner),
		).not.toBeNull();
		const db = legacy.reopen();
		const files = createFileService({
			gateway,
			store: createFileStore(createSqliteDatabase(db)),
			sessionIndex: createSessionIndex(createSqliteDatabase(db)),
		});
		expect(new TextDecoder().decode((await files.download(owner, file.file_id)).body)).toBe("old contents");
		await files.requireUploads(owner, [file]);
		await expect(files.requireUploads(other, [file])).rejects.toThrow("文件不存在");
		await expect(files.download(other, file.file_id, "session_before_upgrade")).rejects.toMatchObject({ status: 404 });
		// 重开不重复迁移；删掉会话索引也不会丢掉已恢复的上传归属。
		await createSessionIndex(createSqliteDatabase(db)).remove("session_before_upgrade");
		await createSessionIndex(createSqliteDatabase(db)).remove("session_same_owner");
		const reopened = legacy.reopen();
		expect(await createFileStore(createSqliteDatabase(reopened)).isUploadedBy(file.file_id, owner)).toBe(true);
		expect(reopened.prepare("SELECT COUNT(*) AS count FROM kit_uploaded_files").get()?.count).toBe(1);
	});

	it("跨身份歧义不授权，已有上传记录不被覆盖，无挂载证据或坏数据不产生归属", async () => {
		const legacy = legacyDatabase("005");
		const gateway = createMockGateway();
		const ambiguous = await gateway.uploadFile({ filename: "shared.txt", bytes: new Uint8Array([1]) });
		const recorded = await gateway.uploadFile({ filename: "recorded.txt", bytes: new Uint8Array([2]) });
		const unattached = await gateway.uploadFile({ filename: "unattached.txt", bytes: new Uint8Array([3]) });
		mount(legacy.db, "shared_a", owner, ambiguous.file_id);
		mount(legacy.db, "shared_b", other, ambiguous.file_id);
		mount(legacy.db, "recorded_old_index", other, recorded.file_id);
		legacy.db
			.prepare("INSERT INTO kit_uploaded_files (file_id, subject_id, created_at) VALUES (?, ?, ?)")
			.run(recorded.file_id, owner, "2026-10-20");
		for (const [i, value] of [
			"invalid json",
			'{"file_id":"not-an-array"}',
			'[null,"text",1,{}, {"file_id":2}, {"file_id":""}]',
		].entries()) {
			mount(legacy.db, `malformed_${i}`, owner, "placeholder");
			legacy.db.prepare("UPDATE kit_sessions SET files_json = ? WHERE session_id = ?").run(value, `malformed_${i}`);
		}
		const db = legacy.reopen();
		const files = createFileService({
			gateway,
			store: createFileStore(createSqliteDatabase(db)),
			sessionIndex: createSessionIndex(createSqliteDatabase(db)),
		});
		for (const subjectId of [owner, other]) {
			await expect(files.requireUploads(subjectId, [ambiguous])).rejects.toThrow("文件不存在");
			await expect(files.download(subjectId, ambiguous.file_id)).rejects.toMatchObject({ status: 404 });
		}
		await files.requireUploads(owner, [recorded]);
		await expect(files.requireUploads(other, [recorded])).rejects.toThrow("文件不存在");
		await expect(files.download(owner, unattached.file_id)).rejects.toMatchObject({ status: 404 });
		expect(db.prepare("SELECT file_id, subject_id FROM kit_uploaded_files").all()).toEqual([
			{ file_id: recorded.file_id, subject_id: owner },
		]);
	});
});
