import { Controller, Inject } from "@nestjs/common";
import { CatalogAgentInputSchema } from "@openagentkit/sdk/protocol";
import { requireAdmin } from "../../http/identity.ts";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import { AdminCatalogService } from "../../service/admin/catalog/catalog.ts";
import { adminErrors as errors } from "./admin-schemas.ts";

const planSchema = z.object({
	plan_id: z.string(),
	confirm_token: z.string(),
	destructive: z.boolean(),
	expires_at: z.number(),
	diff: z.array(
		z.object({ resource: z.string(), action: z.string(), destructive: z.boolean(), summary: z.string().optional() }),
	),
});

const getAgentsRoute = defineRoute({
	method: "get",
	path: "/api/admin/agents",
	tags: ["admin"],
	responses: {
		200: {
			description: "全部条目（含未上架）",
			content: { "application/json": { schema: z.object({ data: z.array(z.unknown()) }) } },
		},
		...errors,
	},
});

const postAgentsRoute = defineRoute({
	method: "post",
	path: "/api/admin/agents",
	tags: ["admin"],
	request: {
		body: {
			content: {
				// 上架表单的完整展示字段（开场白/示例问题/主题/可见性/排序）由 protocol 契约约束
				"application/json": { schema: CatalogAgentInputSchema },
			},
		},
	},
	responses: {
		201: {
			description: "已创建（默认未上架）",
			content: { "application/json": { schema: z.object({ data: z.unknown() }) } },
		},
		...errors,
	},
});

const postAgentsBySlugPlanRoute = defineRoute({
	method: "post",
	path: "/api/admin/agents/{slug}/plan",
	tags: ["admin"],
	request: {
		params: z.object({ slug: z.string() }),
		body: {
			content: {
				"application/json": {
					schema: z.discriminatedUnion("action", [
						z.object({ action: z.literal("listing"), status: z.enum(["listed", "unlisted"]) }),
						z.object({ action: z.literal("delete") }),
					]),
				},
			},
		},
	},
	responses: {
		200: {
			description: "上/下架或删除条目的 plan 与一次性确认令牌（AGENTS.md 红线：必须 plan → 确认）",
			content: { "application/json": { schema: z.object({ data: planSchema }) } },
		},
		...errors,
	},
});

const patchAgentsBySlugRoute = defineRoute({
	method: "patch",
	path: "/api/admin/agents/{slug}",
	tags: ["admin"],
	request: {
		params: z.object({ slug: z.string() }),
		body: {
			content: {
				"application/json": {
					schema: z.object({
						status: z.enum(["listed", "unlisted"]),
						plan_id: z.string().min(1),
						confirm_token: z.string().min(1),
					}),
				},
			},
		},
	},
	responses: {
		200: {
			description: "已更新（确认令牌已消费）",
			content: { "application/json": { schema: z.object({ data: z.unknown() }) } },
		},
		...errors,
	},
});

const putAgentsBySlugRoute = defineRoute({
	method: "put",
	path: "/api/admin/agents/{slug}",
	tags: ["admin"],
	request: {
		params: z.object({ slug: z.string() }),
		body: {
			content: {
				"application/json": { schema: CatalogAgentInputSchema.omit({ slug: true }).partial() },
			},
		},
	},
	responses: {
		200: {
			description: "展示信息已更新（status 不在此路径修改）",
			content: { "application/json": { schema: z.object({ data: z.unknown() }) } },
		},
		...errors,
	},
});

const deleteAgentsBySlugRoute = defineRoute({
	method: "delete",
	path: "/api/admin/agents/{slug}",
	tags: ["admin"],
	request: {
		params: z.object({ slug: z.string() }),
		body: {
			content: {
				"application/json": {
					schema: z.object({ plan_id: z.string().min(1), confirm_token: z.string().min(1) }),
				},
			},
		},
	},
	responses: {
		200: {
			description: "条目已删除（确认令牌已消费）",
			content: { "application/json": { schema: z.object({ data: z.object({ deleted: z.boolean() }) }) } },
		},
		...errors,
	},
});

@Controller()
export class AdminCatalogController {
	constructor(@Inject(AdminCatalogService) private readonly catalogService: AdminCatalogService) {}

	/**
	 * 列出全部智能体目录条目，包括已上架和未上架的条目。
	 *
	 * @param request - 携带管理端身份的目录查询请求。
	 * @return 200，`data` 包含全部智能体目录条目。
	 */
	@KitRoute(getAgentsRoute)
	async getAgents(@KitInput() request: KitRequest<typeof getAgentsRoute>) {
		return request.json({ data: await this.catalogService.listAll() }, 200);
	}

	/**
	 * 创建智能体目录条目，初始状态为未上架。
	 *
	 * @param request - 请求体指定 `slug`、`display_name`、`remote_agent_id`，可附版本、资源绑定及展示配置。
	 * @return 201，`data` 包含新建的未上架目录条目。
	 */
	@KitRoute(postAgentsRoute)
	async postAgents(@KitInput() request: KitRequest<typeof postAgentsRoute>) {
		const { subject } = requireAdmin(request);
		return request.json({ data: await this.catalogService.create(subject, request.input) }, 201);
	}

	/**
	 * 预览目录条目上架、下架或删除的影响，并签发一次性确认令牌。
	 *
	 * @param request - 路径指定 `slug`，请求体 `action` 取 `delete` 或 `listing`，后者需提供目标 `status`。
	 * @return 200，`data` 包含 `plan_id`、`confirm_token`、有效期和变更明细。
	 */
	@KitRoute(postAgentsBySlugPlanRoute)
	async postAgentsBySlugPlan(@KitInput() request: KitRequest<typeof postAgentsBySlugPlanRoute>) {
		const { subject } = requireAdmin(request);
		const data = await this.catalogService.plan(subject, request.pathParam("slug"), request.input);
		return request.json({ data }, 200);
	}

	/**
	 * 消费计划的一次性确认令牌，将目录条目上架或下架。
	 *
	 * @param request - 路径指定 `slug`，请求体提供目标 `status`、`plan_id` 和 `confirm_token`。
	 * @return 200，`data` 包含更新上架状态后的目录条目。
	 */
	@KitRoute(patchAgentsBySlugRoute)
	async patchAgentsBySlug(@KitInput() request: KitRequest<typeof patchAgentsBySlugRoute>) {
		const { subject } = requireAdmin(request);
		const data = await this.catalogService.setListing(subject, request.pathParam("slug"), request.input);
		return request.json({ data }, 200);
	}

	/**
	 * 更新目录条目的展示配置、智能体绑定或运行资源。
	 *
	 * @param request - 路径指定 `slug`，请求体提供待更新的展示配置、智能体绑定或运行资源。
	 * @return 200，`data` 包含修改后的目录条目。
	 */
	@KitRoute(putAgentsBySlugRoute)
	async putAgentsBySlug(@KitInput() request: KitRequest<typeof putAgentsBySlugRoute>) {
		const { subject } = requireAdmin(request);
		const data = await this.catalogService.update(subject, request.pathParam("slug"), request.input);
		return request.json({ data }, 200);
	}

	/**
	 * 消费计划的一次性确认令牌，删除指定的智能体目录条目。
	 *
	 * @param request - 路径指定 `slug`，请求体提供删除计划的 `plan_id` 和 `confirm_token`。
	 * @return 200，`data.deleted` 表示条目是否已删除。
	 */
	@KitRoute(deleteAgentsBySlugRoute)
	async deleteAgentsBySlug(@KitInput() request: KitRequest<typeof deleteAgentsBySlugRoute>) {
		const { subject } = requireAdmin(request);
		const data = await this.catalogService.remove(subject, request.pathParam("slug"), request.input);
		return request.json({ data }, 200);
	}
}
