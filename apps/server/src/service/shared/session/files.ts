import { Inject, Injectable } from "@nestjs/common";
import {
	type AttachmentRef,
	artifactsOf,
	KitError,
	type SessionPurpose,
	uploadTypeRejectionReason,
} from "@openagentkit/sdk/protocol";
import { KitUploadedFilesEntity } from "../../../entity/tables/kit-uploaded-files.entity.ts";
import type { ProviderGateway } from "../../../gateway/types.ts";
import { StoreDatabase } from "../../../store/database.ts";
import { KIT_METRICS, KIT_PROVIDER_GATEWAY } from "../../../utils/injection-tokens.ts";
import type { Metrics } from "../../../utils/metrics.ts";
import { AuditService } from "../audit.ts";
import { SessionHistoryService } from "./session-history.ts";
import { SessionIndexService } from "./session-index.ts";

@Injectable()
export class FileService {
	constructor(
		@Inject(KIT_PROVIDER_GATEWAY) private readonly gateway: ProviderGateway,
		@Inject(SessionHistoryService) private readonly history: SessionHistoryService,
		@Inject(SessionIndexService) private readonly sessionIndex: SessionIndexService,
		@Inject(StoreDatabase) private readonly db: StoreDatabase,
		@Inject(AuditService) private readonly audit: AuditService,
		@Inject(KIT_METRICS) private readonly metrics: Metrics,
	) {}

	async upload(
		subjectId: string,
		input: { filename: string; bytes: Uint8Array; mimeType?: string },
		purpose: SessionPurpose = "experience",
	) {
		const rejection = uploadTypeRejectionReason(input.filename);
		if (rejection) throw new KitError("invalid_request", rejection);
		const info = await this.gateway.uploadFile(input);
		await this.db.write((manager) =>
			manager.insert(KitUploadedFilesEntity, {
				file_id: info.file_id,
				subject_id: subjectId,
				purpose,
				created_at: new Date().toISOString(),
			}),
		);
		this.metrics.count("kit_uploads_total", { gateway: this.gateway.mode });
		return info;
	}

	async uploadWithAudit(subject: string, input: Parameters<typeof this.upload>[1], purpose?: SessionPurpose) {
		const info = await this.upload(subject, input, purpose);
		await this.audit.append({
			subject,
			action: purpose === "admin_debug" ? "debug.file.upload" : "file.upload",
			target: info.file_id,
			detail: { filename: input.filename, size: info.size },
		});
		return info;
	}

	private isUploadedBy(fileId: string, subjectId: string, purpose: SessionPurpose): Promise<boolean> {
		return this.db.read((manager) =>
			manager.existsBy(KitUploadedFilesEntity, { file_id: fileId, subject_id: subjectId, purpose }),
		);
	}

	/** 在扫描文件、创建 Provider Session 之前拒绝任何非本人上传的附件。 */
	async requireUploads(subjectId: string, attachments: AttachmentRef[], purpose: SessionPurpose = "experience") {
		for (const file of attachments) {
			if (!(await this.isUploadedBy(file.file_id, subjectId, purpose))) {
				throw new KitError("not_found", "文件不存在");
			}
		}
	}

	/** 本人上传附件的扫描状态：available 前绑定会话会被 provider 拒（服务端发送闸门兜底）。 */
	async status(subjectId: string, fileId: string, purpose: SessionPurpose = "experience") {
		if (!(await this.isUploadedBy(fileId, subjectId, purpose))) throw new KitError("not_found", "文件不存在");
		const info = await this.gateway.fileStatus(fileId);
		return { file_id: fileId, status: info.status ?? null, available: info.available };
	}

	/**
	 * 下载鉴权：本人上传附件、事件流交付文件，或本人会话的 Agent 产物（Provider Files `scope=session`）。
	 * 会话归属不匹配时直接返回 404。会话归属通过后，仍需任一数据面证据才能下载。
	 */
	async download(subjectId: string, fileId: string, sessionId?: string, purpose: SessionPurpose = "experience") {
		if (await this.isUploadedBy(fileId, subjectId, purpose)) return this.gateway.downloadFile(fileId);
		if (!sessionId || !(await this.sessionIndex.owns(sessionId, subjectId, purpose))) {
			throw new KitError("not_found", "文件不存在");
		}
		const history = await this.history.readSessionHistory(sessionId).then(
			(events) => ({
				delivered: events.some((event) => artifactsOf(event).some((file) => file.file_id === fileId)),
				error: null,
			}),
			(error: unknown) => ({ delivered: false, error }),
		);
		if (history.delivered) return this.gateway.downloadFile(fileId);
		// 会话 Files 清单是独立证据，历史暂时不可读时仍可据此授权。
		const artifact = (await this.gateway.listSessionFiles(sessionId)).find((file) => file.file_id === fileId);
		if (!artifact) throw history.error ?? new KitError("not_found", "文件不存在");
		const file = await this.gateway.downloadFile(fileId);
		// 产物不在上传目录，downloadFile 查不到元数据时会退化成 octet-stream 与裸 file_id，
		// 用刚校验过的会话清单补真实文件名与 MIME，前端才能按类型预览。
		return {
			...file,
			...(artifact.content_type ? { contentType: artifact.content_type } : {}),
			...(artifact.filename ? { filename: artifact.filename } : {}),
		};
	}
}
