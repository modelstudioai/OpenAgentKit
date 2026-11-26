import { Controller } from "@nestjs/common";
import {
	ProjectAgentCreateInputSchema,
	ProjectAgentOptionsSchema,
	ResourceDraftAgentCreateResultSchema,
} from "@openagentkit/sdk/protocol";
import { requireAdmin } from "../../http/identity.ts";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";

const errorBody = z.object({
	error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean().optional() }),
});

const error = (description: string) => ({ description, content: { "application/json": { schema: errorBody } } });

const basePath = "/api/admin/resource-drafts/{name}/resources";

const getResourceDraftsByNameResourcesAgentOptionsRoute = defineRoute({
	method: "get",
	path: `${basePath}/agent-options`,
	tags: ["admin-resource-draft"],
	request: { params: z.object({ name: z.string().min(1) }) },
	responses: {
		200: {
			description: "可选择的本地共享 Skill 与官方 MCP 名称",
			content: { "application/json": { schema: z.object({ data: ProjectAgentOptionsSchema }) } },
		},
		400: error("项目声明无效"),
		401: error("管理端未认证"),
		404: error("资源批次不存在"),
	},
});

const postResourceDraftsByNameResourcesAgentsRoute = defineRoute({
	method: "post",
	path: `${basePath}/agents`,
	tags: ["admin-resource-draft"],
	request: {
		params: z.object({ name: z.string().min(1) }),
		body: { required: true, content: { "application/json": { schema: ProjectAgentCreateInputSchema } } },
	},
	responses: {
		201: {
			description: "智能体声明已保存到批次声明，尚未发布",
			content: {
				"application/json": {
					schema: z.object({
						data: ResourceDraftAgentCreateResultSchema,
					}),
				},
			},
		},
		400: error("智能体参数无效"),
		401: error("管理端未认证"),
		403: error("auditor 不可写"),
		404: error("资源批次不存在"),
		409: error("项目被修改或操作进行中"),
	},
});

@Controller()
export class AdminDraftAgentsController {
	/**
	 * 列出当前批次中可供新智能体引用的共享 Skill 和官方 MCP 服务。
	 *
	 * @param request - 路径参数 `name` 为当前管理员的批次标识。
	 * @return 200，返回当前修订号、可引用的 Skill 清单和官方 MCP 服务名称。
	 */
	@KitRoute(getResourceDraftsByNameResourcesAgentOptionsRoute)
	async getResourceDraftsByNameResourcesAgentOptions(
		@KitInput() request: KitRequest<typeof getResourceDraftsByNameResourcesAgentOptionsRoute>,
	) {
		request.setHeader("Cache-Control", "no-store");
		return request.json({ data: await request.draftResources.agentOptions(request.params.name) }, 200);
	}

	/**
	 * 按指定修订号向当前批次添加智能体声明。
	 *
	 * @param request - 路径参数 `name` 指定批次，JSON 请求体提供 `base_revision`、智能体名称 `name` 和模型 `model`，可附指令及工具配置。
	 * @return 201，返回新修订号及新建智能体的本地标识和名称。
	 */
	@KitRoute(postResourceDraftsByNameResourcesAgentsRoute)
	async postResourceDraftsByNameResourcesAgents(
		@KitInput() request: KitRequest<typeof postResourceDraftsByNameResourcesAgentsRoute>,
	) {
		const project = request.draftResources;
		const { subject } = requireAdmin(request);
		request.setHeader("Cache-Control", "no-store");
		return request.json({ data: await project.createAgent(request.params.name, request.input, subject) }, 201);
	}
}
