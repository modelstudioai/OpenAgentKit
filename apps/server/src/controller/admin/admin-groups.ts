import { Controller, Inject } from "@nestjs/common";
import {
	ApplyRequestSchema,
	GroupInputSchema,
	GroupMembershipQuerySchema,
	GroupMembersPageSchema,
	GroupMembersPatchSchema,
	GroupsPageSchema,
	GroupsQuerySchema,
	GroupViewSchema,
	KitError,
	MemberGroupsPageSchema,
	MemberGroupsPatchSchema,
	PlanResponseSchema,
} from "@openagentkit/sdk/protocol";
import { requireAdmin } from "../../http/identity.ts";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import { GroupService } from "../../service/admin/member/groups.ts";

const errorBody = z.object({ error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }) });

const errors = {
	400: { description: "用户组参数或分页游标无效", content: { "application/json": { schema: errorBody } } },
	401: { description: "管理端未认证", content: { "application/json": { schema: errorBody } } },
	403: { description: "管理端令牌无效或 auditor 写入被拒绝", content: { "application/json": { schema: errorBody } } },
	404: { description: "用户组或成员不存在", content: { "application/json": { schema: errorBody } } },
	409: {
		description: "名称已存在或删除计划的组与成员关系已变化",
		content: { "application/json": { schema: errorBody } },
	},
	428: { description: "缺少有效的一次性删除确认令牌", content: { "application/json": { schema: errorBody } } },
};

const groupParams = z.object({ groupId: z.string().min(1) });

const memberParams = z.object({ memberId: z.string().min(1) });

const groupResponse = {
	description: "用户组资料",
	content: { "application/json": { schema: z.object({ data: GroupViewSchema }) } },
};

const body = <T extends z.ZodType>(schema: T) => ({ required: true, content: { "application/json": { schema } } });

const tags = ["admin"];

function rejectInvalid(result: { success: boolean; error?: { issues: { message: string }[] } }): undefined {
	if (!result.success)
		throw new KitError("invalid_request", result.error?.issues[0]?.message ?? "用户组参数或分页游标无效");
	return undefined;
}

const getGroupsRoute = defineRoute({
	method: "get",
	path: "/api/admin/groups",
	tags,
	request: { query: GroupsQuerySchema },
	responses: {
		200: { description: "用户组分页列表", content: { "application/json": { schema: GroupsPageSchema } } },
		...errors,
	},
});

const postGroupsRoute = defineRoute({
	method: "post",
	path: "/api/admin/groups",
	tags,
	request: { body: body(GroupInputSchema) },
	responses: { 201: groupResponse, ...errors },
});

const getGroupsByGroupIdRoute = defineRoute({
	method: "get",
	path: "/api/admin/groups/{groupId}",
	tags,
	request: { params: groupParams },
	responses: { 200: groupResponse, ...errors },
});

const patchGroupsByGroupIdRoute = defineRoute({
	method: "patch",
	path: "/api/admin/groups/{groupId}",
	tags,
	request: { params: groupParams, body: body(GroupInputSchema) },
	responses: { 200: groupResponse, ...errors },
});

const postGroupsByGroupIdPlanRoute = defineRoute({
	method: "post",
	path: "/api/admin/groups/{groupId}/plan",
	tags,
	request: { params: groupParams, body: body(z.object({ action: z.literal("delete") })) },
	responses: {
		200: {
			description: "删除影响与一次性确认令牌",
			content: { "application/json": { schema: z.object({ data: PlanResponseSchema }) } },
		},
		...errors,
	},
});

const deleteGroupsByGroupIdRoute = defineRoute({
	method: "delete",
	path: "/api/admin/groups/{groupId}",
	tags,
	request: {
		params: groupParams,
		body: { content: { "application/json": { schema: ApplyRequestSchema.partial().default({}) } } },
	},
	responses: {
		200: {
			description: "仅删除用户组及成员关联",
			content: { "application/json": { schema: z.object({ data: z.object({ deleted: z.literal(true) }) }) } },
		},
		...errors,
	},
});

const getGroupsByGroupIdMembersRoute = defineRoute({
	method: "get",
	path: "/api/admin/groups/{groupId}/members",
	tags,
	request: { params: groupParams, query: GroupMembershipQuerySchema },
	responses: {
		200: {
			description: "已加入、未加入或全部成员候选的分页列表",
			content: { "application/json": { schema: GroupMembersPageSchema } },
		},
		...errors,
	},
});

const patchGroupsByGroupIdMembersRoute = defineRoute({
	method: "patch",
	path: "/api/admin/groups/{groupId}/members",
	tags,
	request: { params: groupParams, body: body(GroupMembersPatchSchema) },
	responses: { 200: groupResponse, ...errors },
});

const getMembersByMemberIdGroupsRoute = defineRoute({
	method: "get",
	path: "/api/admin/members/{memberId}/groups",
	tags,
	request: { params: memberParams, query: GroupMembershipQuerySchema },
	responses: {
		200: {
			description: "用户所属或候选用户组的分页列表",
			content: { "application/json": { schema: MemberGroupsPageSchema } },
		},
		...errors,
	},
});

const patchMembersByMemberIdGroupsRoute = defineRoute({
	method: "patch",
	path: "/api/admin/members/{memberId}/groups",
	tags,
	request: { params: memberParams, body: body(MemberGroupsPatchSchema) },
	responses: {
		200: {
			description: "用户的组关联已更新",
			content: { "application/json": { schema: z.object({ data: z.object({ updated: z.literal(true) }) }) } },
		},
		...errors,
	},
});

@Controller()
export class AdminGroupsController {
	constructor(@Inject(GroupService) private readonly groups: GroupService) {}

	/**
	 * 分页查询本地用户组列表。
	 *
	 * @param request - 可用查询参数 `search` 搜索用户组，用 `limit` 和 `page_token` 分页。
	 * @return 200，`data` 为用户组列表，`next_page_token` 指向下一页。
	 */
	@KitRoute(getGroupsRoute, rejectInvalid)
	async getGroups(@KitInput() request: KitRequest<typeof getGroupsRoute>) {
		return request.json(await this.groups.list(request.query), 200);
	}

	/**
	 * 创建本地用户组并保存名称和描述。
	 *
	 * @param request - 请求体提供用户组名称 `name`，可附 `description`。
	 * @return 201，`data` 包含新建用户组的标识、资料和成员数。
	 */
	@KitRoute(postGroupsRoute, rejectInvalid)
	async postGroups(@KitInput() request: KitRequest<typeof postGroupsRoute>) {
		return request.json({ data: await this.groups.create(request.input, requireAdmin(request).subject) }, 201);
	}

	/**
	 * 查询指定本地用户组的资料。
	 *
	 * @param request - 路径中的 `groupId` 标识要查询的用户组。
	 * @return 200，`data` 包含用户组名称、描述、成员数和修订号。
	 */
	@KitRoute(getGroupsByGroupIdRoute, rejectInvalid)
	async getGroupsByGroupId(@KitInput() request: KitRequest<typeof getGroupsByGroupIdRoute>) {
		return request.json({ data: await this.groups.get(request.params.groupId) }, 200);
	}

	/**
	 * 更新指定本地用户组的名称或描述。
	 *
	 * @param request - 路径指定 `groupId`，请求体提供要修改的 `name` 或 `description`。
	 * @return 200，`data` 包含更新后的用户组资料。
	 */
	@KitRoute(patchGroupsByGroupIdRoute, rejectInvalid)
	async patchGroupsByGroupId(@KitInput() request: KitRequest<typeof patchGroupsByGroupIdRoute>) {
		return request.json(
			{
				data: await this.groups.update(request.params.groupId, request.input, requireAdmin(request).subject),
			},
			200,
		);
	}

	/**
	 * 预览删除用户组对成员关联的影响，并签发一次性确认令牌。
	 *
	 * @param request - 路径指定 `groupId`，请求体 `action` 取 `delete`。
	 * @return 200，`data` 包含对成员关联的影响、`plan_id`、`confirm_token` 和有效期。
	 */
	@KitRoute(postGroupsByGroupIdPlanRoute, rejectInvalid)
	async postGroupsByGroupIdPlan(@KitInput() request: KitRequest<typeof postGroupsByGroupIdPlanRoute>) {
		return request.json(
			{
				data: await this.groups.planDelete(request.params.groupId, requireAdmin(request).subject),
			},
			200,
		);
	}

	/**
	 * 消费一次性确认令牌，删除用户组并解除其成员关联。
	 *
	 * @param request - 路径指定 `groupId`，请求体提供删除计划的 `plan_id` 和 `confirm_token`。
	 * @return 200，`data.deleted` 表示用户组已删除。
	 */
	@KitRoute(deleteGroupsByGroupIdRoute, rejectInvalid)
	async deleteGroupsByGroupId(@KitInput() request: KitRequest<typeof deleteGroupsByGroupIdRoute>) {
		return request.json(
			{
				data: await this.groups.remove(request.params.groupId, request.input, requireAdmin(request).subject),
			},
			200,
		);
	}

	/**
	 * 按是否已加入指定用户组筛选并分页查询成员。
	 *
	 * @param request - 路径指定 `groupId`，可用 `membership`、`search` 筛选成员，用 `limit` 和 `page_token` 分页。
	 * @return 200，`data` 为成员及其入组状态列表，`next_page_token` 指向下一页。
	 */
	@KitRoute(getGroupsByGroupIdMembersRoute, rejectInvalid)
	async getGroupsByGroupIdMembers(@KitInput() request: KitRequest<typeof getGroupsByGroupIdMembersRoute>) {
		return request.json(await this.groups.groupMembers(request.params.groupId, request.query), 200);
	}

	/**
	 * 将指定成员批量加入或移出用户组。
	 *
	 * @param request - 路径指定 `groupId`，请求体通过 `add_member_ids` 和 `remove_member_ids` 指定加入和移出的成员。
	 * @return 200，`data` 包含成员关联变更后的用户组资料和成员数。
	 */
	@KitRoute(patchGroupsByGroupIdMembersRoute, rejectInvalid)
	async patchGroupsByGroupIdMembers(@KitInput() request: KitRequest<typeof patchGroupsByGroupIdMembersRoute>) {
		return request.json(
			{
				data: await this.groups.updateGroupMembers(
					request.params.groupId,
					request.input,
					requireAdmin(request).subject,
				),
			},
			200,
		);
	}

	/**
	 * 分页查询用户组，可按指定成员是否已加入筛选。
	 *
	 * @param request - 路径指定 `memberId`，可用 `membership`、`search` 筛选用户组，用 `limit` 和 `page_token` 分页。
	 * @return 200，`data` 为用户组及该成员的入组状态列表，`next_page_token` 指向下一页。
	 */
	@KitRoute(getMembersByMemberIdGroupsRoute, rejectInvalid)
	async getMembersByMemberIdGroups(@KitInput() request: KitRequest<typeof getMembersByMemberIdGroupsRoute>) {
		return request.json(await this.groups.memberGroups(request.params.memberId, request.query), 200);
	}

	/**
	 * 批量调整指定成员加入或退出的用户组。
	 *
	 * @param request - 路径指定 `memberId`，请求体通过 `add_group_ids` 和 `remove_group_ids` 指定加入和退出的用户组。
	 * @return 200，`data.updated` 表示成员的用户组关联已更新。
	 */
	@KitRoute(patchMembersByMemberIdGroupsRoute, rejectInvalid)
	async patchMembersByMemberIdGroups(@KitInput() request: KitRequest<typeof patchMembersByMemberIdGroupsRoute>) {
		return request.json(
			{
				data: await this.groups.updateMemberGroups(
					request.params.memberId,
					request.input,
					requireAdmin(request).subject,
				),
			},
			200,
		);
	}
}
