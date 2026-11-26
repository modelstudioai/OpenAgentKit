import { Controller, Inject } from "@nestjs/common";
import {
	KitError,
	MemberUsageLimitViewSchema,
	TemplateUsageLimitViewSchema,
	UsageLimitConfigSchema,
	UsageLimitPolicySchema,
} from "@openagentkit/sdk/protocol";
import { requireAdminWrite } from "../../http/identity.ts";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import { usageLimitErrors } from "../../http/usage-limit-schemas.ts";
import { TemplateUsageService } from "../../service/admin/template-usage.ts";
import { UsageLimitService } from "../../service/shared/usage/usage-limits.ts";

const params = z.object({ memberId: z.string().min(1).max(128) });

const body = { required: true, content: { "application/json": { schema: UsageLimitConfigSchema } } } as const;

const policyResponse = {
	200: {
		description: "默认成员月度限额",
		content: { "application/json": { schema: z.object({ data: UsageLimitPolicySchema }) } },
	},
	...usageLimitErrors,
};

const memberResponse = {
	200: {
		description: "成员生效月度限额与增量计量状态",
		content: { "application/json": { schema: z.object({ data: MemberUsageLimitViewSchema }) } },
	},
	...usageLimitErrors,
};

function validate(result: { success: boolean }) {
	if (!result.success)
		throw new KitError("invalid_request", "Token 限额须为非负整数，运行时长须为非负秒数；null 表示不限量");
	return undefined;
}

const templateParams = z.object({ templateId: z.string().min(1).max(128) });

const templateResponse = {
	200: {
		description: "模版生效月度限额与条目累计状态（未设置覆盖时不限量）",
		content: { "application/json": { schema: z.object({ data: TemplateUsageLimitViewSchema }) } },
	},
	...usageLimitErrors,
};

const getUsageLimitsPolicyRoute = defineRoute({
	method: "get",
	path: "/api/admin/usage-limits/policy",
	tags: ["admin"],
	responses: policyResponse,
});

const putUsageLimitsPolicyRoute = defineRoute({
	method: "put",
	path: "/api/admin/usage-limits/policy",
	tags: ["admin"],
	request: { body },
	responses: policyResponse,
});

const getMembersByMemberIdUsageLimitRoute = defineRoute({
	method: "get",
	path: "/api/admin/members/{memberId}/usage-limit",
	tags: ["admin"],
	request: { params },
	responses: memberResponse,
});

const putMembersByMemberIdUsageLimitRoute = defineRoute({
	method: "put",
	path: "/api/admin/members/{memberId}/usage-limit",
	tags: ["admin"],
	request: { params, body },
	responses: memberResponse,
});

const deleteMembersByMemberIdUsageLimitRoute = defineRoute({
	method: "delete",
	path: "/api/admin/members/{memberId}/usage-limit",
	tags: ["admin"],
	request: { params },
	responses: memberResponse,
});

const getUsageTemplatesByTemplateIdUsageLimitRoute = defineRoute({
	method: "get",
	path: "/api/admin/usage/templates/{templateId}/usage-limit",
	tags: ["admin"],
	request: { params: templateParams },
	responses: templateResponse,
});

const putUsageTemplatesByTemplateIdUsageLimitRoute = defineRoute({
	method: "put",
	path: "/api/admin/usage/templates/{templateId}/usage-limit",
	tags: ["admin"],
	request: { params: templateParams, body },
	responses: templateResponse,
});

const deleteUsageTemplatesByTemplateIdUsageLimitRoute = defineRoute({
	method: "delete",
	path: "/api/admin/usage/templates/{templateId}/usage-limit",
	tags: ["admin"],
	request: { params: templateParams },
	responses: templateResponse,
});

@Controller()
export class AdminUsageLimitsController {
	constructor(
		@Inject(TemplateUsageService) private readonly templateUsage: TemplateUsageService,
		@Inject(UsageLimitService) private readonly usageLimits: UsageLimitService,
	) {}

	/**
	 * 查询成员默认的每日和每月 Token、执行时长限额。
	 *
	 * @param request - 携带管理端身份的默认限额查询请求。
	 * @return 200，`data` 包含默认每日、每月限额及最近更新信息。
	 */
	@KitRoute(getUsageLimitsPolicyRoute)
	async getUsageLimitsPolicy(@KitInput() request: KitRequest<typeof getUsageLimitsPolicyRoute>) {
		return request.json({ data: await this.usageLimits.policy() }, 200);
	}

	/**
	 * 设置成员默认的每日和每月 Token、执行时长限额。
	 *
	 * @param request - 请求体提供 `monthly_tokens`、`monthly_active_seconds`，可附 `daily_tokens`、`daily_active_seconds`，`null` 表示对应项不限量。
	 * @return 200，`data` 包含保存后的默认限额及最近更新信息。
	 */
	@KitRoute(putUsageLimitsPolicyRoute, validate)
	async putUsageLimitsPolicy(@KitInput() request: KitRequest<typeof putUsageLimitsPolicyRoute>) {
		const { usageLimits } = this;
		const { subject } = requireAdminWrite(request);
		return request.json({ data: await usageLimits.setPolicy(request.input, subject) }, 200);
	}

	/**
	 * 查询指定成员生效的日限额、月限额及相应用量。
	 *
	 * @param request - 路径中的 `memberId` 标识要查询的成员。
	 * @return 200，`data` 包含生效限额、成员覆盖配置、当日及当月用量。
	 */
	@KitRoute(getMembersByMemberIdUsageLimitRoute)
	async getMembersByMemberIdUsageLimit(@KitInput() request: KitRequest<typeof getMembersByMemberIdUsageLimitRoute>) {
		return request.json({ data: await this.usageLimits.member(request.params.memberId) }, 200);
	}

	/**
	 * 为指定成员设置专属的每日和每月 Token、执行时长限额。
	 *
	 * @param request - 路径指定 `memberId`，请求体提供 `monthly_tokens`、`monthly_active_seconds`，可附 `daily_tokens`、`daily_active_seconds`。
	 * @return 200，`data` 包含专属配置生效后的成员限额及用量。
	 */
	@KitRoute(putMembersByMemberIdUsageLimitRoute, validate)
	async putMembersByMemberIdUsageLimit(@KitInput() request: KitRequest<typeof putMembersByMemberIdUsageLimitRoute>) {
		const { usageLimits } = this;
		const { subject } = requireAdminWrite(request);
		return request.json({ data: await usageLimits.setMember(request.params.memberId, request.input, subject) }, 200);
	}

	/**
	 * 移除指定成员的专属限额，恢复默认成员限额。
	 *
	 * @param request - 路径中的 `memberId` 标识要移除专属限额的成员。
	 * @return 200，`data` 包含恢复默认配置后的成员限额及用量。
	 */
	@KitRoute(deleteMembersByMemberIdUsageLimitRoute)
	async deleteMembersByMemberIdUsageLimit(
		@KitInput() request: KitRequest<typeof deleteMembersByMemberIdUsageLimitRoute>,
	) {
		const { usageLimits } = this;
		const { subject } = requireAdminWrite(request);
		return request.json({ data: await usageLimits.resetMember(request.params.memberId, subject) }, 200);
	}

	/**
	 * 查询指定模版的日限额、月限额及其上架条目累计的相应用量。
	 *
	 * @param request - 路径中的 `templateId` 标识要查询的模版。
	 * @return 200，`data` 包含模版限额、覆盖配置及当日与当月用量。
	 */
	@KitRoute(getUsageTemplatesByTemplateIdUsageLimitRoute)
	async getUsageTemplatesByTemplateIdUsageLimit(
		@KitInput() request: KitRequest<typeof getUsageTemplatesByTemplateIdUsageLimitRoute>,
	) {
		return request.json({ data: await this.templateUsage.limit(request.params.templateId) }, 200);
	}

	/**
	 * 为指定模版设置每日和每月 Token、执行时长限额。
	 *
	 * @param request - 路径指定 `templateId`，请求体提供 `monthly_tokens`、`monthly_active_seconds`，可附 `daily_tokens`、`daily_active_seconds`。
	 * @return 200，`data` 包含更新后的模版限额及当前用量。
	 */
	@KitRoute(putUsageTemplatesByTemplateIdUsageLimitRoute, validate)
	async putUsageTemplatesByTemplateIdUsageLimit(
		@KitInput() request: KitRequest<typeof putUsageTemplatesByTemplateIdUsageLimitRoute>,
	) {
		const { subject } = requireAdminWrite(request);
		return request.json(
			{ data: await this.templateUsage.setLimit(request.params.templateId, request.input, subject) },
			200,
		);
	}

	/**
	 * 移除指定模版的日限额和月限额，使其恢复为不限量。
	 *
	 * @param request - 路径中的 `templateId` 标识要移除限额配置的模版。
	 * @return 200，`data` 包含恢复不限量后的模版限额及当前用量。
	 */
	@KitRoute(deleteUsageTemplatesByTemplateIdUsageLimitRoute)
	async deleteUsageTemplatesByTemplateIdUsageLimit(
		@KitInput() request: KitRequest<typeof deleteUsageTemplatesByTemplateIdUsageLimitRoute>,
	) {
		const { subject } = requireAdminWrite(request);
		return request.json({ data: await this.templateUsage.resetLimit(request.params.templateId, subject) }, 200);
	}
}
