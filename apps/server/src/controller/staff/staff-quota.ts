import { Controller, Inject } from "@nestjs/common";
import {
	CreateQuotaRequestSchema,
	PlazaQuerySchema,
	PlazaViewSchema,
	QuotaRequestViewSchema,
	QuotaViewSchema,
} from "@openagentkit/sdk/protocol";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import { QuotaService } from "../../service/shared/usage/quota.ts";
import { dailyWindowQuery, data, kitErrors as errors } from "./staff-schemas.ts";

const getPlazaRoute = defineRoute({
	method: "get",
	path: "/api/kit/plaza",
	tags: ["kit"],
	request: { query: PlazaQuerySchema },
	responses: {
		200: {
			description: "广场视图（分类/精选/热门/我的）",
			content: { "application/json": { schema: data(PlazaViewSchema) } },
		},
		...errors,
	},
});

const getQuotaRoute = defineRoute({
	method: "get",
	path: "/api/kit/quota",
	tags: ["kit"],
	request: {
		query: z.object({ days: dailyWindowQuery }),
	},
	responses: {
		200: {
			description: "当前身份的月度用量与余额（daily 为最近 days 天，缺省 30、最多 400）",
			content: { "application/json": { schema: data(QuotaViewSchema) } },
		},
		...errors,
	},
});

const postQuotaRequestsRoute = defineRoute({
	method: "post",
	path: "/api/kit/quota/requests",
	tags: ["kit"],
	request: { body: { content: { "application/json": { schema: CreateQuotaRequestSchema } } } },
	responses: {
		201: {
			description: "提额申请已提交",
			content: { "application/json": { schema: data(QuotaRequestViewSchema) } },
		},
		...errors,
	},
});

const getQuotaRequestsRoute = defineRoute({
	method: "get",
	path: "/api/kit/quota/requests",
	tags: ["kit"],
	responses: {
		200: {
			description: "我的提额申请历史",
			content: { "application/json": { schema: data(z.array(QuotaRequestViewSchema)) } },
		},
		...errors,
	},
});

@Controller()
export class StaffQuotaController {
	constructor(@Inject(QuotaService) private readonly quota: QuotaService) {}

	/**
	 * 按分类和关键词浏览智能体广场，查看精选、热门和本人用过的智能体。
	 *
	 * @param request - 查询参数 `category` 和 `q` 可按分类及关键词筛选广场条目。
	 * @return 200，`data` 包含智能体列表 `agents`、精选标识 `featured`、热门标识 `popular` 和分类 `categories`。
	 */
	@KitRoute(getPlazaRoute)
	async getPlaza(@KitInput() request: KitRequest<typeof getPlazaRoute>) {
		const { quota } = this;
		const query = request.query;
		return request.json({ data: PlazaViewSchema.parse(await quota.plazaView(request.identity.subjectId, query)) }, 200);
	}

	/**
	 * 查询当前身份的月度 Credits 额度和逐日对话轮次，本地成员的 Credits 显示为不限量。
	 *
	 * @param request - 请求身份限定额度归属，可通过查询参数 `days` 指定逐日统计天数，默认 30 天。
	 * @return 200，`data` 包含月度额度 `limit`、已用量 `used`、余额 `remaining` 和逐日对话轮次 `daily`。
	 */
	@KitRoute(getQuotaRoute)
	async getQuota(@KitInput() request: KitRequest<typeof getQuotaRoute>) {
		const view = await this.quota.kitQuotaView(request.identity.subjectId, request.query.days);
		return request.json({ data: view }, 200);
	}

	/**
	 * 为当前身份提交 Credits 提额申请，等待管理端审核。
	 *
	 * @param request - 请求体中的 `requested_credits` 指定申请增加的 Credits，可用 `reason` 说明原因。
	 * @return 201，`data` 包含新申请的 `id`、`requested_credits` 和审核状态 `status`。
	 */
	@KitRoute(postQuotaRequestsRoute)
	async postQuotaRequests(@KitInput() request: KitRequest<typeof postQuotaRequestsRoute>) {
		const { quota } = this;
		const body = request.input;
		const view = await quota.createRequest(request.identity.subjectId, {
			requestedCredits: body.requested_credits,
			...(body.reason ? { reason: body.reason } : {}),
		});
		return request.json({ data: view }, 201);
	}

	/**
	 * 列出本人提交的 Credits 提额申请及其审核状态。
	 *
	 * @param request - 请求身份指定要查询的申请人，无分页参数。
	 * @return 200，`data` 为本人的提额申请记录数组，含各项申请的审核状态。
	 */
	@KitRoute(getQuotaRequestsRoute)
	async getQuotaRequests(@KitInput() request: KitRequest<typeof getQuotaRequestsRoute>) {
		const { quota } = this;
		return request.json({ data: await quota.myRequests(request.identity.subjectId) }, 200);
	}
}
