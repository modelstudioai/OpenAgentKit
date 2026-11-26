import { Controller, Inject } from "@nestjs/common";
import { KitError } from "@openagentkit/sdk/protocol";
import type { ServerConfig } from "../../config.ts";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import { FileService } from "../../service/shared/session/files.ts";
import { KIT_CONFIG } from "../../utils/injection-tokens.ts";

import { data, kitErrors as errors } from "./staff-schemas.ts";

const postFilesRoute = defineRoute({
	method: "post",
	path: "/api/kit/files",
	tags: ["kit"],
	// Zod 文件运行时类型无法生成 OpenAPI binary Schema，
	// 故用 z.any() + 显式 OpenAPI 元数据描述 binary；运行时校验仍在 handler 内做（file instanceof File）。
	request: {
		body: {
			content: {
				"multipart/form-data": {
					schema: z.object({ file: z.any().openapi({ type: "string", format: "binary" }) }),
				},
			},
		},
	},
	responses: {
		201: {
			description: "附件已上传并绑定当前身份，返回 file_id 供创建会话时挂载",
			content: {
				"application/json": {
					schema: data(z.object({ file_id: z.string(), filename: z.string(), size: z.number() })),
				},
			},
		},
		...errors,
	},
});

const getFilesByFileIdRoute = defineRoute({
	method: "get",
	path: "/api/kit/files/{fileId}",
	tags: ["kit"],
	request: {
		params: z.object({ fileId: z.string() }),
	},
	responses: {
		200: {
			description: "本人上传附件的安全扫描状态；available 前绑定会话会被 provider 拒绝",
			content: {
				"application/json": {
					schema: data(z.object({ file_id: z.string(), status: z.string().nullable(), available: z.boolean() })),
				},
			},
		},
		...errors,
	},
});

const getFilesByFileIdDownloadRoute = defineRoute({
	method: "get",
	path: "/api/kit/files/{fileId}/download",
	tags: ["kit"],
	request: {
		params: z.object({ fileId: z.string() }),
		query: z.object({ session_id: z.string().min(1).optional() }),
	},
	responses: {
		200: {
			description: "本人上传的附件，或本人会话已交付的文件与 Agent 产物（须携带 session_id）",
			content: { "application/octet-stream": { schema: z.string() } },
		},
		...errors,
	},
});

@Controller()
export class StaffFilesController {
	constructor(
		@Inject(KIT_CONFIG) private readonly config: ServerConfig,
		@Inject(FileService) private readonly files: FileService,
	) {}

	/**
	 * 上传附件并记录归属，返回创建会话或发送消息时可用的文件标识。
	 *
	 * @param request - `multipart/form-data` 表单的 `file` 字段携带要上传的文件，归属取自请求身份。
	 * @return 201，`data` 包含 `file_id`、`filename` 和字节数 `size`。
	 */
	@KitRoute(postFilesRoute)
	async postFiles(@KitInput() request: KitRequest<typeof postFilesRoute>) {
		const { files, config } = this;
		const form = await request.formData();
		const file = form.get("file");
		if (!(file instanceof File)) throw new KitError("invalid_request", "缺少 multipart 文件字段 file");
		if (file.size > config.uploadMaxBytes) {
			throw new KitError(
				"invalid_request",
				`文件超过上限 ${config.uploadMaxBytes} 字节（可用 KIT_UPLOAD_MAX_BYTES 调整）`,
			);
		}
		const info = await files.uploadWithAudit(request.identity.subjectId, {
			filename: file.name,
			bytes: new Uint8Array(await file.arrayBuffer()),
			mimeType: file.type || undefined,
		});
		return request.json({ data: info }, 201);
	}

	/**
	 * 查询本人上传附件的安全扫描状态及可用性。
	 *
	 * @param request - 路径参数 `fileId` 指定本人上传的附件。
	 * @return 200，`data` 包含 `file_id`、扫描状态 `status` 和可用标记 `available`。
	 */
	@KitRoute(getFilesByFileIdRoute)
	async getFilesByFileId(@KitInput() request: KitRequest<typeof getFilesByFileIdRoute>) {
		const { files } = this;
		const info = await files.status(request.identity.subjectId, request.pathParam("fileId"));
		return request.json({ data: info }, 200);
	}

	/**
	 * 下载本人上传的附件，或凭本人会话标识下载该会话交付的文件与产物。
	 *
	 * @param request - 路径参数 `fileId` 指定文件，下载会话交付文件或产物时还须通过查询参数 `session_id` 指定本人会话。
	 * @return 200，返回文件字节，`Content-Type` 和 `Content-Disposition` 提供类型及下载文件名。
	 */
	@KitRoute(getFilesByFileIdDownloadRoute)
	async getFilesByFileIdDownload(
		@KitInput() request: KitRequest<typeof getFilesByFileIdDownloadRoute>,
	): Promise<Response> {
		const { files } = this;
		const file = await files.download(
			request.identity.subjectId,
			request.pathParam("fileId"),
			request.query.session_id,
		);
		// provider 文件名可能含非 ASCII，裸拼进响应头构造 Response 时会抛 ByteString 错误；
		// 引号内放 ASCII 兜底名，原名按 RFC 5987 编码进 filename*。
		const asciiName = file.filename.replace(/[^\x20-\x7e]|["\\]/g, "_") || "download";
		return new Response(file.body, {
			headers: {
				"Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
				"Content-Type": file.contentType,
				"Cache-Control": "private, no-store",
			},
		});
	}
}
