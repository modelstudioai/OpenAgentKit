import {
	type AttachmentRef,
	artifactsOf,
	KitError,
	type SessionPurpose,
	uploadTypeRejectionReason,
} from "@openagentkit/sdk/protocol";
import type { ProviderGateway } from "../gateway/types.ts";
import type { FileStore } from "../store/files.ts";
import type { SessionIndex } from "../store/sessions.ts";
import type { Metrics } from "./metrics.ts";
import { readSessionHistory } from "./session-streams.ts";

export function createFileService(deps: {
	gateway: ProviderGateway;
	sessionIndex: SessionIndex;
	store: FileStore;
	metrics?: Metrics;
}) {
	const { gateway, sessionIndex, store, metrics } = deps;
	return {
		async upload(
			subjectId: string,
			input: { filename: string; bytes: Uint8Array; mimeType?: string },
			purpose: SessionPurpose = "experience",
		) {
			const rejection = uploadTypeRejectionReason(input.filename);
			if (rejection) throw new KitError("invalid_request", rejection);
			const info = await gateway.uploadFile(input);
			await store.recordUpload(info.file_id, subjectId, purpose);
			metrics?.count("kit_uploads_total", { gateway: gateway.mode });
			return info;
		},
		/** 在扫描文件、创建 Provider Session 之前拒绝任何非本人上传的附件。 */
		async requireUploads(subjectId: string, attachments: AttachmentRef[], purpose: SessionPurpose = "experience") {
			for (const file of attachments) {
				if (!(await store.isUploadedBy(file.file_id, subjectId, purpose))) {
					throw new KitError("not_found", "文件不存在");
				}
			}
		},
		/** 本人上传附件的扫描状态：available 前绑定会话会被 provider 拒（服务端发送闸门兜底）。 */
		async status(subjectId: string, fileId: string, purpose: SessionPurpose = "experience") {
			if (!(await store.isUploadedBy(fileId, subjectId, purpose))) throw new KitError("not_found", "文件不存在");
			const info = await gateway.fileStatus(fileId);
			return { file_id: fileId, status: info.status ?? null, available: info.available };
		},
		/**
		 * 下载鉴权：本人上传附件、事件流交付文件，或本人会话的 Agent 产物（Provider Files `scope=session`）。
		 * 会话归属不匹配时直接返回 404。会话归属通过后，仍需任一数据面证据才能下载。
		 */
		async download(subjectId: string, fileId: string, sessionId?: string, purpose: SessionPurpose = "experience") {
			if (await store.isUploadedBy(fileId, subjectId, purpose)) return gateway.downloadFile(fileId);
			if (!sessionId || !(await sessionIndex.owns(sessionId, subjectId, purpose))) {
				throw new KitError("not_found", "文件不存在");
			}
			const history = await readSessionHistory(gateway, sessionId).then(
				(events) => ({
					delivered: events.some((event) => artifactsOf(event).some((file) => file.file_id === fileId)),
					error: null,
				}),
				(error: unknown) => ({ delivered: false, error }),
			);
			if (history.delivered) return gateway.downloadFile(fileId);
			// 会话 Files 清单是独立证据，历史暂时不可读时仍可据此授权。
			const artifact = (await gateway.listSessionFiles(sessionId)).find((file) => file.file_id === fileId);
			if (!artifact) throw history.error ?? new KitError("not_found", "文件不存在");
			const file = await gateway.downloadFile(fileId);
			// 产物不在上传目录，downloadFile 查不到元数据时会退化成 octet-stream 与裸 file_id，
			// 用刚校验过的会话清单补真实文件名与 MIME，前端才能按类型预览。
			return {
				...file,
				...(artifact.content_type ? { contentType: artifact.content_type } : {}),
				...(artifact.filename ? { filename: artifact.filename } : {}),
			};
		},
	};
}

export type FileService = ReturnType<typeof createFileService>;
