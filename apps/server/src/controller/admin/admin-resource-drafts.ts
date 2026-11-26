import { Controller, Inject } from "@nestjs/common";
import {
	RESOURCE_DRAFT_KEY_HEADER,
	ResourceDraftDiscardResultSchema,
	ResourceDraftOwnershipHeadersSchema,
	ResourceDraftViewSchema,
} from "@openagentkit/sdk/protocol";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import { ResourceDraftService } from "../../service/admin/resource-draft/resource-drafts.ts";

const errorBody = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

const errors = Object.fromEntries(
	[400, 401, 403, 404, 409].map((code) => [
		code,
		{
			description: "参数、身份、批次归属或发布状态不满足要求",
			content: { "application/json": { schema: errorBody } },
		},
	]),
);

const response = {
	description: "一次性资源发布批次",
	content: { "application/json": { schema: z.object({ data: ResourceDraftViewSchema }) } },
};

const params = z.object({ draftId: z.string() });

const getResourceDraftsActiveRoute = defineRoute({
	method: "get",
	path: "/api/admin/resource-drafts/active",
	tags: ["admin-resource-draft"],
	request: { headers: ResourceDraftOwnershipHeadersSchema },
	responses: {
		200: {
			description: "本人未完成或待清理批次",
			content: { "application/json": { schema: z.object({ data: ResourceDraftViewSchema.nullable() }) } },
		},
		...errors,
	},
});

const postResourceDraftsRoute = defineRoute({
	method: "post",
	path: "/api/admin/resource-drafts",
	tags: ["admin-resource-draft"],
	request: { headers: ResourceDraftOwnershipHeadersSchema },
	responses: { 200: response, ...errors },
});

const getResourceDraftsByDraftIdRoute = defineRoute({
	method: "get",
	path: "/api/admin/resource-drafts/{draftId}",
	tags: ["admin-resource-draft"],
	request: { params },
	responses: { 200: response, ...errors },
});

const postResourceDraftsByDraftIdDiscardRoute = defineRoute({
	method: "post",
	path: "/api/admin/resource-drafts/{draftId}/discard",
	tags: ["admin-resource-draft"],
	request: { params, headers: ResourceDraftOwnershipHeadersSchema },
	responses: {
		200: {
			description: "丢弃本人尚未开始远端发布的本地批次",
			content: { "application/json": { schema: z.object({ data: ResourceDraftDiscardResultSchema }) } },
		},
		...errors,
	},
});

const postResourceDraftsByDraftIdFinalizeRoute = defineRoute({
	method: "post",
	path: "/api/admin/resource-drafts/{draftId}/finalize",
	tags: ["admin-resource-draft"],
	request: { params },
	responses: { 200: response, ...errors },
});

@Controller()
export class AdminResourceDraftsController {
	constructor(@Inject(ResourceDraftService) private readonly resourceDrafts: ResourceDraftService) {}

	/**
	 * 查询当前管理员尚未完成或仍待清理的发布批次。
	 *
	 * @param request - 当前管理员的请求，可通过 `x-kit-draft-key` 请求头校验批次清理凭证。
	 * @return 200，`data` 返回活动批次及其状态，无活动批次时为 `null`。
	 */
	@KitRoute(getResourceDraftsActiveRoute)
	async getResourceDraftsActive(@KitInput() request: KitRequest<typeof getResourceDraftsActiveRoute>) {
		request.setHeader("Cache-Control", "no-store");
		return request.json(
			{
				data: await this.resourceDrafts.active(request.admin.subject, request.headers[RESOURCE_DRAFT_KEY_HEADER]),
			},
			200,
		);
	}

	/**
	 * 为当前管理员创建发布批次，已有活动批次时返回该批次。
	 *
	 * @param request - 当前管理员的请求，可通过 `x-kit-draft-key` 请求头绑定或核对批次清理凭证。
	 * @return 200，返回新建或复用的活动批次，包括 `draft_id` 和 `status`。
	 */
	@KitRoute(postResourceDraftsRoute)
	async postResourceDrafts(@KitInput() request: KitRequest<typeof postResourceDraftsRoute>) {
		request.setHeader("Cache-Control", "no-store");
		return request.json(
			{
				data: await this.resourceDrafts.create(request.admin.subject, request.headers[RESOURCE_DRAFT_KEY_HEADER]),
			},
			200,
		);
	}

	/**
	 * 按批次标识读取当前管理员的发布状态及可执行的恢复操作。
	 *
	 * @param request - 路径参数 `draftId` 为当前管理员的批次标识。
	 * @return 200，返回批次状态、资源绑定、清理标志，以及可用时的操作标识和恢复动作。
	 */
	@KitRoute(getResourceDraftsByDraftIdRoute)
	async getResourceDraftsByDraftId(@KitInput() request: KitRequest<typeof getResourceDraftsByDraftIdRoute>) {
		request.setHeader("Cache-Control", "no-store");
		return request.json({ data: await this.resourceDrafts.get(request.params.draftId, request.admin.subject) }, 200);
	}

	/**
	 * 丢弃当前管理员尚可撤销的本地批次，并清理暂存资源。
	 *
	 * @param request - 路径参数 `draftId` 指定批次，已绑定的清理凭证通过 `x-kit-draft-key` 提交。
	 * @return 200，`data.discarded` 表示此次是否丢弃了批次。
	 */
	@KitRoute(postResourceDraftsByDraftIdDiscardRoute)
	async postResourceDraftsByDraftIdDiscard(
		@KitInput() request: KitRequest<typeof postResourceDraftsByDraftIdDiscardRoute>,
	) {
		request.setHeader("Cache-Control", "no-store");
		return request.json(
			{
				data: await this.resourceDrafts.discard(
					request.params.draftId,
					request.admin.subject,
					request.headers[RESOURCE_DRAFT_KEY_HEADER],
				),
			},
			200,
		);
	}

	/**
	 * 依据发布成功凭证补齐资源绑定和回执，并完成批次清理。
	 *
	 * @param request - 路径参数 `draftId` 指定需要完成发布收尾的批次。
	 * @return 200，返回收尾后的批次状态、资源绑定和清理标志。
	 */
	@KitRoute(postResourceDraftsByDraftIdFinalizeRoute)
	async postResourceDraftsByDraftIdFinalize(
		@KitInput() request: KitRequest<typeof postResourceDraftsByDraftIdFinalizeRoute>,
	) {
		request.setHeader("Cache-Control", "no-store");
		return request.json(
			{ data: await this.resourceDrafts.finalize(request.params.draftId, request.admin.subject) },
			200,
		);
	}
}
