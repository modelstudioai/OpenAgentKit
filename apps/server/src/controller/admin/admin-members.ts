import { Controller, Inject } from "@nestjs/common";
import {
	AdminMembersPageSchema,
	CreateMemberRequestSchema,
	CreateMemberResponseSchema,
	KitError,
	MemberSessionsPageSchema,
	MemberSessionsQuerySchema,
	MembersQuerySchema,
	MemberUsageQuerySchema,
	MemberUsageResponseSchema,
	MemberViewSchema,
} from "@openagentkit/sdk/protocol";
import { requireAdmin } from "../../http/identity.ts";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import { MemberService } from "../../service/admin/member/members.ts";
import { MemberUsageService } from "../../service/shared/member-usage.ts";

const errorBody = z.object({ error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }) });

const errors = {
	400: { description: "成员参数或分页游标无效", content: { "application/json": { schema: errorBody } } },
	401: { description: "管理端未认证", content: { "application/json": { schema: errorBody } } },
	403: { description: "管理端令牌无效或 auditor 写入被拒绝", content: { "application/json": { schema: errorBody } } },
	404: { description: "成员不存在", content: { "application/json": { schema: errorBody } } },
	409: { description: "用户名已存在（不区分大小写）", content: { "application/json": { schema: errorBody } } },
};

const getMembersRoute = defineRoute({
	method: "get",
	path: "/api/admin/members",
	tags: ["admin"],
	request: { query: MembersQuerySchema },
	responses: {
		200: { description: "成员目录", content: { "application/json": { schema: AdminMembersPageSchema } } },
		...errors,
	},
});

const postMembersRoute = defineRoute({
	method: "post",
	path: "/api/admin/members",
	tags: ["admin"],
	request: { body: { required: true, content: { "application/json": { schema: CreateMemberRequestSchema } } } },
	responses: {
		...errors,
		201: {
			description: "已创建成员并保存可选的企业绑定。启用密码登录且选择自动生成时返回一次初始密码",
			content: { "application/json": { schema: CreateMemberResponseSchema } },
		},
		400: {
			...errors[400],
			description: "成员参数无效、密码登录关闭时提交了自定义密码，或未配置 Keycloak 时提交了企业绑定",
		},
		409: {
			...errors[409],
			description: "用户名已存在（不区分大小写），或 Keycloak 用户已有绑定",
		},
	},
});

const getMembersByMemberIdRoute = defineRoute({
	method: "get",
	path: "/api/admin/members/{memberId}",
	tags: ["admin"],
	request: { params: z.object({ memberId: z.string().min(1) }) },
	responses: {
		200: {
			description: "成员公开资料，不含凭据",
			content: { "application/json": { schema: z.object({ data: MemberViewSchema }) } },
		},
		...errors,
	},
});

const getMembersByMemberIdUsageRoute = defineRoute({
	method: "get",
	path: "/api/admin/members/{memberId}/usage",
	tags: ["admin"],
	request: { params: z.object({ memberId: z.string().min(1) }), query: MemberUsageQuerySchema },
	responses: {
		200: {
			description: "成员累计会话用量；刷新在后台进行",
			content: { "application/json": { schema: MemberUsageResponseSchema } },
		},
		...errors,
	},
});

const getMembersByMemberIdSessionsRoute = defineRoute({
	method: "get",
	path: "/api/admin/members/{memberId}/sessions",
	tags: ["admin"],
	request: { params: z.object({ memberId: z.string().min(1) }), query: MemberSessionsQuerySchema },
	responses: {
		200: {
			description: "成员会话用量明细，含已删除快照",
			content: { "application/json": { schema: MemberSessionsPageSchema } },
		},
		...errors,
	},
});

@Controller()
export class AdminMembersController {
	constructor(@Inject(MemberService) private readonly members: MemberService) {}

	/**
	 * 分页列出本地成员，并附上各成员的所属用户组和累计用量。
	 *
	 * @param request - 可用查询参数 `search` 搜索成员，用 `limit` 和 `page_token` 分页。
	 * @return 200，`data` 为包含所属组和用量摘要的成员列表，`next_page_token` 指向下一页。
	 */
	@KitRoute(getMembersRoute, (result) => {
		if (!result.success) throw new KitError("invalid_request", "成员查询参数无效");
		return undefined;
	})
	async getMembers(@KitInput() request: KitRequest<typeof getMembersRoute>) {
		return request.json(await this.members.listWithUsage(request.query), 200);
	}

	/**
	 * 创建本地成员账号，自动生成的初始密码随创建结果返回一次。
	 *
	 * @param request - 请求体提供 `username`、`display_name`、`auth_type` 和 `password_mode`，自定义密码时另传 `password`。
	 * @return 201，`data.member` 为新建成员，自动生成密码时附 `initial_password`。
	 */
	@KitRoute(postMembersRoute, (result) => {
		// Zod 的默认错误对象可能带原始 data；只保留 schema 固定文案，不返回值或 details。
		if (!result.success) throw new KitError("invalid_request", result.error.issues[0]?.message ?? "成员参数无效");
		return undefined;
	})
	async postMembers(@KitInput() request: KitRequest<typeof postMembersRoute>) {
		const { members } = this;
		const { subject } = requireAdmin(request);
		return request.json({ data: await members.create(request.input, subject) }, 201);
	}

	/**
	 * 按成员标识读取指定成员的账号资料。
	 *
	 * @param request - 路径中的 `memberId` 标识要查询的成员。
	 * @return 200，`data` 包含成员的账号标识、显示名称和账号状态等公开资料。
	 */
	@KitRoute(getMembersByMemberIdRoute)
	async getMembersByMemberId(@KitInput() request: KitRequest<typeof getMembersByMemberIdRoute>) {
		return request.json({ data: await this.members.get(request.params.memberId) }, 200);
	}
}

@Controller()
export class AdminMemberUsageController {
	constructor(@Inject(MemberUsageService) private readonly memberUsage: MemberUsageService) {}

	/**
	 * 查询指定成员的累计会话用量，支持按智能体筛选和请求后台刷新。
	 *
	 * @param request - 路径指定 `memberId`，可按 `agent_slug` 筛选，`refresh`=1 请求后台刷新。
	 * @return 200，`data` 包含累计用量、会话数量、分智能体统计和刷新状态。
	 */
	@KitRoute(getMembersByMemberIdUsageRoute)
	async getMembersByMemberIdUsage(@KitInput() request: KitRequest<typeof getMembersByMemberIdUsageRoute>) {
		return request.json({ data: await this.memberUsage.summary(request.params.memberId, request.query) }, 200);
	}

	/**
	 * 分页查询指定成员的会话用量明细，包括已删除会话的快照。
	 *
	 * @param request - 路径指定 `memberId`，可按 `agent_slug` 筛选，用 `cursor` 和 `limit` 分页。
	 * @return 200，`data` 为该成员的会话用量明细，`next_cursor` 指向下一页。
	 */
	@KitRoute(getMembersByMemberIdSessionsRoute)
	async getMembersByMemberIdSessions(@KitInput() request: KitRequest<typeof getMembersByMemberIdSessionsRoute>) {
		return request.json(await this.memberUsage.list(request.params.memberId, request.query), 200);
	}
}
