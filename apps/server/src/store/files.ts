import type { SessionPurpose } from "@openagentkit/sdk/protocol";
import type { StoreDatabase } from "./database.ts";

/** 只记录上传归属（含迁移确认的历史挂载归属）；文件字节仍由 Provider 保存。 */
export function createFileStore(db: StoreDatabase) {
	return {
		async recordUpload(fileId: string, subjectId: string, purpose: SessionPurpose = "experience") {
			await db.run(
				"INSERT INTO kit_uploaded_files (file_id, subject_id, purpose, created_at) VALUES (?, ?, ?, ?)",
				fileId,
				subjectId,
				purpose,
				new Date().toISOString(),
			);
		},
		async isUploadedBy(fileId: string, subjectId: string, purpose: SessionPurpose = "experience"): Promise<boolean> {
			return Boolean(
				await db.get(
					"SELECT 1 FROM kit_uploaded_files WHERE file_id = ? AND subject_id = ? AND purpose = ?",
					fileId,
					subjectId,
					purpose,
				),
			);
		},
	};
}

export type FileStore = ReturnType<typeof createFileStore>;
