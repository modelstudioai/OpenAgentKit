import { Controller, Inject } from "@nestjs/common";
import {
	KitError,
	TemplateVersionsPageSchema,
	TemplateVersionsQuerySchema,
	TemplateVersionViewSchema,
} from "@openagentkit/sdk/protocol";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import { TemplateService } from "../../service/admin/catalog/templates.ts";

const errorBody = z.object({ error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }) });

const errors = {
	400: { description: "版本号或分页游标无效", content: { "application/json": { schema: errorBody } } },
	401: { description: "管理端未认证", content: { "application/json": { schema: errorBody } } },
	403: { description: "无管理端读取权限", content: { "application/json": { schema: errorBody } } },
	404: { description: "模版或版本不存在", content: { "application/json": { schema: errorBody } } },
};

function rejectInvalid(result: { success: boolean; error?: { issues: { message: string }[] } }): undefined {
	if (!result.success) throw new KitError("invalid_request", result.error?.issues[0]?.message ?? "模版版本参数无效");
	return undefined;
}

const getTemplatesByTemplateIdVersionsRoute = defineRoute({
	method: "get",
	path: "/api/admin/templates/{templateId}/versions",
	tags: ["admin"],
	request: {
		params: z.object({ templateId: z.string().min(1) }),
		query: TemplateVersionsQuerySchema,
	},
	responses: {
		200: {
			description: "模版版本摘要按版本号倒序分页，包含当前版本",
			content: { "application/json": { schema: TemplateVersionsPageSchema } },
		},
		...errors,
	},
});

const getTemplatesByTemplateIdVersionsByVersionRoute = defineRoute({
	method: "get",
	path: "/api/admin/templates/{templateId}/versions/{version}",
	tags: ["admin"],
	request: {
		params: z.object({ templateId: z.string().min(1), version: z.coerce.number().int().positive() }),
	},
	responses: {
		200: {
			description: "指定版本的不可变完整配置，created_at 为该版本保存时间",
			content: { "application/json": { schema: z.object({ data: TemplateVersionViewSchema }) } },
		},
		...errors,
	},
});

@Controller()
export class AdminTemplateVersionsController {
	constructor(@Inject(TemplateService) private readonly templates: TemplateService) {}

	/**
	 * 按版本号倒序分页列出模版的版本摘要。
	 *
	 * @param request - 路径参数 `templateId` 指定模版，可用 `limit` 和 `page_token` 分页。
	 * @return 200，返回版本摘要列表 `data`、当前版本 `current_version` 和可用的下一页游标 `next_page_token`。
	 */
	@KitRoute(getTemplatesByTemplateIdVersionsRoute, rejectInvalid)
	async getTemplatesByTemplateIdVersions(
		@KitInput() request: KitRequest<typeof getTemplatesByTemplateIdVersionsRoute>,
	) {
		return request.json(await this.templates.versions(request.params.templateId, request.query), 200);
	}

	/**
	 * 读取模版在指定版本保存时的完整配置快照。
	 *
	 * @param request - 路径参数 `templateId` 和 `version` 指定模版及其历史版本。
	 * @return 200，`data` 是该版本保存时的完整模版配置快照。
	 */
	@KitRoute(getTemplatesByTemplateIdVersionsByVersionRoute, rejectInvalid)
	async getTemplatesByTemplateIdVersionsByVersion(
		@KitInput() request: KitRequest<typeof getTemplatesByTemplateIdVersionsByVersionRoute>,
	) {
		const { templateId, version } = request.params;
		return request.json({ data: await this.templates.version(templateId, version) }, 200);
	}
}
