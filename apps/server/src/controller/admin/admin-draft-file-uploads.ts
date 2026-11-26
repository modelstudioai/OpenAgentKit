import { Controller, Inject } from "@nestjs/common";
import {
	KitError,
	ProjectFileUploadCommitSchema,
	ProjectFileUploadInputSchema,
	ProjectFileUploadPreviewSchema,
	ProjectFileUploadSchema,
} from "@openagentkit/sdk/protocol";
import type { ServerConfig } from "../../config.ts";
import { requireAdmin } from "../../http/identity.ts";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import { KIT_CONFIG } from "../../utils/injection-tokens.ts";

const params = z.object({ name: z.string().min(1) });

const errorBody = z.object({
	error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean().optional() }),
});

const error = (description: string) => ({ description, content: { "application/json": { schema: errorBody } } });

const errors = {
	400: error("invalid_request"),
	401: error("unauthorized"),
	403: error("forbidden"),
	404: error("not_found"),
	409: error("conflict"),
	413: error("文件超过上传上限"),
};

const basePath = "/api/admin/resource-drafts/{name}/resources";

const postResourceDraftsByNameResourcesFileUploadsRoute = defineRoute({
	method: "post",
	path: `${basePath}/file-uploads`,
	tags: ["admin-resource-draft"],
	request: {
		params,
		body: {
			content: {
				"multipart/form-data": {
					schema: z.object({
						file: z.any().openapi({ type: "string", format: "binary" }),
						base_revision: z.string().min(1).max(256),
					}),
				},
			},
		},
	},
	responses: {
		201: {
			description: "项目文件已暂存，尚未修改源码或上传 Provider",
			content: { "application/json": { schema: z.object({ data: ProjectFileUploadSchema }) } },
		},
		...errors,
	},
});

const deleteResourceDraftsByNameResourcesFileUploadsByUploadIdRoute = defineRoute({
	method: "delete",
	path: `${basePath}/file-uploads/{uploadId}`,
	tags: ["admin-resource-draft"],
	request: { params: params.extend({ uploadId: z.string().min(1).max(128) }) },
	responses: {
		200: {
			description: "取消暂存；已过期或已取消时 deleted=false",
			content: { "application/json": { schema: z.object({ data: z.object({ deleted: z.boolean() }) }) } },
		},
		...errors,
	},
});

const postResourceDraftsByNameResourcesFileUploadsPreviewRoute = defineRoute({
	method: "post",
	path: `${basePath}/file-uploads/preview`,
	tags: ["admin-resource-draft"],
	request: { params, body: { content: { "application/json": { schema: ProjectFileUploadInputSchema } } } },
	responses: {
		200: {
			description: "共享 File 批量创建预览，源码未改变",
			content: { "application/json": { schema: z.object({ data: ProjectFileUploadPreviewSchema }) } },
		},
		...errors,
	},
});

const postResourceDraftsByNameResourcesFileUploadsCommitRoute = defineRoute({
	method: "post",
	path: `${basePath}/file-uploads/commit`,
	tags: ["admin-resource-draft"],
	request: { params, body: { content: { "application/json": { schema: ProjectFileUploadInputSchema } } } },
	responses: {
		200: {
			description: "共享 File 已保存，未修改 Agent 或上传 Provider",
			content: { "application/json": { schema: z.object({ data: ProjectFileUploadCommitSchema }) } },
		},
		...errors,
	},
});

@Controller()
export class AdminDraftFileUploadsController {
	constructor(@Inject(KIT_CONFIG) private readonly config: ServerConfig) {}

	/**
	 * 为当前批次的指定修订暂存一个文件，返回供预览和提交使用的上传标识。
	 *
	 * @param request - 路径参数 `name` 指定批次，`multipart` 表单通过 `file` 提交单个文件，通过 `base_revision` 指定修订号。
	 * @return 201，返回暂存标识 `upload_id`、资源键 `file_key`、文件名、大小和 `SHA-256` 摘要。
	 */
	@KitRoute(postResourceDraftsByNameResourcesFileUploadsRoute)
	async postResourceDraftsByNameResourcesFileUploads(
		@KitInput() request: KitRequest<typeof postResourceDraftsByNameResourcesFileUploadsRoute>,
	) {
		const { config } = this;
		const project = request.draftResources;
		const { subject } = requireAdmin(request);
		const { name } = request.params;
		const form = await request.formData();
		const file = form.get("file");
		const revision = form.get("base_revision");
		if (!(file instanceof File) || form.getAll("file").length !== 1 || typeof revision !== "string")
			throw new KitError("invalid_request", "请提供一个文件和对应的批次修订号");
		if (file.size > config.uploadMaxBytes)
			return request.json(
				{
					error: { code: "invalid_request", message: `文件超过上限 ${config.uploadMaxBytes} 字节`, retryable: false },
				},
				413,
			);
		const upload = await project.stageFileUpload(name, revision, subject, {
			filename: file.name,
			bytes: new Uint8Array(await file.arrayBuffer()),
		});
		return request.json({ data: upload }, 201);
	}

	/**
	 * 按上传标识取消当前管理员在此批次暂存的文件。
	 *
	 * @param request - 路径参数 `name` 和 `uploadId` 指定批次及其中暂存的文件。
	 * @return 200，`data.deleted` 表示此次是否成功取消暂存。
	 */
	@KitRoute(deleteResourceDraftsByNameResourcesFileUploadsByUploadIdRoute)
	deleteResourceDraftsByNameResourcesFileUploadsByUploadId(
		@KitInput() request: KitRequest<typeof deleteResourceDraftsByNameResourcesFileUploadsByUploadIdRoute>,
	) {
		const project = request.draftResources;
		const { subject } = requireAdmin(request);
		const { name, uploadId } = request.params;
		return request.json({ data: project.cancelFileUpload(name, uploadId, subject) }, 200);
	}

	/**
	 * 预览将选定的暂存文件加入批次后产生的声明差异和校验结果。
	 *
	 * @param request - 路径参数 `name` 指定批次，JSON 请求体提供 `base_revision` 和待预览文件的 `upload_ids`。
	 * @return 200，返回变更前后声明、校验结果、可提交标志及所选上传项。
	 */
	@KitRoute(postResourceDraftsByNameResourcesFileUploadsPreviewRoute)
	async postResourceDraftsByNameResourcesFileUploadsPreview(
		@KitInput() request: KitRequest<typeof postResourceDraftsByNameResourcesFileUploadsPreviewRoute>,
	) {
		const project = request.draftResources;
		const { subject } = requireAdmin(request);
		return request.json({ data: await project.previewFileUploads(request.params.name, request.input, subject) }, 200);
	}

	/**
	 * 将选定的暂存文件保存为批次共享资源，并返回新的批次修订号。
	 *
	 * @param request - 路径参数 `name` 指定批次，JSON 请求体提供 `base_revision` 和要提交的 `upload_ids`。
	 * @return 200，返回新修订号 `new_revision` 及已保存的文件清单。
	 */
	@KitRoute(postResourceDraftsByNameResourcesFileUploadsCommitRoute)
	async postResourceDraftsByNameResourcesFileUploadsCommit(
		@KitInput() request: KitRequest<typeof postResourceDraftsByNameResourcesFileUploadsCommitRoute>,
	) {
		const project = request.draftResources;
		const { subject } = requireAdmin(request);
		return request.json({ data: await project.commitFileUploads(request.params.name, request.input, subject) }, 200);
	}
}
