import { Controller, Inject } from "@nestjs/common";
import {
	KitError,
	ProjectSkillUploadCommitSchema,
	ProjectSkillUploadInputSchema,
	ProjectSkillUploadPreviewSchema,
	ProjectSkillUploadSchema,
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

const postResourceDraftsByNameResourcesSkillUploadsRoute = defineRoute({
	method: "post",
	path: `${basePath}/skill-uploads`,
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
			description: "Skill 包已暂存，尚未修改源码或上传 Provider",
			content: { "application/json": { schema: z.object({ data: ProjectSkillUploadSchema }) } },
		},
		...errors,
	},
});

const deleteResourceDraftsByNameResourcesSkillUploadsByUploadIdRoute = defineRoute({
	method: "delete",
	path: `${basePath}/skill-uploads/{uploadId}`,
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

const postResourceDraftsByNameResourcesSkillUploadsPreviewRoute = defineRoute({
	method: "post",
	path: `${basePath}/skill-uploads/preview`,
	tags: ["admin-resource-draft"],
	request: { params, body: { content: { "application/json": { schema: ProjectSkillUploadInputSchema } } } },
	responses: {
		200: {
			description: "共享 Skill 批量创建预览，源码未改变",
			content: { "application/json": { schema: z.object({ data: ProjectSkillUploadPreviewSchema }) } },
		},
		...errors,
	},
});

const postResourceDraftsByNameResourcesSkillUploadsCommitRoute = defineRoute({
	method: "post",
	path: `${basePath}/skill-uploads/commit`,
	tags: ["admin-resource-draft"],
	request: { params, body: { content: { "application/json": { schema: ProjectSkillUploadInputSchema } } } },
	responses: {
		200: {
			description: "共享 Skill 已保存，未修改 Agent 或上传 Provider",
			content: { "application/json": { schema: z.object({ data: ProjectSkillUploadCommitSchema }) } },
		},
		...errors,
	},
});

@Controller()
export class AdminDraftSkillUploadsController {
	constructor(@Inject(KIT_CONFIG) private readonly config: ServerConfig) {}

	/**
	 * 为当前批次的指定修订校验并暂存一个 Skill 包，返回上传标识和包信息。
	 *
	 * @param request - 路径参数 `name` 指定批次，`multipart` 表单通过 `file` 提交单个Skill 包，通过 `base_revision` 指定修订号。
	 * @return 201，返回暂存标识 `upload_id`、资源键 `skill_key`、文件名、大小和 `SHA-256` 摘要。
	 */
	@KitRoute(postResourceDraftsByNameResourcesSkillUploadsRoute)
	async postResourceDraftsByNameResourcesSkillUploads(
		@KitInput() request: KitRequest<typeof postResourceDraftsByNameResourcesSkillUploadsRoute>,
	) {
		const { config } = this;
		const project = request.draftResources;
		const { subject } = requireAdmin(request);
		const { name } = request.params;
		const form = await request.formData();
		const file = form.get("file");
		const revision = form.get("base_revision");
		if (!(file instanceof File) || form.getAll("file").length !== 1 || typeof revision !== "string")
			throw new KitError("invalid_request", "请提供一个 Skill ZIP 或 SKILL.md 和对应的批次修订号");
		if (file.size > config.uploadMaxBytes)
			return request.json(
				{
					error: { code: "invalid_request", message: `文件超过上限 ${config.uploadMaxBytes} 字节`, retryable: false },
				},
				413,
			);
		const upload = await project.stageSkillUpload(name, revision, subject, {
			filename: file.name,
			bytes: new Uint8Array(await file.arrayBuffer()),
		});
		return request.json({ data: upload }, 201);
	}

	/**
	 * 按上传标识取消当前管理员在此批次暂存的 Skill 包。
	 *
	 * @param request - 路径参数 `name` 和 `uploadId` 指定批次及其中暂存的Skill 包。
	 * @return 200，`data.deleted` 表示此次是否成功取消暂存。
	 */
	@KitRoute(deleteResourceDraftsByNameResourcesSkillUploadsByUploadIdRoute)
	deleteResourceDraftsByNameResourcesSkillUploadsByUploadId(
		@KitInput() request: KitRequest<typeof deleteResourceDraftsByNameResourcesSkillUploadsByUploadIdRoute>,
	) {
		const project = request.draftResources;
		const { subject } = requireAdmin(request);
		const { name, uploadId } = request.params;
		return request.json({ data: project.cancelSkillUpload(name, uploadId, subject) }, 200);
	}

	/**
	 * 预览将选定的 Skill 包加入批次后产生的声明差异和校验结果。
	 *
	 * @param request - 路径参数 `name` 指定批次，JSON 请求体提供 `base_revision` 和待预览Skill 包的 `upload_ids`。
	 * @return 200，返回变更前后声明、校验结果、可提交标志及所选上传项。
	 */
	@KitRoute(postResourceDraftsByNameResourcesSkillUploadsPreviewRoute)
	async postResourceDraftsByNameResourcesSkillUploadsPreview(
		@KitInput() request: KitRequest<typeof postResourceDraftsByNameResourcesSkillUploadsPreviewRoute>,
	) {
		const project = request.draftResources;
		const { subject } = requireAdmin(request);
		return request.json({ data: await project.previewSkillUploads(request.params.name, request.input, subject) }, 200);
	}

	/**
	 * 将选定的暂存包保存为批次共享 Skill，并返回新的批次修订号。
	 *
	 * @param request - 路径参数 `name` 指定批次，JSON 请求体提供 `base_revision` 和要提交的 `upload_ids`。
	 * @return 200，返回新修订号 `new_revision` 及已保存的Skill 包清单。
	 */
	@KitRoute(postResourceDraftsByNameResourcesSkillUploadsCommitRoute)
	async postResourceDraftsByNameResourcesSkillUploadsCommit(
		@KitInput() request: KitRequest<typeof postResourceDraftsByNameResourcesSkillUploadsCommitRoute>,
	) {
		const project = request.draftResources;
		const { subject } = requireAdmin(request);
		return request.json({ data: await project.commitSkillUploads(request.params.name, request.input, subject) }, 200);
	}
}
