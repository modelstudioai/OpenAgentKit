import { Controller, Inject } from "@nestjs/common";
import {
	CreateQuotaPackSchema,
	KitError,
	PutQuotaOverrideSchema,
	PutQuotaPolicySchema,
	QuotaOverrideViewSchema,
	QuotaPackViewSchema,
	QuotaPolicyViewSchema,
	QuotaRequestViewSchema,
	QuotaUsageRowSchema,
	ReviewQuotaRequestSchema,
} from "@openagentkit/sdk/protocol";
import { requireAdmin, requireAdminWrite } from "../../http/identity.ts";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import { QuotaService } from "../../service/shared/usage/quota.ts";
import { adminErrors as errors } from "./admin-schemas.ts";

const getQuotaPolicyRoute = defineRoute({
	method: "get",
	path: "/api/admin/quota/policy",
	tags: ["admin"],
	responses: {
		200: {
			description: "默认月度政策",
			content: { "application/json": { schema: z.object({ data: QuotaPolicyViewSchema }) } },
		},
		...errors,
	},
});

const putQuotaPolicyRoute = defineRoute({
	method: "put",
	path: "/api/admin/quota/policy",
	tags: ["admin"],
	request: { body: { content: { "application/json": { schema: PutQuotaPolicySchema } } } },
	responses: {
		200: {
			description: "政策已更新（-1=不限量）",
			content: { "application/json": { schema: z.object({ data: QuotaPolicyViewSchema }) } },
		},
		...errors,
	},
});

const getQuotaOverridesRoute = defineRoute({
	method: "get",
	path: "/api/admin/quota/overrides",
	tags: ["admin"],
	responses: {
		200: {
			description: "每员工长期上限（含当月用量与加油包）",
			content: { "application/json": { schema: z.object({ data: z.array(QuotaOverrideViewSchema) }) } },
		},
		...errors,
	},
});

const putQuotaOverridesBySubjectIdRoute = defineRoute({
	method: "put",
	path: "/api/admin/quota/overrides/{subjectId}",
	tags: ["admin"],
	request: {
		params: z.object({ subjectId: z.string() }),
		body: { content: { "application/json": { schema: PutQuotaOverrideSchema } } },
	},
	responses: {
		200: {
			description: "override 已写入",
			content: { "application/json": { schema: z.object({ data: QuotaOverrideViewSchema }) } },
		},
		...errors,
	},
});

const deleteQuotaOverridesBySubjectIdRoute = defineRoute({
	method: "delete",
	path: "/api/admin/quota/overrides/{subjectId}",
	tags: ["admin"],
	request: { params: z.object({ subjectId: z.string() }) },
	responses: {
		200: {
			description: "override 已删除（回落到默认政策）",
			content: { "application/json": { schema: z.object({ data: z.object({ deleted: z.boolean() }) }) } },
		},
		...errors,
	},
});

const postQuotaPacksRoute = defineRoute({
	method: "post",
	path: "/api/admin/quota/packs",
	tags: ["admin"],
	request: { body: { content: { "application/json": { schema: CreateQuotaPackSchema } } } },
	responses: {
		201: {
			description: "当月加油包已发放",
			content: { "application/json": { schema: z.object({ data: QuotaPackViewSchema }) } },
		},
		...errors,
	},
});

const deleteQuotaPacksByPackIdRoute = defineRoute({
	method: "delete",
	path: "/api/admin/quota/packs/{packId}",
	tags: ["admin"],
	request: { params: z.object({ packId: z.string() }) },
	responses: {
		200: {
			description: "加油包已删除",
			content: { "application/json": { schema: z.object({ data: z.object({ deleted: z.boolean() }) }) } },
		},
		...errors,
	},
});

const getQuotaRequestsRoute = defineRoute({
	method: "get",
	path: "/api/admin/quota/requests",
	tags: ["admin"],
	request: { query: z.object({ status: z.enum(["pending", "approved", "rejected"]).optional() }) },
	responses: {
		200: {
			description: "提额申请队列",
			content: { "application/json": { schema: z.object({ data: z.array(QuotaRequestViewSchema) }) } },
		},
		...errors,
	},
});

const postQuotaRequestsByIdReviewRoute = defineRoute({
	method: "post",
	path: "/api/admin/quota/requests/{id}/review",
	tags: ["admin"],
	request: {
		params: z.object({ id: z.string() }),
		body: { content: { "application/json": { schema: ReviewQuotaRequestSchema } } },
	},
	responses: {
		200: {
			description: "审批完成",
			content: { "application/json": { schema: z.object({ data: QuotaRequestViewSchema }) } },
		},
		...errors,
	},
});

const getQuotaUsageRoute = defineRoute({
	method: "get",
	path: "/api/admin/quota/usage",
	tags: ["admin"],
	request: {
		query: z.object({
			month: z
				.string()
				.regex(/^\d{4}-\d{2}$/)
				.optional(),
		}),
	},
	responses: {
		200: {
			description: "当月每 subject 用量",
			content: { "application/json": { schema: z.object({ data: z.array(QuotaUsageRowSchema) }) } },
		},
		...errors,
	},
});

@Controller()
export class AdminQuotaController {
	constructor(@Inject(QuotaService) private readonly quota: QuotaService) {}

	/**
	 * 查询员工每月默认的 Credits 额度。
	 *
	 * @param request - 携带管理端身份的 Credits 政策查询请求。
	 * @return 200，`data` 包含默认 `monthly_credits` 及最近更新信息。
	 */
	@KitRoute(getQuotaPolicyRoute)
	async getQuotaPolicy(@KitInput() request: KitRequest<typeof getQuotaPolicyRoute>) {
		requireAdmin(request);
		return request.json({ data: await this.quota.policy() }, 200);
	}

	/**
	 * 设置员工每月默认的 Credits 额度。
	 *
	 * @param request - 请求体以 `monthly_credits` 指定默认月额度，-1 表示不限量。
	 * @return 200，`data` 包含更新后的默认月额度及修改信息。
	 */
	@KitRoute(putQuotaPolicyRoute)
	async putQuotaPolicy(@KitInput() request: KitRequest<typeof putQuotaPolicyRoute>) {
		const { subject } = requireAdminWrite(request);
		const body = request.input;
		return request.json({ data: await this.quota.putPolicy(body.monthly_credits, subject) }, 200);
	}

	/**
	 * 列出单独设置了月度 Credits 上限的员工，并返回当月用量和加油包。
	 *
	 * @param request - 携带管理端身份的员工专属额度查询请求。
	 * @return 200，`data` 为专属额度列表，含各员工的当月用量、加油包和余额。
	 */
	@KitRoute(getQuotaOverridesRoute)
	async getQuotaOverrides(@KitInput() request: KitRequest<typeof getQuotaOverridesRoute>) {
		requireAdmin(request);
		return request.json({ data: await this.quota.overrides() }, 200);
	}

	/**
	 * 为指定员工设置持续生效的月度 Credits 上限。
	 *
	 * @param request - 路径指定 `subjectId`，请求体提供 `monthly_credits`，可附 `reason`。
	 * @return 200，`data` 包含该员工更新后的专属额度和当月余额。
	 */
	@KitRoute(putQuotaOverridesBySubjectIdRoute)
	async putQuotaOverridesBySubjectId(@KitInput() request: KitRequest<typeof putQuotaOverridesBySubjectIdRoute>) {
		const { subject } = requireAdminWrite(request);
		const body = request.input;
		const view = await this.quota.putOverride(
			{
				subjectId: request.pathParam("subjectId") ?? "",
				monthlyCredits: body.monthly_credits,
				...(body.reason ? { reason: body.reason } : {}),
			},
			subject,
		);
		return request.json({ data: view }, 200);
	}

	/**
	 * 移除指定员工的专属 Credits 上限，恢复默认月度额度。
	 *
	 * @param request - 路径中的 `subjectId` 标识要移除专属额度的员工。
	 * @return 200，`data.deleted` 表示专属额度已移除。
	 */
	@KitRoute(deleteQuotaOverridesBySubjectIdRoute)
	async deleteQuotaOverridesBySubjectId(@KitInput() request: KitRequest<typeof deleteQuotaOverridesBySubjectIdRoute>) {
		const { subject } = requireAdminWrite(request);
		const deleted = await this.quota.deleteOverride(request.pathParam("subjectId") ?? "", subject);
		if (!deleted) throw new KitError("not_found", "该 subject 没有 override");
		return request.json({ data: { deleted } }, 200);
	}

	/**
	 * 为指定员工发放当月有效的额外 Credits。
	 *
	 * @param request - 请求体提供员工 `subject_id` 和额外 `credits`，可附发放原因 `reason`。
	 * @return 201，`data` 包含加油包标识、生效月份和发放额度。
	 */
	@KitRoute(postQuotaPacksRoute)
	async postQuotaPacks(@KitInput() request: KitRequest<typeof postQuotaPacksRoute>) {
		const { subject } = requireAdminWrite(request);
		const body = request.input;
		const view = await this.quota.createPack(
			{
				subjectId: body.subject_id,
				credits: body.credits,
				...(body.reason ? { reason: body.reason } : {}),
			},
			subject,
		);
		return request.json({ data: view }, 201);
	}

	/**
	 * 撤销指定的 Credits 加油包。
	 *
	 * @param request - 路径中的 `packId` 标识要撤销的 Credits 加油包。
	 * @return 200，`data.deleted` 表示加油包已撤销。
	 */
	@KitRoute(deleteQuotaPacksByPackIdRoute)
	async deleteQuotaPacksByPackId(@KitInput() request: KitRequest<typeof deleteQuotaPacksByPackIdRoute>) {
		const { subject } = requireAdminWrite(request);
		const deleted = await this.quota.deletePack(request.pathParam("packId") ?? "", subject);
		if (!deleted) throw new KitError("not_found", "加油包不存在");
		return request.json({ data: { deleted } }, 200);
	}

	/**
	 * 按审批状态筛选并查询员工的 Credits 提额申请。
	 *
	 * @param request - 可用查询参数 `status` 筛选 `pending`、`approved` 或 `rejected` 的申请。
	 * @return 200，`data` 为匹配的提额申请列表。
	 */
	@KitRoute(getQuotaRequestsRoute)
	async getQuotaRequests(@KitInput() request: KitRequest<typeof getQuotaRequestsRoute>) {
		requireAdmin(request);
		const status = request.query.status;
		return request.json({ data: await this.quota.requests(status) }, 200);
	}

	/**
	 * 审批 Credits 提额申请，通过时按选定方式调整长期上限或发放当月加油包。
	 *
	 * @param request - 路径指定申请 `id`，请求体提供 `action`，通过时指定 `mode`，可附 `granted_credits` 和 `note`。
	 * @return 200，`data` 包含申请的审批状态、批准额度及审核记录。
	 */
	@KitRoute(postQuotaRequestsByIdReviewRoute)
	async postQuotaRequestsByIdReview(@KitInput() request: KitRequest<typeof postQuotaRequestsByIdReviewRoute>) {
		const { subject } = requireAdminWrite(request);
		const body = request.input;
		const view = await this.quota.review(
			request.pathParam("id") ?? "",
			{
				action: body.action,
				...(body.mode ? { mode: body.mode } : {}),
				...(body.granted_credits ? { grantedCredits: body.granted_credits } : {}),
				...(body.note ? { note: body.note } : {}),
			},
			subject,
		);
		return request.json({ data: view }, 200);
	}

	/**
	 * 按月查询各员工的 Credits 用量和剩余额度，默认查询当月。
	 *
	 * @param request - 可用查询参数 `month` 按 `YYYY-MM` 指定统计月份，默认当月。
	 * @return 200，`data` 列出各员工的已用 Credits、月度上限和余额。
	 */
	@KitRoute(getQuotaUsageRoute)
	async getQuotaUsage(@KitInput() request: KitRequest<typeof getQuotaUsageRoute>) {
		requireAdmin(request);
		const month = request.query.month;
		return request.json({ data: await this.quota.usage(month) }, 200);
	}
}
